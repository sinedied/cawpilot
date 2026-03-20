import React from 'react';
import { Text } from 'ink';

type DividerProps = {
  width: number;
};

export function Divider({ width }: DividerProps) {
  const w = Math.max(width - 4, 10);
  return <Text dimColor>{'╌'.repeat(w)}</Text>;
}
