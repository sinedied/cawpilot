import type { CawPilotConfig } from '../core/config.js';
import type { IncomingMessage } from '../types/index.js';
import { SignalAdapter } from './signal.js';

export interface MessagingAdapter {
  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void>;
  send(to: string, text: string): Promise<void>;
  stop(): Promise<void>;
}

export function createMessagingAdapter(config: CawPilotConfig): MessagingAdapter {
  switch (config.messaging.platform) {
    case 'signal':
      return new SignalAdapter(config.messaging);
    default:
      throw new Error(`Unsupported messaging platform: ${config.messaging.platform}`);
  }
}
