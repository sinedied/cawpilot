import express, { type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler } from './types.js';

export class HttpChannel implements Channel {
  readonly name = 'http';
  private server: Server | undefined;
  private onMessage: MessageHandler | undefined;

  constructor(private readonly port: number = 3000) {}

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    const app = express();
    app.use(express.json());

    app.post('/api/messages', (req: Request, res: Response) => {
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
    // HTTP channel is fire-and-forget; responses are sent via the API
    // Outbound messages can be polled or pushed via webhooks
    logger.debug('HTTP channel does not support push messages');
  }
}
