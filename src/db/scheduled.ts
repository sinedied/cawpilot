import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type ScheduledTask = {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
};

type ScheduledTaskRow = {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
};

function rowToScheduledTask(row: ScheduledTaskRow): ScheduledTask {
  return {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    prompt: row.prompt,
    enabled: row.enabled === 1,
    lastRun: row.last_run,
    nextRun: row.next_run,
    createdAt: row.created_at,
  };
}

export function createScheduledTask(
  db: Database.Database,
  name: string,
  schedule: string,
  prompt: string,
): ScheduledTask {
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, name, schedule, prompt)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, name, schedule, prompt);

  return {
    id,
    name,
    schedule,
    prompt,
    enabled: true,
    lastRun: null,
    nextRun: null,
    createdAt: new Date().toISOString(),
  };
}

export function getDueScheduledTasks(db: Database.Database): ScheduledTask[] {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE enabled = 1 AND (next_run IS NULL OR next_run <= ?)
    ORDER BY next_run ASC
  `,
    )
    .all(now) as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

export function updateScheduledTaskRun(
  db: Database.Database,
  id: string,
  nextRun: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE scheduled_tasks SET last_run = ?, next_run = ? WHERE id = ?`,
  ).run(now, nextRun, id);
}

export function getAllScheduledTasks(db: Database.Database): ScheduledTask[] {
  const rows = db
    .prepare(`SELECT * FROM scheduled_tasks ORDER BY name ASC`)
    .all() as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

export function toggleScheduledTask(
  db: Database.Database,
  id: string,
  enabled: boolean,
): void {
  db.prepare(`UPDATE scheduled_tasks SET enabled = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    id,
  );
}
