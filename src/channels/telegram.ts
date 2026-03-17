import { Bot } from 'grammy';
import { registerChannel, type Channel, type IncomingMessage } from './index.js';

export interface TelegramChannelConfig {
  botToken?: string;
  allowedChatIds?: number[];
}

export class TelegramChannel implements Channel {
  private readonly bot: Bot;
  private readonly allowedChatIds: Set<number>;

  constructor(config: Record<string, unknown>) {
    const { botToken, allowedChatIds } = config as TelegramChannelConfig;
    const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Telegram bot token not found. Set it in config or TELEGRAM_BOT_TOKEN env var.\n' +
        'Create a bot at https://t.me/botfather',
      );
    }

    this.bot = new Bot(token);
    this.allowedChatIds = new Set(allowedChatIds ?? []);
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat.id;

      if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
        return;
      }

      if (this.allowedChatIds.size === 0) {
        console.log(`Telegram message from chat ${chatId} (${ctx.from?.username ?? ctx.from?.first_name ?? 'unknown'})`);
      }

      await onMessage({
        from: String(chatId),
        text: ctx.message.text,
        timestamp: ctx.message.date * 1000,
        channel: 'telegram',
      });
    });

    await this.bot.start({
      onStart: (botInfo) => {
        console.log(`Telegram bot @${botInfo.username} is running.`);
        if (this.allowedChatIds.size === 0) {
          console.log('No chat filter configured — bot will respond to anyone who messages it.');
          console.log('Send it a message to see your chat ID, then add it to config to restrict access.');
        }
      },
    });
  }

  async send(to: string, text: string): Promise<void> {
    const chatId = Number(to);
    const chunks = chunkMessage(text, 4096);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(chatId, chunk);
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
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

// Self-register when imported
registerChannel('telegram', (config) => new TelegramChannel(config));
