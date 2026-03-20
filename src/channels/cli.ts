import process from 'node:process';
import type { Readable } from 'node:stream';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { Channel, MessageHandler, CommandHandler } from './types.js';

export class CliChannel implements Channel {
  readonly name = 'cli';
  readonly canPushMessages = true;
  private rl: readline.Interface | undefined;
  private onMessage: MessageHandler | undefined;
  private commandHandler: CommandHandler | undefined;
  private pendingInput: ((value: string) => void) | undefined;
  private readonly input: Readable;

  constructor(input?: Readable) {
    this.input = input ?? process.stdin;
  }

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
      input: this.input,
      output: process.stderr,
      prompt: '',
      terminal: false,
    });

    this.rl.on('line', (line) => {
      const content = line.trim();
      if (!content) return;

      // If waiting for input, resolve the pending promise instead of dispatching
      if (this.pendingInput) {
        const resolve = this.pendingInput;
        this.pendingInput = undefined;
        resolve(content);
        return;
      }

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
    process.stdout.write(`\n${chalk.cyan('>')} ${content}\n`);
    process.stdout.write(chalk.green('> '));
  }

  async waitForInput(_sender: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.pendingInput = resolve;
    });
  }
}
