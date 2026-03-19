import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Bot } from 'grammy';
import { logger } from '../utils/logger.js';
import type {
  Attachment,
  Channel,
  MessageHandler,
  CommandHandler,
} from './types.js';

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: Bot | undefined;
  private readonly allowList: Set<string>;
  private commandHandler: CommandHandler | undefined;
  private attachmentsDir: string | undefined;

  constructor(
    private readonly token: string,
    allowList: string[] = [],
  ) {
    this.allowList = new Set(allowList);
  }

  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  setAttachmentsDir(dir: string): void {
    this.attachmentsDir = dir;
    mkdirSync(dir, { recursive: true });
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

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const text = ctx.message.text.trim();

      if (await this.handleCommand(text, chatId)) return;
      if (!this.isLinked(chatId)) {
        logger.debug(`Dropping message from unlinked Telegram chat ${chatId}`);
        return;
      }

      await onMessage({ channel: 'telegram', sender: chatId, content: text });
    });

    // Handle voice messages
    this.bot.on('message:voice', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      if (!this.isLinked(chatId)) return;

      try {
        const file = await ctx.getFile();
        const attachment = await this.downloadFile(
          file.file_id,
          file.file_path ?? 'voice.oga',
          'audio/ogg',
          'audio',
        );
        await onMessage({
          channel: 'telegram',
          sender: chatId,
          content: ctx.message.caption ?? '[Voice message]',
          attachments: [attachment],
        });
      } catch (error) {
        logger.error(`Failed to download voice message: ${error}`);
      }
    });

    // Handle photos
    this.bot.on('message:photo', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      if (!this.isLinked(chatId)) return;

      try {
        // Get the largest photo (last in array)
        const photo = ctx.message.photo.at(-1)!;
        const file = await ctx.getFile();
        const ext = file.file_path?.split('.').pop() ?? 'jpg';
        const attachment = await this.downloadFile(
          file.file_id,
          file.file_path ?? `photo.${ext}`,
          `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          'image',
        );
        await onMessage({
          channel: 'telegram',
          sender: chatId,
          content: ctx.message.caption ?? '[Image]',
          attachments: [attachment],
        });
      } catch (error) {
        logger.error(`Failed to download photo: ${error}`);
      }
    });

    // Handle documents (files)
    this.bot.on('message:document', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      if (!this.isLinked(chatId)) return;

      try {
        const doc = ctx.message.document;
        const file = await ctx.getFile();
        const mimeType = doc.mime_type ?? 'application/octet-stream';
        const attachType = mimeType.startsWith('image/')
          ? ('image' as const)
          : mimeType.startsWith('audio/')
            ? ('audio' as const)
            : ('file' as const);
        const attachment = await this.downloadFile(
          file.file_id,
          file.file_path ?? doc.file_name ?? 'document',
          mimeType,
          attachType,
        );
        await onMessage({
          channel: 'telegram',
          sender: chatId,
          content: ctx.message.caption ?? `[${doc.file_name ?? 'Document'}]`,
          attachments: [attachment],
        });
      } catch (error) {
        logger.error(`Failed to download document: ${error}`);
      }
    });

    this.bot.catch((error) => {
      logger.error(`Telegram bot error: ${error.message}`);
    });

    this.bot.start().catch((error: unknown) => {
      logger.error(`Telegram bot failed to start: ${error}`);
    });
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

    if (sender && this.isLinked(sender)) {
      await this.bot.api.sendMessage(sender, content);
    } else {
      const chatIds = [...this.allowList];
      const results = await Promise.allSettled(
        chatIds.map(async (chatId) =>
          this.bot!.api.sendMessage(chatId, content),
        ),
      );
      for (const [i, result] of results.entries()) {
        if (result.status === 'rejected') {
          logger.error(
            `Failed to send to Telegram chat ${chatIds[i]}: ${result.reason}`,
          );
        }
      }
    }
  }

  private async handleCommand(text: string, chatId: string): Promise<boolean> {
    if (!text.startsWith('/')) return false;

    const parts = text.slice(1).split(/\s+/v);
    const command = parts[0];
    const args = parts.slice(1);

    if (command === 'pair') {
      await this.commandHandler?.(command, 'telegram', chatId, args);
      return true;
    }

    if (!this.isLinked(chatId)) {
      logger.debug(
        `Dropping command /${command} from unlinked Telegram chat ${chatId}`,
      );
      return true;
    }

    await this.commandHandler?.(command, 'telegram', chatId, args);
    return true;
  }

  private async downloadFile(
    fileId: string,
    filePath: string,
    mimeType: string,
    type: Attachment['type'],
  ): Promise<Attachment> {
    if (!this.bot) throw new Error('Bot not started');
    if (!this.attachmentsDir)
      throw new Error('Attachments directory not configured');

    const ext = filePath.split('.').pop() ?? 'bin';
    const localName = `${randomUUID()}.${ext}`;
    const localPath = join(this.attachmentsDir, localName);

    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const response = await fetch(fileUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    await pipeline(response.body, createWriteStream(localPath));

    logger.debug(`Downloaded Telegram ${type}: ${localPath}`);
    return { type, path: localPath, mimeType };
  }
}
