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

  it('has canPushMessages = true', () => {
    const tg = new TelegramChannel('fake-token', []);
    expect(tg.canPushMessages).toBe(true);
  });

  it('waitForInput resolves when called externally', async () => {
    const tg = new TelegramChannel('fake-token', ['12345']);

    // Start waiting for input from sender 12345
    const inputPromise = tg.waitForInput('12345');

    // Access private pendingInputs to simulate a message arriving
    const pendingInputs = (tg as unknown as { pendingInputs: Map<string, (v: string) => void> }).pendingInputs;
    expect(pendingInputs.has('12345')).toBe(true);

    // Simulate resolving (as the text message handler would)
    pendingInputs.get('12345')!('user reply');
    pendingInputs.delete('12345');

    const answer = await inputPromise;
    expect(answer).toBe('user reply');
    expect(pendingInputs.has('12345')).toBe(false);
  });
});
