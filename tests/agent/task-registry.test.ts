import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { createMessage, getMessagesByTask, markMessagesProcessing } from '../../src/db/messages.js';
import { createTask, getTaskById, updateTaskStatus } from '../../src/db/tasks.js';
import { TaskRegistry } from '../../src/agent/task-registry.js';

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

describe('agent/task-registry', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('reconciles stale active tasks that are no longer tracked in the runtime', () => {
    const staleTask = createTask(db, 'Stale task');
    const staleMessage = createMessage(db, 'cli', 'local', 'stale');
    markMessagesProcessing(db, [staleMessage.id], staleTask.id);
    updateTaskStatus(db, staleTask.id, 'in-progress');

    const liveTask = createTask(db, 'Live task');
    const liveMessage = createMessage(db, 'cli', 'local', 'live');
    markMessagesProcessing(db, [liveMessage.id], liveTask.id);
    updateTaskStatus(db, liveTask.id, 'in-progress');

    const registry = new TaskRegistry(db);
    registry.trackTask(liveTask.id, Promise.resolve());

    const recovered = registry.reconcileActiveTasks();

    expect(recovered).toBe(1);
    expect(getTaskById(db, staleTask.id)?.status).toBe('completed');
    expect(getTaskById(db, staleTask.id)?.result).toContain('Automatically completed during recovery');
    expect(getMessagesByTask(db, staleTask.id)[0].status).toBe('processed');
    expect(getTaskById(db, liveTask.id)?.status).toBe('in-progress');
  });
});