import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMessage,
  createBotMessage,
  getUnprocessedMessages,
  getRecentHistory,
  markMessagesProcessing,
  markMessagesProcessed,
  getMessagesByTask,
  getMessageCount,
} from '../../src/db/messages.js';
import { getDb, closeDb } from '../../src/db/client.js';

describe('db/messages', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
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
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        title TEXT NOT NULL DEFAULT '',
        result TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  it('creates a message with correct defaults', () => {
    const msg = createMessage(db, 'cli', 'local', 'hello');
    expect(msg.id).toBeDefined();
    expect(msg.channel).toBe('cli');
    expect(msg.sender).toBe('local');
    expect(msg.content).toBe('hello');
    expect(msg.attachments).toEqual([]);
    expect(msg.status).toBe('unprocessed');
    expect(msg.taskId).toBeUndefined();
  });

  it('creates a message with attachments', () => {
    const msg = createMessage(db, 'telegram', 'user1', 'check this', [
      'file.jpg',
    ]);
    expect(msg.attachments).toEqual(['file.jpg']);
  });

  it('retrieves unprocessed messages in order', () => {
    createMessage(db, 'cli', 'local', 'first');
    createMessage(db, 'cli', 'local', 'second');
    createMessage(db, 'telegram', 'user1', 'third');

    const msgs = getUnprocessedMessages(db);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe('first');
    expect(msgs[2].content).toBe('third');
  });

  it('returns empty array when no unprocessed messages', () => {
    const msgs = getUnprocessedMessages(db);
    expect(msgs).toEqual([]);
  });

  it('marks messages as processing with task ID', () => {
    const m1 = createMessage(db, 'cli', 'local', 'msg1');
    const m2 = createMessage(db, 'cli', 'local', 'msg2');
    createMessage(db, 'cli', 'local', 'msg3');

    markMessagesProcessing(db, [m1.id, m2.id], 'task-1');

    const unprocessed = getUnprocessedMessages(db);
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].content).toBe('msg3');

    const taskMsgs = getMessagesByTask(db, 'task-1');
    expect(taskMsgs).toHaveLength(2);
    expect(taskMsgs[0].status).toBe('processing');
  });

  it('marks messages as processed by task ID', () => {
    const m1 = createMessage(db, 'cli', 'local', 'msg1');
    markMessagesProcessing(db, [m1.id], 'task-1');
    markMessagesProcessed(db, 'task-1');

    const taskMsgs = getMessagesByTask(db, 'task-1');
    expect(taskMsgs).toHaveLength(1);
    expect(taskMsgs[0].status).toBe('processed');
  });

  it('counts all messages', () => {
    expect(getMessageCount(db)).toBe(0);
    createMessage(db, 'cli', 'local', 'a');
    createMessage(db, 'cli', 'local', 'b');
    expect(getMessageCount(db)).toBe(2);
  });

  it('creates a user message with role user', () => {
    const msg = createMessage(db, 'cli', 'local', 'hello');
    expect(msg.role).toBe('user');
  });

  it('creates a bot message with role assistant', () => {
    const msg = createBotMessage(db, 'cli', 'local', 'reply', 'task-1');
    expect(msg.role).toBe('assistant');
    expect(msg.status).toBe('processed');
    expect(msg.taskId).toBe('task-1');
  });

  it('creates a bot message without task ID', () => {
    const msg = createBotMessage(db, 'cli', 'local', 'hi');
    expect(msg.role).toBe('assistant');
    expect(msg.taskId).toBeUndefined();
  });

  it('retrieves recent history in chronological order', () => {
    const m1 = createMessage(db, 'cli', 'local', 'first');
    markMessagesProcessing(db, [m1.id], 'task-1');
    createBotMessage(db, 'cli', 'local', 'reply to first', 'task-1');

    const history = getRecentHistory(db, 10);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('first');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toBe('reply to first');
  });

  it('limits history to requested count', () => {
    for (let i = 0; i < 5; i++) {
      const m = createMessage(db, 'cli', 'local', `msg-${i}`);
      markMessagesProcessing(db, [m.id], `task-${i}`);
    }

    const history = getRecentHistory(db, 3);
    expect(history).toHaveLength(3);
  });

  it('excludes unprocessed messages from history', () => {
    createMessage(db, 'cli', 'local', 'unprocessed');
    createBotMessage(db, 'cli', 'local', 'bot reply');

    const history = getRecentHistory(db, 10);
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('assistant');
  });
});
