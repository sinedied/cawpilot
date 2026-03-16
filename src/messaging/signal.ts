import { SignalCli } from 'signal-sdk';
import type { MessagingAdapter } from './adapter.js';
import type { MessagingConfig } from '../core/config.js';
import type { IncomingMessage } from '../types/index.js';

export class SignalAdapter implements MessagingAdapter {
  private readonly phoneNumber: string;
  private signal: InstanceType<typeof SignalCli> | undefined;

  constructor(config: MessagingConfig) {
    this.phoneNumber = config.signalPhoneNumber ?? '';
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    this.signal = new SignalCli(this.phoneNumber);
    await this.signal.connect({
      ignoreAttachments: true,
      ignoreStickers: true,
      ignoreStories: true,
    });

    this.signal.on('message', (envelope: SignalMessageEnvelope) => {
      const text = envelope.envelope?.dataMessage?.message;
      const source = envelope.envelope?.source;
      const timestamp = envelope.envelope?.timestamp;
      if (!text || !source) return;

      onMessage({
        from: source,
        text,
        timestamp: timestamp ?? Date.now(),
        platform: 'signal',
      }).catch((error) => {
        console.error('Error handling Signal message:', error);
      });
    });
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.signal) {
      throw new Error('Signal adapter not started');
    }

    // Chunk long messages (Signal limit ~2000 chars for comfortable reading)
    const chunks = chunkMessage(text, 1800);
    for (const chunk of chunks) {
      await this.signal.sendMessage(to, chunk);
    }
  }

  async stop(): Promise<void> {
    if (this.signal) {
      await this.signal.gracefulShutdown();
      this.signal = undefined;
    }
  }
}

function chunkMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Try to break at a newline
    let breakPoint = remaining.lastIndexOf('\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (breakPoint === -1) {
      breakPoint = maxLength;
    }
    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }
  return chunks;
}

interface SignalMessageEnvelope {
  envelope?: {
    source?: string;
    timestamp?: number;
    dataMessage?: {
      message?: string;
    };
  };
}
