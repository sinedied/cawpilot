import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

type InputLineProps = {
  onSubmit: (text: string) => void;
  onScroll: (delta: number) => void;
};

export function InputLine({ onSubmit, onScroll }: InputLineProps) {
  const valueRef = useRef('');
  const cursorRef = useRef(0);
  const [, setTick] = useState(0);
  const rerender = () => {
    setTick((n) => n + 1);
  };

  const updateValue = (next: string, cursor?: number) => {
    valueRef.current = next;
    cursorRef.current = cursor ?? next.length;
    rerender();
  };

  useInput((input, key) => {
    if (key.return) {
      const trimmed = valueRef.current.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }

      updateValue('');
      return;
    }

    if (key.upArrow) {
      onScroll(-1);
      return;
    }

    if (key.downArrow) {
      onScroll(1);
      return;
    }

    if (key.pageUp) {
      onScroll(-5);
      return;
    }

    if (key.pageDown) {
      onScroll(5);
      return;
    }

    if (key.backspace || key.delete) {
      // Ink maps macOS Backspace (\x7f) and forward Delete (\x1b[3~] both
      // to key.delete. Since we can't distinguish them, both do backward
      // delete — this matches user expectation for the Backspace key on all
      // platforms. Forward delete is not supported.
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
    const printable = [...input]
      .filter((ch) => {
        const cp = ch.codePointAt(0)!;
        return cp >= 32 && cp !== 127;
      })
      .join('');
    if (printable) {
      const cur = cursorRef.current;
      const v = valueRef.current;
      updateValue(
        v.slice(0, cur) + printable + v.slice(cur),
        cur + printable.length,
      );
    }
  });

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
