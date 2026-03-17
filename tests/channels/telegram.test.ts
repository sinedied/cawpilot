import { describe, it, expect, vi } from 'vitest';
import type { Channel } from '../../src/channels/types.js';
import { TelegramChannel } from '../../src/channels/telegram.js';

describe('channels/telegram', () => {
  it('rejects messages from unlinked senders', async () => {
    // Create a channel with an empty allow list (no token needed if we don't start)
    const tg = new TelegramChannel('fake-token', []);
    expect(tg.isLinked('12345')).toBe(false);
  });

  it('accepts messages from allow-listed senders', () => {
    const tg = new TelegramChannel('fake-token', ['12345']);
    expect(tg.isLinked('12345')).toBe(true);
    expect(tg.isLinked('99999')).toBe(false);
  });

  it('adds sender to allow list', () => {
    const tg = new TelegramChannel('fake-token', []);
    expect(tg.isLinked('12345')).toBe(false);

    tg.addToAllowList('12345');
    expect(tg.isLinked('12345')).toBe(true);
  });

  it('returns the allow list', () => {
    const tg = new TelegramChannel('fake-token', ['aaa', 'bbb']);
    const list = tg.getAllowList();
    expect(list).toContain('aaa');
    expect(list).toContain('bbb');
    expect(list).toHaveLength(2);
  });
});
