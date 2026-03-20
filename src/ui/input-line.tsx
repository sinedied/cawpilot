import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

type InputLineProps = {
  onSubmit: (text: string) => void;
  onScroll: (delta: number) => void;
};

export function InputLine({ onSubmit, onScroll }: InputLineProps) {
  const [value, setValue] = useState('');
  const valueRef = useRef('');

  // Update both ref (sync, immediate) and state (async, for render)
  const updateValue = (next: string) => {
    valueRef.current = next;
    setValue(next);
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
      updateValue(valueRef.current.slice(0, -1));
      return;
    }

    // Ignore all special/control keys — only allow printable characters
    if (
      key.ctrl ||
      key.meta ||
      key.escape ||
      key.leftArrow ||
      key.rightArrow ||
      key.tab
    ) {
      return;
    }

    // Only append printable characters (code point >= 32)
    if (input && input.codePointAt(0)! >= 32) {
      updateValue(valueRef.current + input);
    }
  });

  return (
    <Box>
      <Text color="green" bold>
        ›{' '}
      </Text>
      <Text>{value}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
}
