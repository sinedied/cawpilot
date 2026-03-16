import type { MessagingAdapter } from './adapter.js';
import type { MessagingConfig } from '../core/config.js';
import type { IncomingMessage } from '../types/index.js';

export class SignalAdapter implements MessagingAdapter {
  private readonly apiUrl: string;
  private readonly phoneNumber: string;
  private pollInterval: ReturnType<typeof setInterval> | undefined;

  constructor(config: MessagingConfig) {
    this.apiUrl = config.signalApiUrl ?? 'http://localhost:8080';
    this.phoneNumber = config.signalPhoneNumber ?? '';
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    // Poll for new messages every 2 seconds
    this.pollInterval = setInterval(async () => {
      try {
        const messages = await this.receive();
        for (const message of messages) {
          await onMessage(message);
        }
      } catch (error) {
        console.error('Error polling Signal messages:', error);
      }
    }, 2000);
  }

  async send(to: string, text: string): Promise<void> {
    // Chunk long messages (Signal limit ~2000 chars for comfortable reading)
    const chunks = chunkMessage(text, 1800);
    for (const chunk of chunks) {
      const response = await fetch(`${this.apiUrl}/v2/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chunk,
          number: this.phoneNumber,
          recipients: [to],
        }),
      });
      if (!response.ok) {
        throw new Error(`Signal API error: ${response.status} ${response.statusText}`);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  private async receive(): Promise<IncomingMessage[]> {
    const response = await fetch(`${this.apiUrl}/v1/receive/${this.phoneNumber}`);
    if (!response.ok) {
      throw new Error(`Signal API error: ${response.status}`);
    }

    const data = (await response.json()) as SignalEnvelope[];
    return data
      .filter((envelope) => envelope.envelope?.dataMessage?.message)
      .map((envelope) => ({
        from: envelope.envelope.source,
        text: envelope.envelope.dataMessage.message,
        timestamp: envelope.envelope.timestamp,
        platform: 'signal' as const,
      }));
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

interface SignalEnvelope {
  envelope: {
    source: string;
    timestamp: number;
    dataMessage: {
      message: string;
    };
  };
}
