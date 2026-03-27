import type { Message } from '../db/messages.js';

export function buildConversationContext(
  history: Message[],
  taskMessages: Message[],
  extraMessages: Message[] = [],
): string {
  const seen = new Set<string>();
  const allMessages = [...extraMessages, ...history, ...taskMessages].filter(
    (message) => {
      if (seen.has(message.id)) {
        return false;
      }

      seen.add(message.id);
      return true;
    },
  );

  allMessages.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );

  return allMessages
    .map(
      (message) =>
        `[${message.role}] ${message.channel}/${message.sender}: ${message.content}`,
    )
    .join('\n');
}
