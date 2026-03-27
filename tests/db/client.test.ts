import Database from 'better-sqlite3';
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { closeDb, getDb } from '../../src/db/client.js';

describe('db/client', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDb();

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates messages.task_id to ON DELETE CASCADE', () => {
    const workspacePath = join(tmpdir(), `cawpilot-db-${randomUUID()}`);
    const dbPath = join(workspacePath, 'data.sqlite');
    tempDirs.push(workspacePath);
    mkdirSync(workspacePath, { recursive: true });

    const legacyDb = new Database(dbPath);
    legacyDb.pragma('foreign_keys = ON');
    legacyDb.exec(`
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
    `);
    legacyDb.prepare(`INSERT INTO tasks (id, title) VALUES (?, ?)`).run('t1', 'Task');
    legacyDb.prepare(
      `INSERT INTO messages (id, channel, sender, content, task_id) VALUES (?, ?, ?, ?, ?)`,
    ).run('m1', 'cli', 'local', 'Task message', 't1');
    legacyDb.close();

    const migratedDb = getDb(dbPath);
    const foreignKeys = migratedDb
      .prepare(`PRAGMA foreign_key_list(messages)`)
      .all() as Array<{ from: string; on_delete: string }>;

    expect(
      foreignKeys.find((foreignKey) => foreignKey.from === 'task_id')
        ?.on_delete,
    ).toBe('CASCADE');

    migratedDb.prepare(`DELETE FROM tasks WHERE id = ?`).run('t1');
    const remainingMessages = migratedDb
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE task_id = ?`)
      .get('t1') as { count: number };
    expect(remainingMessages.count).toBe(0);
  });
});