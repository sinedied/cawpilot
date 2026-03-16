import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { join } from 'node:path';
import type { MessagingAdapter } from './adapter.js';
import type { MessagingConfig } from '../core/config.js';
import type { IncomingMessage } from '../types/index.js';

export class WhatsAppAdapter implements MessagingAdapter {
  private readonly authDir: string;
  private sock: WASocket | undefined;
  private onMessage: ((message: IncomingMessage) => Promise<void>) | undefined;

  constructor(config: MessagingConfig) {
    this.authDir = config.whatsappAuthDir ?? join(process.cwd(), '.cawpilot', 'whatsapp-auth');
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage;
    await this.connect();
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp adapter not started');
    }

    const jid = to.includes('@') ? to : `${to.replace(/\+/g, '')}@s.whatsapp.net`;
    const chunks = chunkMessage(text, 4000);
    for (const chunk of chunks) {
      await this.sock.sendMessage(jid, { text: chunk });
    }
  }

  async stop(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = undefined;
    }
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log('WhatsApp connection closed, reconnecting...');
          this.connect();
        } else {
          console.log('WhatsApp logged out. Run `cawpilot setup` to re-link.');
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connected.');
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      if (!this.onMessage) return;

      for (const msg of messages) {
        // Skip messages sent by us
        if (msg.key.fromMe) continue;

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text;

        if (!text || !msg.key.remoteJid) continue;

        try {
          await this.onMessage({
            from: msg.key.remoteJid,
            text,
            timestamp: msg.messageTimestamp as number ?? Date.now(),
            platform: 'whatsapp',
          });
        } catch (error) {
          console.error('Error handling WhatsApp message:', error);
        }
      }
    });
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
