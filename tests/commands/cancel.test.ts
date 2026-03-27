import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTask, getTaskById, updateTaskStatus } from '../../src/db/tasks.js';
import { handleCancelCommand } from '../../src/commands/cancel.js';
import type { Channel } from '../../src/channels/types.js';
import type { CommandContext } from '../../src/commands/handler.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL DEFAULT '',
      result TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      sender TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'unprocessed',
      task_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function makeChannel(): Channel & { sent: string[] } {
  const sent: string[] = [];
  return {
    name: 'cli',
    canPushMessages: true,
    sent,
    async start() {},
    async stop() {},
    async send(_sender, content) {
      sent.push(content);
    },
  };
}

describe('commands/cancel', () => {
  let db: Database.Database;
  let channel: ReturnType<typeof makeChannel>;
  let cancelTask: ReturnType<typeof vi.fn>;
  let ctx: CommandContext;

  beforeEach(() => {
    db = makeDb();
    channel = makeChannel();
    cancelTask = vi.fn(async (taskId: string) => {
      const task = getTaskById(db, taskId);
      if (!task) return false;
      updateTaskStatus(db, taskId, 'cancelled', 'Cancelled by test');
      return true;
    });

    ctx = {
      config: {
        channels: [],
        repos: [],
        skills: [],
        maxConcurrency: 1,
        contextMessagesCount: 10,
        cleanupIntervalDays: 7,
        persistence: { enabled: false, repo: '', backupIntervalDays: 1 },
        web: { setupEnabled: false },
        model: 'gpt-4.1',
        workspacePath: '/tmp/workspace',
      },
      db,
      channels: new Map([['cli', channel]]),
      orchestrator: {
        cancelTask,
      } as CommandContext['orchestrator'],
      startTime: Date.now(),
    };
  });

  it('cancels all active tasks', async () => {
    const pendingA = createTask(db, 'Pending A');
    const pendingB = createTask(db, 'Pending B');
    const running = createTask(db, 'Running');
    updateTaskStatus(db, running.id, 'in-progress');

    await handleCancelCommand('cli', 'local', ['all'], ctx);

    expect(cancelTask).toHaveBeenCalledTimes(3);
    expect(cancelTask).toHaveBeenCalledWith(pendingA.id);
    expect(cancelTask).toHaveBeenCalledWith(pendingB.id);
    expect(cancelTask).toHaveBeenCalledWith(running.id);
    expect(channel.sent).toEqual(['🚫 Cancelled 3 active task(s).']);
  });

  it('reports when there are no active tasks to cancel', async () => {
    await handleCancelCommand('cli', 'local', ['all'], ctx);

    expect(cancelTask).not.toHaveBeenCalled();
    expect(channel.sent).toEqual(['No active tasks to cancel.']);
  });
});