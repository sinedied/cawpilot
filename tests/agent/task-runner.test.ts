import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMessage, getMessagesByTask, markMessagesProcessing } from '../../src/db/messages.js';
import { createTask, getTaskById, updateTaskStatus } from '../../src/db/tasks.js';
import type { Channel } from '../../src/channels/types.js';

const { createTaskSessionMock } = vi.hoisted(() => ({
  createTaskSessionMock: vi.fn(),
}));

vi.mock('../../src/agent/runtime.js', () => ({
  createTaskSession: createTaskSessionMock,
}));

import { runTask } from '../../src/agent/task-runner.js';

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

function makeSession(overrides?: Partial<Record<string, unknown>>) {
  return {
    sessionId: 'session-1',
    send: vi.fn(async () => undefined),
    sendAndWait: vi.fn(async () => undefined),
    on: vi.fn(() => () => {}),
    abort: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('agent/task-runner', () => {
  let db: Database.Database;
  let channel: ReturnType<typeof makeChannel>;
  let channels: Map<string, Channel>;

  beforeEach(() => {
    db = makeDb();
    channel = makeChannel();
    channels = new Map([['cli', channel]]);
    createTaskSessionMock.mockReset();
  });

  it('auto-completes a task when the session finishes without an explicit status update', async () => {
    const task = createTask(db, 'Finish cleanly');
    const message = createMessage(db, 'cli', 'local', 'Finish the work');
    markMessagesProcessing(db, [message.id], task.id);

    createTaskSessionMock.mockResolvedValue(makeSession());

    await runTask({
      task,
      config: {
        channels: [],
        repos: [],
        skills: [],
        maxConcurrency: 1,
        contextMessagesCount: 10,
        cleanupIntervalDays: 7,
        persistence: { enabled: false, repo: '', backupIntervalDays: 1 },
        web: { setupEnabled: false },
        models: { orchestrator: 'gpt-4.1', task: 'gpt-4.1' },
        workspacePath: '/tmp/workspace',
      },
      db,
      channels,
    });

    const updated = getTaskById(db, task.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toBe('Task completed without an explicit status update.');
    expect(getMessagesByTask(db, task.id).every((entry) => entry.status === 'processed')).toBe(true);
  });

  it('keeps a completed task settled when a late disconnect error happens', async () => {
    const task = createTask(db, 'Already completed');
    const message = createMessage(db, 'cli', 'local', 'Do the work');
    markMessagesProcessing(db, [message.id], task.id);

    createTaskSessionMock.mockResolvedValue(
      makeSession({
        send: vi.fn(async () => {
          updateTaskStatus(db, task.id, 'completed', 'Done already');
          return undefined;
        }),
        disconnect: vi.fn(async () => {
          throw new Error('AI error');
        }),
      }),
    );

    await runTask({
      task,
      config: {
        channels: [],
        repos: [],
        skills: [],
        maxConcurrency: 1,
        contextMessagesCount: 10,
        cleanupIntervalDays: 7,
        persistence: { enabled: false, repo: '', backupIntervalDays: 1 },
        web: { setupEnabled: false },
        models: { orchestrator: 'gpt-4.1', task: 'gpt-4.1' },
        workspacePath: '/tmp/workspace',
      },
      db,
      channels,
    });

    const updated = getTaskById(db, task.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toBe('Done already');
    expect(channel.sent).toHaveLength(0);
  });
});