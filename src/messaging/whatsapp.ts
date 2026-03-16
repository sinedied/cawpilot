import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import type { MessagingAdapter } from './adapter.js';
import type { MessagingConfig } from '../core/config.js';
import type { IncomingMessage } from '../types/index.js';

const MAX_QR_RETRIES = 5;
const RECONNECT_DELAY_MS = 3000;

export class WhatsAppAdapter implements MessagingAdapter {
  private readonly authDir: string;
  private sock: WASocket | undefined;
  private onMessage: ((message: IncomingMessage) => Promise<void>) | undefined;
  private reconnectAttempts = 0;
  private qrRetries = 0;
  private stopped = false;
  private myJid: string | undefined;
  private sentMessageIds = new Set<string>();

  constructor(config: MessagingConfig) {
    this.authDir = config.whatsappAuthDir ?? join(process.cwd(), '.cawpilot', 'whatsapp-auth');
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.qrRetries = 0;
    await this.connect();
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp adapter not started');
    }

    const jid = to.includes('@') ? to : `${to.replace(/\+/g, '')}@s.whatsapp.net`;
    const chunks = chunkMessage(text, 4000);
    for (const chunk of chunks) {
      const sent = await this.sock.sendMessage(jid, { text: chunk });
      if (sent?.key?.id) {
        this.sentMessageIds.add(sent.key.id);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = undefined;
    }
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'warn' });

    this.sock = makeWASocket({
      auth: state,
      logger,
      version,
      browser: ['CawPilot', 'Chrome', '22.04.4'],
      qrTimeout: 60_000,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrRetries++;
        if (this.qrRetries > MAX_QR_RETRIES) {
          console.log('\nQR code expired too many times. Run `cawpilot start` to retry.');
          this.sock?.end(undefined);
          return;
        }
        console.log(`\n📱 Scan this QR code in WhatsApp > Linked Devices (${this.qrRetries}/${MAX_QR_RETRIES}):\n`);
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        if (this.stopped) return;

        const error = lastDisconnect?.error as Boom | undefined;
        const statusCode = error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('WhatsApp logged out. Run `cawpilot setup` to re-link.');
          return;
        }

        this.reconnectAttempts++;
        if (this.reconnectAttempts > 10) {
          console.error('WhatsApp failed to connect after 10 attempts. Run `cawpilot start` to retry.');
          return;
        }

        const reason = DisconnectReason[statusCode as number] ?? `code ${statusCode ?? 'unknown'}`;
        console.log(`WhatsApp disconnected (${reason}), reconnecting in ${RECONNECT_DELAY_MS / 1000}s... (attempt ${this.reconnectAttempts}/10)`);
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      } else if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.qrRetries = 0;
        this.myJid = this.sock?.user?.id?.replace(/:\d+@/, '@');
        console.log('WhatsApp connected. Send messages to your own chat ("Note to Self") to talk to CawPilot.');
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!this.onMessage || !this.myJid) return;

      for (const msg of messages) {
        const msgId = msg.key.id;

        // Skip messages we sent as CawPilot (our replies)
        if (msgId && this.sentMessageIds.has(msgId)) {
          this.sentMessageIds.delete(msgId);
          continue;
        }

        // Only process messages in the self-chat ("Note to Self")
        if (msg.key.remoteJid !== this.myJid) continue;

        // Only process messages sent from the phone (not from other linked devices)
        if (!msg.key.fromMe) continue;

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text;

        if (!text) continue;

        try {
          await this.onMessage({
            from: this.myJid,
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
