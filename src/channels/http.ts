import express, { type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler } from './types.js';

export class HttpChannel implements Channel {
  readonly name = 'http';
  private server: Server | undefined;
  private onMessage: MessageHandler | undefined;

  constructor(
    private readonly port: number = 3000,
    private readonly apiKey?: string,
  ) {}

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    const app = express();
    app.use(express.json());

    // API key auth middleware for message endpoint
    const requireAuth = (req: Request, res: Response, next: () => void) => {
      if (!this.apiKey) {
        // No key configured — reject all requests
        res.status(403).json({ error: 'HTTP channel not configured with an API key' });
        return;
      }

      const provided = req.headers['x-api-key'] as string | undefined;
      if (!provided || !safeCompare(provided, this.apiKey)) {
        res.status(401).json({ error: 'Invalid or missing API key' });
        return;
      }
      next();
    };

    app.post('/api/messages', requireAuth, (req: Request, res: Response) => {
      const { sender, content, attachments } = req.body as {
        sender?: string;
        content?: string;
        attachments?: string[];
      };

      if (!content || !sender) {
        res.status(400).json({ error: 'sender and content are required' });
        return;
      }

      this.onMessage?.({
        channel: 'http',
        sender,
        content,
        attachments,
      });

      res.json({ status: 'received' });
    });

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
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
