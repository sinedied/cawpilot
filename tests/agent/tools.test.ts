import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTools, type ToolContext } from '../../src/agent/tools.js';
import type { Channel } from '../../src/channels/types.js';

function makeChannel(name: string): Channel & { sent: { sender: string; content: string }[] } {
  const sent: { sender: string; content: string }[] = [];
  return {
    name,
    sent,
    async start() {},
    async stop() {},
    async send(sender: string, content: string) {
      sent.push({ sender, content });
    },
  };
}

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
  `);
  return db;
}

describe('agent/tools', () => {
  let db: Database.Database;
  let channels: Map<string, Channel>;
  let cliChannel: ReturnType<typeof makeChannel>;
  let tgChannel: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    db = makeDb();
    cliChannel = makeChannel('cli');
    tgChannel = makeChannel('telegram');
    channels = new Map<string, Channel>();
    channels.set('cli', cliChannel);
    channels.set('telegram', tgChannel);
  });

  function ctx(overrides?: Partial<ToolContext>): ToolContext {
    return {
      db,
      channels,
      workspacePath: '/tmp/test',
      taskId: 'task-1',
      sourceChannel: 'cli',
      sourceSender: 'local',
      ...overrides,
    };
  }

  describe('send_message', () => {
    it('sends to originating channel by default', async () => {
      const tools = buildTools(ctx());
      const result = await tools.send_message.handler({ content: 'hello' });

      expect(result).toEqual({ sent: true, channel: 'cli' });
      expect(cliChannel.sent).toHaveLength(1);
      expect(cliChannel.sent[0].content).toBe('hello');
    });

    it('sends to a different channel when specified', async () => {
      const tools = buildTools(ctx());
      const result = await tools.send_message.handler({
        content: 'hi telegram',
        channel: 'telegram',
        sender: '12345',
      });

      expect(result).toEqual({ sent: true, channel: 'telegram' });
      expect(tgChannel.sent).toHaveLength(1);
      expect(tgChannel.sent[0]).toEqual({ sender: '12345', content: 'hi telegram' });
      expect(cliChannel.sent).toHaveLength(0);
    });

    it('returns error for unknown channel', async () => {
      const tools = buildTools(ctx());
      const result = await tools.send_message.handler({
        content: 'test',
        channel: 'discord',
      });

      expect(result).toEqual({ sent: false, error: 'Channel "discord" not found' });
    });
  });

  describe('list_channels', () => {
    it('lists all connected channels', async () => {
      const tools = buildTools(ctx());
      const result = await tools.list_channels.handler({});

      expect(result.channels).toContain('cli');
      expect(result.channels).toContain('telegram');
      expect(result.source).toBe('cli');
    });
  });

  describe('update_task_status', () => {
    it('updates task status in database', async () => {
      db.prepare(`INSERT INTO tasks (id, title) VALUES ('task-1', 'Test')`).run();

      const tools = buildTools(ctx());
      const result = await tools.update_task_status.handler({
        taskId: 'task-1',
        status: 'completed',
        result: 'Done!',
      });

      expect(result).toEqual({ updated: true });

      const row = db.prepare('SELECT status, result FROM tasks WHERE id = ?').get('task-1') as {
        status: string;
        result: string;
      };
      expect(row.status).toBe('completed');
      expect(row.result).toBe('Done!');
    });
  });
});
