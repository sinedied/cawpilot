import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createScheduledTask,
  getDueScheduledTasks,
  updateScheduledTaskRun,
  getAllScheduledTasks,
  toggleScheduledTask,
} from '../../src/db/scheduled.js';

describe('db/scheduled', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
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
  });

  it('creates a scheduled task', () => {
    const task = createScheduledTask(db, 'Daily standup', '60', 'Run standup');
    expect(task.id).toBeDefined();
    expect(task.name).toBe('Daily standup');
    expect(task.schedule).toBe('60');
    expect(task.prompt).toBe('Run standup');
    expect(task.enabled).toBe(true);
    expect(task.lastRun).toBeNull();
    expect(task.nextRun).toBeNull();
  });

  it('returns due scheduled tasks (next_run is null)', () => {
    createScheduledTask(db, 'Task A', '60', 'Do A');
    createScheduledTask(db, 'Task B', '30', 'Do B');

    const due = getDueScheduledTasks(db);
    expect(due).toHaveLength(2);
  });

  it('returns due scheduled tasks (next_run in past)', () => {
    const task = createScheduledTask(db, 'Task A', '60', 'Do A');
    const pastDate = new Date(Date.now() - 1000).toISOString();
    updateScheduledTaskRun(db, task.id, pastDate);

    const due = getDueScheduledTasks(db);
    expect(due).toHaveLength(1);
  });

  it('does not return tasks with future next_run', () => {
    const task = createScheduledTask(db, 'Task A', '60', 'Do A');
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    updateScheduledTaskRun(db, task.id, futureDate);

    const due = getDueScheduledTasks(db);
    expect(due).toHaveLength(0);
  });

  it('does not return disabled tasks', () => {
    const task = createScheduledTask(db, 'Disabled', '60', 'X');
    toggleScheduledTask(db, task.id, false);

    const due = getDueScheduledTasks(db);
    expect(due).toHaveLength(0);
  });

  it('toggles task enabled state', () => {
    const task = createScheduledTask(db, 'Task', '60', 'X');
    expect(task.enabled).toBe(true);

    toggleScheduledTask(db, task.id, false);
    let all = getAllScheduledTasks(db);
    expect(all[0].enabled).toBe(false);

    toggleScheduledTask(db, task.id, true);
    all = getAllScheduledTasks(db);
    expect(all[0].enabled).toBe(true);
  });

  it('lists all scheduled tasks sorted by name', () => {
    createScheduledTask(db, 'Zebra', '60', 'Z');
    createScheduledTask(db, 'Alpha', '30', 'A');
    createScheduledTask(db, 'Middle', '45', 'M');

    const all = getAllScheduledTasks(db);
    expect(all).toHaveLength(3);
    expect(all[0].name).toBe('Alpha');
    expect(all[2].name).toBe('Zebra');
  });
});
