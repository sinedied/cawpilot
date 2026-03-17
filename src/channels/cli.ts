import * as readline from 'node:readline';
import chalk from 'chalk';
import type { Channel, MessageHandler, PairCommandHandler } from './types.js';

export class CliChannel implements Channel {
  readonly name = 'cli';
  private rl: readline.Interface | undefined;
  private onMessage: MessageHandler | undefined;
  private pairHandler: PairCommandHandler | undefined;

  setPairHandler(handler: PairCommandHandler): void {
    this.pairHandler = handler;
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
    });

    this.rl.on('line', (line) => {
      const content = line.trim();
      if (!content) return;

      // Handle /pair command
      if (content.startsWith('/pair')) {
        const parts = content.split(/\s+/);
        const code = parts[1];
        this.pairHandler?.('cli', 'local', code);
        return;
      }

      this.onMessage?.({
        channel: 'cli',
        sender: 'local',
        content,
      });
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    this.rl = undefined;
  }

  async send(_sender: string, content: string): Promise<void> {
    console.log(`${chalk.cyan('CawPilot')}${chalk.dim(':')} ${content}`);
    // Re-print prompt marker after output
    process.stdout.write(chalk.green('> '));
  }
}
