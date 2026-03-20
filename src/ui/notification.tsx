import React from 'react';
import { Box, Text } from 'ink';

type NotificationProps = {
  text: string;
  width: number;
};

export function Notification({ text, width }: NotificationProps) {
  // Account for border (2) + padding (2) + "› " prefix (2) = 6
  const maxWidth = Math.max(width - 6, 10);

  if (!text) {
    return (
      <Box>
        <Text dimColor color="cyan">
          {'~ '}
        </Text>
        <Text dimColor>ready</Text>
      </Box>
    );
  }

  const display =
    text.length > maxWidth ? text.slice(0, maxWidth - 1) + '…' : text;

  return (
    <Box>
      <Text dimColor color="cyan">
        {'~ '}
      </Text>
      <Text dimColor>{display}</Text>
    </Box>
  );
}
