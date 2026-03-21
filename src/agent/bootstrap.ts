import process from 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import chalk from 'chalk';
import { type CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import { createTask } from '../db/tasks.js';
import { createMessage, markMessagesProcessing } from '../db/messages.js';
import { setNotification } from '../cli/dashboard.js';
import { logger } from '../utils/logger.js';
import { runTask } from './task-runner.js';

function loadBootstrapPrompt(): string {
  const devPath = join(process.cwd(), 'templates', 'BOOTSTRAP.md');
  const distPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'templates',
    'BOOTSTRAP.md',
  );
  const src = existsSync(devPath) ? devPath : distPath;

  if (!existsSync(src)) {
    return 'Introduce yourself and ask the user how they would like to customize your behavior.';
  }

  return readFileSync(src, 'utf8');
}

export async function runBootstrap(
  config: CawpilotConfig,
  db: Database.Database,
  channels: Map<string, Channel>,
  sourceChannel: string,
  sourceSender: string,
): Promise<void> {
  const prompt = loadBootstrapPrompt();

  const channel = channels.get(sourceChannel);
  if (channel) {
    await channel.send(sourceSender, '🔧 Starting bootstrap...');
  }

  setNotification(chalk.cyan('🔧 Running bootstrap...'));

  const msg = createMessage(db, sourceChannel, sourceSender, prompt);
  const task = createTask(db, 'Bootstrap: customize agent behavior');
  markMessagesProcessing(db, [msg.id], task.id);

  await runTask({ task, config, db, channels });

  setNotification(chalk.green('✅ Bootstrap complete'));
  logger.info('Bootstrap completed');
}
