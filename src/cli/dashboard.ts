import type { ChatMessage } from '../ui/chat-area.js';

/**
 * Global dashboard callbacks with buffering.
 * Non-React code calls setNotification/addChatMessage at any time.
 * Callbacks are registered once the Ink UI mounts. Any calls made before
 * registration are buffered and flushed when the UI connects.
 */

let notificationCallback: ((text: string) => void) | undefined;
let chatCallback: ((msg: ChatMessage) => void) | undefined;
let pendingNotification: string | undefined;
let pendingChat: ChatMessage[] = [];

export function registerDashboardCallbacks(
  onNotification: (text: string) => void,
  onChat: (msg: ChatMessage) => void,
): void {
  notificationCallback = onNotification;
  chatCallback = onChat;

  // Flush any buffered items
  if (pendingNotification !== undefined) {
    onNotification(pendingNotification);
    pendingNotification = undefined;
  }

  for (const msg of pendingChat) {
    onChat(msg);
  }

  pendingChat = [];
}

export function unregisterDashboardCallbacks(): void {
  notificationCallback = undefined;
  chatCallback = undefined;
}

export function setNotification(text: string): void {
  if (notificationCallback) {
    notificationCallback(text);
  } else {
    pendingNotification = text;
  }
}

export function clearNotification(): void {
  setNotification('');
}

export function addChatMessage(message: ChatMessage): void {
  if (chatCallback) {
    chatCallback(message);
  } else {
    pendingChat.push(message);
  }
}
