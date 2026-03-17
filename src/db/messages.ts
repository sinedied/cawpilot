import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Message {
  id: string;
  channel: string;
  sender: string;
  content: string;
  attachments: string[];
  status: 'unprocessed' | 'processing' | 'processed';
  taskId: string | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  channel: string;
  sender: string;
  content: string;
  attachments: string;
  status: string;
  task_id: string | null;
  created_at: string;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channel: row.channel,
    sender: row.sender,
    content: row.content,
    attachments: JSON.parse(row.attachments) as string[],
    status: row.status as Message['status'],
    taskId: row.task_id,
    createdAt: row.created_at,
  };
}

export function createMessage(
  db: Database.Database,
  channel: string,
  sender: string,
  content: string,
  attachments: string[] = [],
): Message {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO messages (id, channel, sender, content, attachments)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, channel, sender, content, JSON.stringify(attachments));

  return {
    id,
    channel,
    sender,
    content,
    attachments,
    status: 'unprocessed',
    taskId: null,
    createdAt: new Date().toISOString(),
  };
}

export function getUnprocessedMessages(db: Database.Database): Message[] {
  const rows = db.prepare(`
    SELECT * FROM messages WHERE status = 'unprocessed' ORDER BY created_at ASC
  `).all() as MessageRow[];
  return rows.map(rowToMessage);
}

export function markMessagesProcessing(db: Database.Database, ids: string[], taskId: string): void {
  const stmt = db.prepare(`UPDATE messages SET status = 'processing', task_id = ? WHERE id = ?`);
  const tx = db.transaction(() => {
    for (const id of ids) {
      stmt.run(taskId, id);
    }
  });
  tx();
}

export function markMessagesProcessed(db: Database.Database, taskId: string): void {
  db.prepare(`UPDATE messages SET status = 'processed' WHERE task_id = ?`).run(taskId);
}

export function getMessagesByTask(db: Database.Database, taskId: string): Message[] {
  const rows = db.prepare(`
    SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC
  `).all(taskId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
  return row.count;
}
