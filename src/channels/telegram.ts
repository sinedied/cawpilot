import { Bot } from 'grammy';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler, PairCommandHandler, BootstrapHandler } from './types.js';

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: Bot | undefined;
  private allowList: Set<string>;
  private pairHandler: PairCommandHandler | undefined;
  private bootstrapHandler: BootstrapHandler | undefined;

  constructor(
    private readonly token: string,
    allowList: string[] = [],
  ) {
    this.allowList = new Set(allowList);
  }

  setPairHandler(handler: PairCommandHandler): void {
    this.pairHandler = handler;
  }

  setBootstrapHandler(handler: BootstrapHandler): void {
    this.bootstrapHandler = handler;
  }

  isLinked(chatId: string): boolean {
    return this.allowList.has(chatId);
  }

  addToAllowList(chatId: string): void {
    this.allowList.add(chatId);
  }

  getAllowList(): string[] {
    return [...this.allowList];
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.bot = new Bot(this.token);

    this.bot.on('message:text', (ctx) => {
      const chatId = ctx.chat.id.toString();
      const text = ctx.message.text.trim();

      // Handle /pair command from any sender (linked or not)
      if (text.startsWith('/pair')) {
        const parts = text.split(/\s+/);
        const code = parts[1]; // undefined if just "/pair"
        this.pairHandler?.('telegram', chatId, code);
        return;
      }

      // Drop messages from unlinked senders
      if (!this.isLinked(chatId)) {
        logger.debug(`Dropping message from unlinked Telegram chat ${chatId}`);
        return;
      }

      // Handle /bootstrap command (linked only)
      if (text === '/bootstrap') {
        this.bootstrapHandler?.('telegram', chatId);
        return;
      }

      onMessage({
        channel: 'telegram',
        sender: chatId,
        content: text,
      });
    });

    this.bot.catch((err) => {
      logger.error(`Telegram bot error: ${err.message}`);
    });

    // bot.start() never resolves (long-polling loop), so fire and forget
    this.bot.start();
    logger.info('Telegram channel started');
  }

  async stop(): Promise<void> {
    await this.bot?.stop();
    this.bot = undefined;
    logger.debug('Telegram channel stopped');
  }

  async send(sender: string, content: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram: bot not started');
      return;
    }

    // Send to a specific chat, or broadcast to all linked chats
    if (sender && this.isLinked(sender)) {
      await this.bot.api.sendMessage(sender, content);
    } else {
      // Broadcast to all linked chats
      for (const chatId of this.allowList) {
        try {
          await this.bot.api.sendMessage(chatId, content);
        } catch (error) {
          logger.error(`Failed to send to Telegram chat ${chatId}: ${error}`);
        }
      }
    }
  }
}
