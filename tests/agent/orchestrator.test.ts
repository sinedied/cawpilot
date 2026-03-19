import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createTask,
  updateTaskStatus,
  getAllTasks,
} from '../../src/db/tasks.js';
import { archiveCompletedTasks } from '../../src/workspace/cleanup.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
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
  return db;
}

describe('cleanup: archiveCompletedTasks', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = join(tmpdir(), `cawpilot-archive-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archives completed and failed tasks to a dated file', () => {
    const t1 = createTask(db, 'Task A');
    const t2 = createTask(db, 'Task B');
    const t3 = createTask(db, 'Task C (active)');

    updateTaskStatus(db, t1.id, 'completed', 'Done');
    updateTaskStatus(db, t2.id, 'failed', 'Error occurred');

    const count = archiveCompletedTasks(db, tmpDir);
    expect(count).toBe(2);

    const archiveDir = join(tmpDir, '.cawpilot', 'archive');
    expect(existsSync(archiveDir)).toBe(true);

    const dateStr = new Date().toISOString().slice(0, 10);
    const archivePath = join(archiveDir, `TODO-${dateStr}.md`);
    expect(existsSync(archivePath)).toBe(true);

    const content = readFileSync(archivePath, 'utf-8');
    expect(content).toContain('Task A');
    expect(content).toContain('Task B');
    expect(content).not.toContain('Task C');

    const remaining = getAllTasks(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('Task C (active)');
  });

  it('returns 0 when no completed tasks exist', () => {
    createTask(db, 'Active task');

    const count = archiveCompletedTasks(db, tmpDir);
    expect(count).toBe(0);

    const archiveDir = join(tmpDir, '.cawpilot', 'archive');
    expect(existsSync(archiveDir)).toBe(false);
  });

  it('appends to existing archive for the same day', () => {
    const t1 = createTask(db, 'First batch');
    updateTaskStatus(db, t1.id, 'completed', 'Done');

    archiveCompletedTasks(db, tmpDir);

    const t2 = createTask(db, 'Second batch');
    updateTaskStatus(db, t2.id, 'completed', 'Also done');

    archiveCompletedTasks(db, tmpDir);

    const dateStr = new Date().toISOString().slice(0, 10);
    const archivePath = join(
      tmpDir,
      '.cawpilot',
      'archive',
      `TODO-${dateStr}.md`,
    );
    const content = readFileSync(archivePath, 'utf-8');

    expect(content).toContain('First batch');
    expect(content).toContain('Second batch');
  });
});
