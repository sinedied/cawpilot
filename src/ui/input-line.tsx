import React, { useState, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

export function sanitizeValue(input: string): string {
  return [...input]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join('');
}

export function filterPrintableInput(input: string): string {
  const printable = [...input]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        codePoint >= 32 &&
        codePoint !== 127 &&
        character !== '\u001B'
      );
    })
    .join('');

  // Reject leaked ANSI fragments such as "[A" and "[B" from arrow keys.
  if (!printable || /^\[[@-~]$/v.test(printable)) {
    return '';
  }

  return printable;
}

type InputLineProps = {
  onSubmit: (text: string) => void;
  onScroll: (delta: number) => void;
};

export function InputLine({ onSubmit, onScroll }: InputLineProps) {
  const valueRef = useRef('');
  const cursorRef = useRef(0);
  const onSubmitRef = useRef(onSubmit);
  const onScrollRef = useRef(onScroll);
  onSubmitRef.current = onSubmit;
  onScrollRef.current = onScroll;

  const [, setTick] = useState(0);
  const rerender = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const updateValue = useCallback(
    (next: string, cursor?: number) => {
      // Single chokepoint: ensure value never contains non-printable characters
      const clean = sanitizeValue(next);
      valueRef.current = clean;
      cursorRef.current = Math.min(cursor ?? clean.length, clean.length);
      rerender();
    },
    [rerender],
  );

  // Stabilize the handler reference so Ink's useInput effect never re-runs.
  // All mutable state is accessed via refs, so the callback is always current.
  const handler = useCallback(
    (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
      if (key.return) {
        const trimmed = valueRef.current.trim();
        if (trimmed) {
          onSubmitRef.current(trimmed);
        }

        updateValue('');
        return;
      }

      if (key.upArrow) {
        onScrollRef.current(-1);
        return;
      }

      if (key.downArrow) {
        onScrollRef.current(1);
        return;
      }

      if (key.pageUp) {
        onScrollRef.current(-5);
        return;
      }

      if (key.pageDown) {
        onScrollRef.current(5);
        return;
      }

      if (key.backspace || key.delete) {
        const cur = cursorRef.current;
        if (cur > 0) {
          const v = valueRef.current;
          updateValue(v.slice(0, cur - 1) + v.slice(cur), cur - 1);
        }

        return;
      }

      if (key.leftArrow) {
        if (cursorRef.current > 0) {
          cursorRef.current--;
          rerender();
        }

        return;
      }

      if (key.rightArrow) {
        if (cursorRef.current < valueRef.current.length) {
          cursorRef.current++;
          rerender();
        }

        return;
      }

      // Ignore all other special/control keys
      if (key.ctrl || key.meta || key.escape || key.tab) {
        return;
      }

      // Filter to only printable characters
      if (!input) return;
      const printable = filterPrintableInput(input);
      if (printable) {
        const cur = cursorRef.current;
        const v = valueRef.current;
        updateValue(
          v.slice(0, cur) + printable + v.slice(cur),
          cur + printable.length,
        );
      }
    },
    [updateValue, rerender],
  );

  useInput(handler);

  const cur = cursorRef.current;
  const val = valueRef.current;
  const before = val.slice(0, cur);
  const after = val.slice(cur);

  return (
    <Box>
      <Text color="green" bold>
        ›{' '}
      </Text>
      <Text>{before}</Text>
      <Text color="gray">█</Text>
      <Text>{after}</Text>
    </Box>
  );
}
