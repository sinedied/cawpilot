import { describe, it, expect } from 'vitest';

/**
 * Tests for the input filtering logic used in InputLine.
 * Extracted as pure functions to test without React/Ink.
 */

/**
 * Replicate the exact sanitization from updateValue() in input-line.tsx.
 * This is the single chokepoint — all value mutations go through this filter.
 */
function sanitizeValue(input: string): string {
  return [...input]
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp >= 32 && cp !== 127;
    })
    .join('');
}

/** Replicate the input filtering from useInput handler in input-line.tsx */
function filterInput(input: string): string {
  const printable = [...input]
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp >= 32 && cp !== 127 && ch !== '\x1b';
    })
    .join('');
  // Reject if it looks like a partial escape sequence (e.g. "[A", "[B")
  if (!printable || /^\[[@-~]$/v.test(printable)) return '';
  return printable;
}

describe('input filtering (useInput handler)', () => {
  it('passes normal printable text', () => {
    expect(filterInput('hello')).toBe('hello');
  });

  it('passes slash commands', () => {
    expect(filterInput('/help')).toBe('/help');
  });

  it('passes single characters', () => {
    expect(filterInput('a')).toBe('a');
  });

  it('rejects control characters', () => {
    expect(filterInput('\x01')).toBe('');
    expect(filterInput('\x07')).toBe('');
  });

  it('rejects DEL character (0x7f)', () => {
    expect(filterInput('\x7f')).toBe('');
  });

  it('rejects escape character', () => {
    expect(filterInput('\x1b')).toBe('');
  });

  it('rejects partial ANSI escape [A (up arrow fragment)', () => {
    expect(filterInput('[A')).toBe('');
  });

  it('rejects partial ANSI escape [B (down arrow fragment)', () => {
    expect(filterInput('[B')).toBe('');
  });

  it('rejects partial ANSI escape [C (right arrow fragment)', () => {
    expect(filterInput('[C')).toBe('');
  });

  it('rejects partial ANSI escape [D (left arrow fragment)', () => {
    expect(filterInput('[D')).toBe('');
  });

  it('rejects partial ANSI escape [H (home fragment)', () => {
    expect(filterInput('[H')).toBe('');
  });

  it('rejects partial ANSI escape [F (end fragment)', () => {
    expect(filterInput('[F')).toBe('');
  });

  it('passes bracket followed by multiple chars (not a sequence)', () => {
    expect(filterInput('[AB')).toBe('[AB');
  });

  it('passes standalone bracket', () => {
    expect(filterInput('[')).toBe('[');
  });

  it('strips mixed control and printable chars', () => {
    expect(filterInput('a\x01b')).toBe('ab');
  });

  it('rejects empty string', () => {
    expect(filterInput('')).toBe('');
  });

  it('passes unicode characters', () => {
    expect(filterInput('héllo 🎉')).toBe('héllo 🎉');
  });

  it('passes spaces', () => {
    expect(filterInput(' ')).toBe(' ');
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
