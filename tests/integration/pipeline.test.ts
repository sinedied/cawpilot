import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMessage, getUnprocessedMessages, getMessagesByTask, markMessagesProcessing } from '../../src/db/messages.js';
import { createTask, updateTaskStatus, getActiveTasks, getTaskById } from '../../src/db/tasks.js';
import { createScheduledTask, getDueScheduledTasks, updateScheduledTaskRun, getAllScheduledTasks } from '../../src/db/scheduled.js';
import { saveConfig, loadConfig, type CawpilotConfig } from '../../src/workspace/config.js';
import { ensureWorkspace } from '../../src/workspace/manager.js';

/**
 * Integration tests that exercise multiple modules together:
 * - Messages → Tasks pipeline
 * - Config save/load round-trip with workspace
 * - Scheduled task lifecycle
 */

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'unprocessed',
      task_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL DEFAULT '',
      result TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('integration: message → task pipeline', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates messages, groups into task, processes to completion', () => {
    // Simulate incoming messages
    const m1 = createMessage(db, 'cli', 'local', 'Fix the login page');
    const m2 = createMessage(db, 'cli', 'local', 'Also update the footer');

    // Verify unprocessed
    const unprocessed = getUnprocessedMessages(db);
    expect(unprocessed).toHaveLength(2);

    // Create a task grouping these messages
    const task = createTask(db, 'Fix login page and footer');
    expect(task.status).toBe('pending');

    // Link messages to task
    markMessagesProcessing(db, [m1.id, m2.id], task.id);

    // Verify messages linked
    const taskMsgs = getMessagesByTask(db, task.id);
    expect(taskMsgs).toHaveLength(2);
    expect(taskMsgs[0].status).toBe('processing');

    // Now no unprocessed messages remain
    expect(getUnprocessedMessages(db)).toHaveLength(0);

    // Update task through its lifecycle
    updateTaskStatus(db, task.id, 'in-progress');
    let active = getActiveTasks(db);
    expect(active).toHaveLength(1);

    updateTaskStatus(db, task.id, 'completed', 'PR created: https://github.com/...');
    active = getActiveTasks(db);
    expect(active).toHaveLength(0);

    const final = getTaskById(db, task.id);
    expect(final?.status).toBe('completed');
    expect(final?.result).toContain('PR created');
  });

  it('handles need-info status for follow-up questions', () => {
    const m1 = createMessage(db, 'telegram', 'user1', 'Deploy the app');
    const task = createTask(db, 'Deploy');

    markMessagesProcessing(db, [m1.id], task.id);
    updateTaskStatus(db, task.id, 'need-info');

    const active = getActiveTasks(db);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe('need-info');

    // User responds — new message gets linked
    const m2 = createMessage(db, 'telegram', 'user1', 'Deploy to staging');
    markMessagesProcessing(db, [m2.id], task.id);

    const taskMsgs = getMessagesByTask(db, task.id);
    expect(taskMsgs).toHaveLength(2);
  });
});

describe('integration: workspace config round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cawpilot-integ-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets up workspace, saves config, loads it back', () => {
    ensureWorkspace(tmpDir);

    const config: CawpilotConfig = {
      channels: [
        { type: 'telegram', enabled: true, telegramToken: 'tok', allowList: ['123'] },
        { type: 'http', enabled: true, httpPort: 4000, httpApiKey: 'key123' },
      ],
      repos: ['owner/repo1', 'owner/repo2'],
      skills: ['local-tunnel'],
      maxConcurrency: 4,
      persistence: { enabled: true, repo: 'user/my-cawpilot' },
      model: 'claude-sonnet-4.5',
      workspacePath: tmpDir,
    };

    saveConfig(config);
    const loaded = loadConfig(tmpDir);

    expect(loaded.channels).toHaveLength(2);
    expect(loaded.channels[0].allowList).toEqual(['123']);
    expect(loaded.channels[1].httpApiKey).toBe('key123');
    expect(loaded.repos).toEqual(['owner/repo1', 'owner/repo2']);
    expect(loaded.model).toBe('claude-sonnet-4.5');
    expect(loaded.maxConcurrency).toBe(4);
    expect(loaded.workspacePath).toBe(tmpDir);
  });
});

describe('integration: scheduled task lifecycle', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates scheduled task, runs it, schedules next run', () => {
    const task = createScheduledTask(db, 'Daily standup', '1440', 'Give standup summary');

    // Initially due (next_run is null)
    let due = getDueScheduledTasks(db);
    expect(due).toHaveLength(1);

    // Simulate running it
    const nextRun = new Date(Date.now() + 1440 * 60_000).toISOString();
    updateScheduledTaskRun(db, task.id, nextRun);

    // No longer due
    due = getDueScheduledTasks(db);
    expect(due).toHaveLength(0);

    // Verify last_run is set
    const all = getAllScheduledTasks(db);
    expect(all[0].lastRun).toBeDefined();
    expect(all[0].nextRun).toBe(nextRun);
  });
});
