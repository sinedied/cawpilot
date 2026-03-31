import React from 'react';
import { Box, Text } from 'ink';

export type ChatMessage = {
  sender: 'user' | 'bot';
  content: string;
};

type ChatAreaProps = {
  messages: ChatMessage[];
  height: number;
  width: number;
  scrollOffset: number;
};

type DisplayLine = {
  prefix: 'bot' | 'bot-cont' | 'user';
  text: string;
};

/** Convert messages into display lines, splitting multi-line content. */
export function toDisplayLines(messages: ChatMessage[]): DisplayLine[] {
  const lines: DisplayLine[] = [];
  for (const msg of messages) {
    const raw = msg.content.split('\n');
    for (const [i, line] of raw.entries()) {
      if (msg.sender === 'user') {
        lines.push({ prefix: 'user', text: line });
      } else {
        lines.push({
          prefix: i === 0 ? 'bot' : 'bot-cont',
          text: line,
        });
      }
    }
  }

  return lines;
}

/** Compute the visible slice given total line count, viewport height, and scroll offset. */
export function computeVisibleRange(
  totalLines: number,
  height: number,
  scrollOffset: number,
): { start: number; end: number } {
  // Clamp offset so we can't scroll past the top
  const maxOffset = Math.max(totalLines - height, 0);
  const clamped = Math.min(Math.max(scrollOffset, 0), maxOffset);
  const end = totalLines - clamped;
  const start = Math.max(end - height, 0);
  return { start, end };
}

export function ChatArea({
  messages,
  height,
  width,
  scrollOffset,
}: ChatAreaProps) {
  const allLines = toDisplayLines(messages);
  const { start, end } = computeVisibleRange(
    allLines.length,
    height,
    scrollOffset,
  );
  const visible = allLines.slice(start, end);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((line, i) => (
        <Box key={i} flexShrink={0}>
          {line.prefix === 'bot' && (
            <>
              <Text color="magenta">◆ </Text>
              <Text>{line.text}</Text>
            </>
          )}
          {line.prefix === 'bot-cont' && (
            <>
              <Text color="magenta">{'  '}</Text>
              <Text>{line.text}</Text>
            </>
          )}
          {line.prefix === 'user' && (
            <>
              <Text color="green" bold>
                ›{' '}
              </Text>
              <Text bold>{line.text}</Text>
            </>
          )}
        </Box>
      ))}
    </Box>
  );
}
