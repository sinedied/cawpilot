import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTask,
  updateTaskStatus,
  setTaskSessionId,
  getActiveTasks,
  getAllTasks,
  getTaskById,
  getTaskCounts,
} from '../../src/db/tasks.js';

describe('db/tasks', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
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
  });

  it('creates a task with pending status', () => {
    const task = createTask(db, 'Fix the bug');
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Fix the bug');
    expect(task.status).toBe('pending');
    expect(task.result).toBeNull();
    expect(task.sessionId).toBeNull();
  });

  it('updates task status', () => {
    const task = createTask(db, 'Test task');
    updateTaskStatus(db, task.id, 'in-progress');

    const updated = getTaskById(db, task.id);
    expect(updated?.status).toBe('in-progress');
  });

  it('updates task status with result', () => {
    const task = createTask(db, 'Test task');
    updateTaskStatus(db, task.id, 'completed', 'All done');

    const updated = getTaskById(db, task.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toBe('All done');
  });

  it('sets session ID on a task', () => {
    const task = createTask(db, 'Test task');
    setTaskSessionId(db, task.id, 'session-abc');

    const updated = getTaskById(db, task.id);
    expect(updated?.sessionId).toBe('session-abc');
  });

  it('retrieves only active tasks', () => {
    const t1 = createTask(db, 'Active 1');
    const t2 = createTask(db, 'Active 2');
    const t3 = createTask(db, 'Done');

    updateTaskStatus(db, t2.id, 'in-progress');
    updateTaskStatus(db, t3.id, 'completed');

    const active = getActiveTasks(db);
    expect(active).toHaveLength(2);
    expect(active.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it('returns all tasks', () => {
    createTask(db, 'First');
    createTask(db, 'Second');
    createTask(db, 'Third');

    const all = getAllTasks(db);
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.title)).toContain('First');
    expect(all.map((t) => t.title)).toContain('Third');
  });

  it('returns undefined for non-existent task', () => {
    const task = getTaskById(db, 'nonexistent');
    expect(task).toBeUndefined();
  });

  it('counts tasks by status', () => {
    const t1 = createTask(db, 'A');
    const t2 = createTask(db, 'B');
    const t3 = createTask(db, 'C');

    updateTaskStatus(db, t1.id, 'completed');
    updateTaskStatus(db, t2.id, 'failed');

    const counts = getTaskCounts(db);
    expect(counts.total).toBe(3);
    expect(counts.completed).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.pending).toBe(1);
  });
});
