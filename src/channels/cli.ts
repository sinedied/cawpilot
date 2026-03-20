import process from 'node:process';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler, CommandHandler } from './types.js';

export class CliChannel implements Channel {
  readonly name = 'cli';
  private rl: readline.Interface | undefined;
  private onMessage: MessageHandler | undefined;
  private commandHandler: CommandHandler | undefined;

  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /** Expose readline for dashboard coordination */
  getRl(): readline.Interface | undefined {
    return this.rl;
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      prompt: '',
      terminal: false,
    });

    this.rl.on('line', (line) => {
      const content = line.trim();
      if (!content) return;

      const handle = async () => {
        // Handle slash commands
        if (content.startsWith('/')) {
          const parts = content.slice(1).split(/\s+/v);
          const command = parts[0];
          const args = parts.slice(1);
          await this.commandHandler?.(command, 'cli', 'local', args);
          return;
        }

        await this.onMessage?.({
          channel: 'cli',
          sender: 'local',
          content,
        });
      };

      handle().catch((error: unknown) => {
        logger.error(`CLI handler error: ${error}`);
      });
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    this.rl = undefined;
  }

  async send(_sender: string, content: string): Promise<void> {
    // Output via stdout — the dashboard refresh will re-print the prompt after
    process.stdout.write(
      `\n${chalk.cyan('>')} ${content}\n`,
    );
    process.stdout.write(chalk.green('> '));
  }
}
