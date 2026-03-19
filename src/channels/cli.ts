import * as readline from 'node:readline';
import chalk from 'chalk';
import type { Channel, MessageHandler, PairCommandHandler, BootstrapHandler } from './types.js';

export class CliChannel implements Channel {
  readonly name = 'cli';
  private rl: readline.Interface | undefined;
  private onMessage: MessageHandler | undefined;
  private pairHandler: PairCommandHandler | undefined;
  private bootstrapHandler: BootstrapHandler | undefined;

  setPairHandler(handler: PairCommandHandler): void {
    this.pairHandler = handler;
  }

  setBootstrapHandler(handler: BootstrapHandler): void {
    this.bootstrapHandler = handler;
  }

  /** Expose readline for dashboard coordination */
  getRl(): readline.Interface | undefined {
    return this.rl;
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    this.rl = readline.createInterface({
      input: process.stdin,
      // Write to stderr so readline's prompt/echo doesn't clash with
      // the dashboard rendering on stdout
      output: process.stderr,
      prompt: '',
      terminal: false,
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

      // Handle /bootstrap command
      if (content === '/bootstrap') {
        this.bootstrapHandler?.('cli', 'local');
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
    // Output via stdout — the dashboard refresh will re-print the prompt after
    process.stdout.write(`\n${chalk.cyan('CawPilot')}${chalk.dim(':')} ${content}\n`);
    process.stdout.write(chalk.green('> '));
  }
}
