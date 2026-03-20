import process from 'node:process';
import { Buffer } from 'node:buffer';
import type { Server } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import type { Attachment, Channel, MessageHandler } from './types.js';

type HttpAttachment = {
  type?: 'image' | 'audio' | 'file';
  mimeType: string;
  data: string; // Base64
  fileName?: string;
};

export class HttpChannel implements Channel {
  readonly name = 'http';
  readonly canPushMessages = false;
  private server: Server | undefined;
  private onMessage: MessageHandler | undefined;
  private attachmentsDir: string | undefined;
  private readonly pendingInputs = new Map<string, (value: string) => void>();

  constructor(
    private readonly port = 3000,
    private readonly apiKey?: string,
  ) {}

  setAttachmentsDir(dir: string): void {
    this.attachmentsDir = dir;
    mkdirSync(dir, { recursive: true });
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    const app = express();
    app.use(express.json({ limit: '50mb' }));

    // API key auth middleware for message endpoint
    const requireAuth = (req: Request, res: Response, next: () => void) => {
      if (!this.apiKey) {
        res
          .status(403)
          .json({ error: 'HTTP channel not configured with an API key' });
        return;
      }

      const provided = req.headers['x-api-key'] as string | undefined;
      if (!provided || !safeCompare(provided, this.apiKey)) {
        res.status(401).json({ error: 'Invalid or missing API key' });
        return;
      }

      next();
    };

    app.post(
      '/api/messages',
      requireAuth,
      async (req: Request, res: Response) => {
        const { sender, content, attachments } = req.body as {
          sender?: string;
          content?: string;
          attachments?: HttpAttachment[];
        };

        if (!content || !sender) {
          res.status(400).json({ error: 'sender and content are required' });
          return;
        }

        // If waiting for input from this sender, resolve instead of dispatching
        const resolve = this.pendingInputs.get(sender);
        if (resolve) {
          this.pendingInputs.delete(sender);
          resolve(content);
          res.json({ status: 'received' });
          return;
        }

        let savedAttachments: Attachment[] | undefined;
        if (attachments?.length && this.attachmentsDir) {
          savedAttachments = attachments.map((a) => this.saveAttachment(a));
        }

        await this.onMessage?.({
          channel: 'http',
          sender,
          content,
          attachments: savedAttachments,
        });

        res.json({ status: 'received' });
      },
    );

    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });

    await new Promise<void>((resolve) => {
      this.server = app.listen(this.port, () => {
        logger.info(`HTTP channel listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = undefined;
    logger.debug('HTTP channel stopped');
  }

  async send(_sender: string, _content: string): Promise<void> {
    logger.debug('HTTP channel does not support push messages');
  }

  async waitForInput(sender: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.pendingInputs.set(sender, resolve);
    });
  }

  private saveAttachment(input: HttpAttachment): Attachment {
    if (!this.attachmentsDir)
      throw new Error('Attachments directory not configured');

    const type = input.type ?? inferType(input.mimeType);
    const ext = mimeToExt(input.mimeType);
    const fileName = `${randomUUID()}.${ext}`;
    const filePath = join(this.attachmentsDir, fileName);

    writeFileSync(filePath, Buffer.from(input.data, 'base64'));
    logger.debug(`Saved HTTP attachment: ${filePath} (${input.mimeType})`);

    return { type, path: filePath, mimeType: input.mimeType };
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function inferType(mimeType: string): Attachment['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
  };
  return map[mimeType] ?? mimeType.split('/').pop() ?? 'bin';
}
