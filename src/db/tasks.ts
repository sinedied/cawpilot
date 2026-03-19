import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'need-info';

export interface Task {
  id: string;
  status: TaskStatus;
  title: string;
  result: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: string;
  status: string;
  title: string;
  result: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    status: row.status as TaskStatus,
    title: row.title,
    result: row.result,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTask(db: Database.Database, title: string): Task {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO tasks (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, title, now, now);

  return {
    id,
    status: 'pending',
    title,
    result: null,
    sessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTaskStatus(
  db: Database.Database,
  taskId: string,
  status: TaskStatus,
  result?: string,
): void {
  const now = new Date().toISOString();
  if (result === undefined) {
    db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`).run(
      status,
      now,
      taskId,
    );
  } else {
    db.prepare(
      `UPDATE tasks SET status = ?, result = ?, updated_at = ? WHERE id = ?`,
    ).run(status, result, now, taskId);
  }
}

export function setTaskSessionId(
  db: Database.Database,
  taskId: string,
  sessionId: string,
): void {
  db.prepare(
    `UPDATE tasks SET session_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(sessionId, taskId);
}

export function getActiveTasks(db: Database.Database): Task[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM tasks WHERE status IN ('pending', 'in-progress', 'need-info')
    ORDER BY created_at ASC
  `,
    )
    .all() as TaskRow[];
  return rows.map(rowToTask);
}

export function getAllTasks(db: Database.Database): Task[] {
  const rows = db
    .prepare(`SELECT * FROM tasks ORDER BY created_at DESC`)
    .all() as TaskRow[];
  return rows.map(rowToTask);
}

export function getTaskById(
  db: Database.Database,
  taskId: string,
): Task | undefined {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as
    | TaskRow
    | undefined;
  return row ? rowToTask(row) : undefined;
}

export function getTaskCounts(
  db: Database.Database,
): Record<TaskStatus | 'total', number> {
  const rows = db
    .prepare(
      `
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `,
    )
    .all() as Array<{ status: string; count: number }>;

  const counts: Record<string, number> = {
    total: 0,
    pending: 0,
    'in-progress': 0,
    completed: 0,
    failed: 0,
    'need-info': 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }

  return counts as Record<TaskStatus | 'total', number>;
}
