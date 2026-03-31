import React from 'react';
import { Box, Text, Spacer } from 'ink';
import Gradient from 'ink-gradient';

type StatusBarProps = {
  messageCount: number;
  active: number;
  done: number;
  failed: number;
  scheduled: number;
  compact: boolean;
};

export function StatusBar({
  messageCount,
  active,
  done,
  failed,
  scheduled,
  compact,
}: StatusBarProps) {
  return (
    <Box>
      <Gradient colors={['#7c3aed', '#2dd4bf']}>
        <Text bold>cawpilot</Text>
      </Gradient>
      <Spacer />
      <Text color="cyan">✉ {messageCount}</Text>
      <Text dimColor> · </Text>
      <Text color="yellow">⚡ {active}</Text>
      <Text dimColor> · </Text>
      <Text color="green">✓ {done}</Text>
      <Text dimColor> · </Text>
      <Text color="red">✗ {failed}</Text>
      {!compact && (
        <>
          <Text dimColor> · </Text>
          <Text color="blue">⏱ {scheduled}</Text>
        </>
      )}
    </Box>
  );
}
