import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMessage } from '../../src/db/messages.js';
import { createTask, updateTaskStatus } from '../../src/db/tasks.js';
import { MessageIntakeService } from '../../src/agent/message-intake-service.js';
import type { Channel } from '../../src/channels/types.js';

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

describe('agent/message-intake-service', () => {
  let db: Database.Database;
  let channel: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    db = makeDb();
    channel = makeChannel();
  });

  it('notifies the sender once when all task slots are full and the request is queued', async () => {
    const runningTask = createTask(db, 'Oldest running task');
    updateTaskStatus(db, runningTask.id, 'in-progress');
    createMessage(db, 'cli', 'local', 'Queue this request');

    const service = new MessageIntakeService(
      {
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
      new Map([['cli', channel]]),
      () => 0,
      vi.fn(),
    );

    await (
      service as unknown as { processMessages: () => Promise<void> }
    ).processMessages();
    await (
      service as unknown as { processMessages: () => Promise<void> }
    ).processMessages();

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]).toContain('queued your request');
    expect(channel.sent[0]).toContain(runningTask.id.slice(0, 8));
  });
});