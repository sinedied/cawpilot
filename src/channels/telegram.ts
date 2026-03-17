import { Bot } from 'grammy';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler } from './types.js';

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: Bot | undefined;
  private linkedChatId: string | undefined;

  constructor(
    private readonly token: string,
    private readonly chatId?: string,
  ) {
    this.linkedChatId = chatId;
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.bot = new Bot(this.token);

    this.bot.on('message:text', (ctx) => {
      const chatId = ctx.chat.id.toString();
      if (this.linkedChatId && chatId !== this.linkedChatId) {
        logger.debug(`Ignoring message from unlinked chat ${chatId}`);
        return;
      }

      onMessage({
        channel: 'telegram',
        sender: chatId,
        content: ctx.message.text,
      });
    });

    this.bot.catch((err) => {
      logger.error(`Telegram bot error: ${err.message}`);
    });

    await this.bot.start();
    logger.info('Telegram channel started');
  }

  async stop(): Promise<void> {
    await this.bot?.stop();
    this.bot = undefined;
    logger.debug('Telegram channel stopped');
  }

  async send(_sender: string, content: string): Promise<void> {
    if (!this.bot || !this.linkedChatId) {
      logger.warn('Telegram: cannot send, no linked chat');
      return;
    }

    await this.bot.api.sendMessage(this.linkedChatId, content);
  }

  generatePairingCode(): string {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    return code;
  }

  setPairingHandler(code: string, onPaired: (chatId: string) => void): void {
    if (!this.bot) return;

    this.bot.on('message:text', (ctx, next) => {
      if (ctx.message.text.trim() === code && !this.linkedChatId) {
        this.linkedChatId = ctx.chat.id.toString();
        ctx.reply('✅ CawPilot linked! You can now send commands here.');
        onPaired(this.linkedChatId);
        logger.info(`Telegram paired with chat ${this.linkedChatId}`);
        return;
      }
      return next();
    });
  }
}
