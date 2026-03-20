import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Attachment } from '../channels/types.js';

export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  channel: string;
  sender: string;
  role: MessageRole;
  content: string;
  attachments: Attachment[];
  status: 'unprocessed' | 'processing' | 'processed';
  taskId: string | undefined;
  createdAt: string;
};

// SQLite returns null for missing values
/* eslint-disable @typescript-eslint/no-restricted-types */
type MessageRow = {
  id: string;
  channel: string;
  sender: string;
  role: string;
  content: string;
  attachments: string;
  status: string;
  task_id: string | null;
  created_at: string;
};
/* eslint-enable @typescript-eslint/no-restricted-types */

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channel: row.channel,
    sender: row.sender,
    role: row.role as MessageRole,
    content: row.content,
    attachments: JSON.parse(row.attachments) as Attachment[],
    status: row.status as Message['status'],
    taskId: row.task_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function createMessage(
  db: Database.Database,
  channel: string,
  sender: string,
  content: string,
  attachments: Attachment[] = [],
): Message {
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO messages (id, channel, sender, role, content, attachments)
    VALUES (?, ?, ?, 'user', ?, ?)
  `,
  ).run(id, channel, sender, content, JSON.stringify(attachments));

  return {
    id,
    channel,
    sender,
    role: 'user',
    content,
    attachments,
    status: 'unprocessed',
    taskId: undefined,
    createdAt: new Date().toISOString(),
  };
}

export function createBotMessage(
  db: Database.Database,
  channel: string,
  recipient: string,
  content: string,
  taskId?: string,
): Message {
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO messages (id, channel, sender, role, content, status, task_id)
    VALUES (?, ?, ?, 'assistant', ?, 'processed', ?)
  `,
  ).run(id, channel, recipient, content, taskId ?? null);

  return {
    id,
    channel,
    sender: recipient,
    role: 'assistant',
    content,
    attachments: [],
    status: 'processed',
    taskId,
    createdAt: new Date().toISOString(),
  };
}

export function getRecentHistory(db: Database.Database, limit = 10): Message[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM messages
    WHERE status IN ('processing', 'processed')
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `,
    )
    .all(limit) as MessageRow[];
  return rows.map(rowToMessage).toReversed();
}

export function getUnprocessedMessages(db: Database.Database): Message[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM messages WHERE status = 'unprocessed' ORDER BY created_at ASC
  `,
    )
    .all() as MessageRow[];
  return rows.map(rowToMessage);
}

export function markMessagesProcessing(
  db: Database.Database,
  ids: string[],
  taskId: string,
): void {
  const stmt = db.prepare(
    `UPDATE messages SET status = 'processing', task_id = ? WHERE id = ?`,
  );
  const tx = db.transaction(() => {
    for (const id of ids) {
      stmt.run(taskId, id);
    }
  });
  tx();
}

export function markMessagesProcessed(
  db: Database.Database,
  taskId: string,
): void {
  db.prepare(`UPDATE messages SET status = 'processed' WHERE task_id = ?`).run(
    taskId,
  );
}

export function getMessagesByTask(
  db: Database.Database,
  taskId: string,
): Message[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC
  `,
    )
    .all(taskId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessagesByIds(
  db: Database.Database,
  ids: string[],
): Message[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...ids) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM messages').get() as {
    count: number;
  };
  return row.count;
}
