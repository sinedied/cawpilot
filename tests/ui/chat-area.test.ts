import { describe, it, expect } from 'vitest';
import {
  flattenMessages,
  computeVisibleRange,
  type ChatMessage,
} from '../../src/ui/chat-area.js';

describe('flattenMessages', () => {
  it('splits a single bot message with no newlines into one line', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: 'hello' }];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toEqual([{ prefix: 'bot', text: 'hello' }]);
  });

  it('splits a bot message with newlines into multiple lines', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: 'line1\nline2\nline3' }];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toEqual([
      { prefix: 'bot', text: 'line1' },
      { prefix: 'bot-cont', text: 'line2' },
      { prefix: 'bot-cont', text: 'line3' },
    ]);
  });

  it('marks user messages with user prefix', () => {
    const msgs: ChatMessage[] = [{ sender: 'user', content: 'hi\nthere' }];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toEqual([
      { prefix: 'user', text: 'hi' },
      { prefix: 'user', text: 'there' },
    ]);
  });

  it('truncates lines longer than maxWidth', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: 'a'.repeat(100) }];
    const lines = flattenMessages(msgs, 20);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toHaveLength(20);
    expect(lines[0].text.endsWith('…')).toBe(true);
  });

  it('does not truncate lines at exactly maxWidth', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: 'a'.repeat(20) }];
    const lines = flattenMessages(msgs, 20);
    expect(lines[0].text).toBe('a'.repeat(20));
  });

  it('handles multiple messages in order', () => {
    const msgs: ChatMessage[] = [
      { sender: 'user', content: 'question' },
      { sender: 'bot', content: 'answer' },
    ];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toEqual([
      { prefix: 'user', text: 'question' },
      { prefix: 'bot', text: 'answer' },
    ]);
  });

  it('handles empty message content', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: '' }];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toEqual([{ prefix: 'bot', text: '' }]);
  });

  it('handles message with only newlines', () => {
    const msgs: ChatMessage[] = [{ sender: 'bot', content: '\n\n' }];
    const lines = flattenMessages(msgs, 80);
    expect(lines).toHaveLength(3);
    expect(lines[0].prefix).toBe('bot');
    expect(lines[1].prefix).toBe('bot-cont');
    expect(lines[2].prefix).toBe('bot-cont');
  });

  it('handles empty messages array', () => {
    const lines = flattenMessages([], 80);
    expect(lines).toEqual([]);
  });
});

describe('computeVisibleRange', () => {
  it('shows all lines when fewer than height', () => {
    const { start, end } = computeVisibleRange(3, 10, 0);
    expect(start).toBe(0);
    expect(end).toBe(3);
  });

  it('shows last height lines when at bottom (offset=0)', () => {
    const { start, end } = computeVisibleRange(20, 5, 0);
    expect(start).toBe(15);
    expect(end).toBe(20);
  });

  it('scrolls up when offset is positive', () => {
    const { start, end } = computeVisibleRange(20, 5, 3);
    expect(start).toBe(12);
    expect(end).toBe(17);
  });

  it('clamps offset to not scroll past the beginning', () => {
    const { start, end } = computeVisibleRange(20, 5, 100);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  it('clamps negative offset to 0', () => {
    const { start, end } = computeVisibleRange(20, 5, -5);
    expect(start).toBe(15);
    expect(end).toBe(20);
  });

  it('handles totalLines=0', () => {
    const { start, end } = computeVisibleRange(0, 5, 0);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });

  it('handles height=1', () => {
    const { start, end } = computeVisibleRange(10, 1, 0);
    expect(start).toBe(9);
    expect(end).toBe(10);
  });

  it('handles height=1 scrolled up', () => {
    const { start, end } = computeVisibleRange(10, 1, 5);
    expect(start).toBe(4);
    expect(end).toBe(5);
  });

  it('handles totalLines equal to height', () => {
    const { start, end } = computeVisibleRange(5, 5, 0);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  it('scrolling up by 1 from bottom moves window by 1', () => {
    const bottom = computeVisibleRange(20, 5, 0);
    const scrolled = computeVisibleRange(20, 5, 1);
    expect(scrolled.start).toBe(bottom.start - 1);
    expect(scrolled.end).toBe(bottom.end - 1);
  });

  it('fully scrolled to top shows first height lines', () => {
    const { start, end } = computeVisibleRange(20, 5, 15);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });
});
