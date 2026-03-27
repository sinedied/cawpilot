import { describe, it, expect } from 'vitest';
import {
  filterPrintableInput,
  sanitizeValue,
} from '../../src/ui/input-line.js';

describe('input filtering (useInput handler)', () => {
  it('passes normal printable text', () => {
    expect(filterPrintableInput('hello')).toBe('hello');
  });

  it('passes slash commands', () => {
    expect(filterPrintableInput('/help')).toBe('/help');
  });

  it('passes single characters', () => {
    expect(filterPrintableInput('a')).toBe('a');
  });

  it('rejects control characters', () => {
    expect(filterPrintableInput('\x01')).toBe('');
    expect(filterPrintableInput('\x07')).toBe('');
  });

  it('rejects DEL character (0x7f)', () => {
    expect(filterPrintableInput('\x7f')).toBe('');
  });

  it('rejects escape character', () => {
    expect(filterPrintableInput('\x1b')).toBe('');
  });

  it('rejects partial ANSI escape [A (up arrow fragment)', () => {
    expect(filterPrintableInput('[A')).toBe('');
  });

  it('rejects partial ANSI escape [B (down arrow fragment)', () => {
    expect(filterPrintableInput('[B')).toBe('');
  });

  it('rejects partial ANSI escape [C (right arrow fragment)', () => {
    expect(filterPrintableInput('[C')).toBe('');
  });

  it('rejects partial ANSI escape [D (left arrow fragment)', () => {
    expect(filterPrintableInput('[D')).toBe('');
  });

  it('rejects partial ANSI escape [H (home fragment)', () => {
    expect(filterPrintableInput('[H')).toBe('');
  });

  it('rejects partial ANSI escape [F (end fragment)', () => {
    expect(filterPrintableInput('[F')).toBe('');
  });

  it('passes bracket followed by multiple chars (not a sequence)', () => {
    expect(filterPrintableInput('[AB')).toBe('[AB');
  });

  it('passes standalone bracket', () => {
    expect(filterPrintableInput('[')).toBe('[');
  });

  it('strips mixed control and printable chars', () => {
    expect(filterPrintableInput('a\x01b')).toBe('ab');
  });

  it('rejects empty string', () => {
    expect(filterPrintableInput('')).toBe('');
  });

  it('passes unicode characters', () => {
    expect(filterPrintableInput('héllo 🎉')).toBe('héllo 🎉');
  });

  it('passes spaces', () => {
    expect(filterPrintableInput(' ')).toBe(' ');
  });
});

describe('value sanitization (updateValue chokepoint)', () => {
  it('passes normal printable text', () => {
    expect(sanitizeValue('hello')).toBe('hello');
  });

  it('strips DEL characters (backspace bytes that leak through)', () => {
    // sanitizeValue strips \x7f but keeps printable chars — "toto" stays
    expect(sanitizeValue('toto\x7f\x7f\x7f\x7f/help')).toBe('toto/help');
  });

  it('strips control characters', () => {
    expect(sanitizeValue('a\x01\x02b')).toBe('ab');
  });

  it('passes unicode and spaces', () => {
    expect(sanitizeValue('hello world 🎉')).toBe('hello world 🎉');
  });

  it('returns empty for all-control input', () => {
    expect(sanitizeValue('\x7f\x7f\x7f')).toBe('');
  });

  it('regression: DEL bytes are stripped so they cannot corrupt the value', () => {
    // The actual backspace handling happens in useInput (key.backspace/key.delete)
    // which calls updateValue(value.slice(0, cur-1)). The sanitization in
    // updateValue is a safety net: if \x7f somehow leaks past key handling,
    // it gets stripped rather than silently corrupting the string.
    expect(sanitizeValue('\x7f')).toBe('');
    expect(sanitizeValue('a\x7fb')).toBe('ab');
    expect(sanitizeValue('/help\x7f')).toBe('/help');
  });

  it('regression: backspace bytes never survive in value', () => {
    expect(sanitizeValue('abc\x7f')).toBe('abc');
    expect(sanitizeValue('\x7fabc')).toBe('abc');
    expect(sanitizeValue('a\x7fb\x7fc')).toBe('abc');
  });
});

describe('slash command detection', () => {
  it('detects /help as a command', () => {
    expect('/help'.startsWith('/')).toBe(true);
  });

  it('does not treat normal text as command', () => {
    expect('hello'.startsWith('/')).toBe(false);
  });

  it('handles text with embedded slash', () => {
    expect('a/b'.startsWith('/')).toBe(false);
  });

  it('detects /status with args', () => {
    const content = '/cancel abc123';
    expect(content.startsWith('/')).toBe(true);
    const parts = content.slice(1).split(/\s+/v);
    expect(parts[0]).toBe('cancel');
    expect(parts[1]).toBe('abc123');
  });
});
