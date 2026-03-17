import chalk from 'chalk';
import { loadConfig, getDbPath } from '../workspace/config.js';
import { getDb, closeDb } from '../db/client.js';
import { createMessage } from '../db/messages.js';
import { ensureWorkspace, cloneRepo } from '../workspace/manager.js';
import { startRuntime, stopRuntime } from '../agent/runtime.js';
import { Orchestrator } from '../agent/orchestrator.js';
import { CliChannel } from '../channels/cli.js';
import { TelegramChannel } from '../channels/telegram.js';
import { HttpChannel } from '../channels/http.js';
import { renderDashboard } from './dashboard.js';
import type { Channel } from '../channels/types.js';
import { logger } from '../utils/logger.js';

export async function runStart(workspacePath: string): Promise<void> {
  const config = loadConfig(workspacePath);
  config.workspacePath = workspacePath;

  ensureWorkspace(workspacePath);
  const db = getDb(getDbPath(workspacePath));

  // Clone connected repos
  for (const repo of config.repos) {
    try {
      cloneRepo(workspacePath, repo);
    } catch (error) {
      logger.warn(`Failed to clone ${repo}: ${error}`);
    }
  }

  // Initialize channels
  const channels = new Map<string, Channel>();

  const cliChannel = new CliChannel();
  channels.set('cli', cliChannel);

  for (const chConfig of config.channels) {
    if (!chConfig.enabled) continue;

    if (chConfig.type === 'telegram' && chConfig.telegramToken) {
      const tg = new TelegramChannel(chConfig.telegramToken, chConfig.telegramChatId);
      channels.set('telegram', tg);
    }

    if (chConfig.type === 'http') {
      const http = new HttpChannel(chConfig.httpPort ?? 3000);
      channels.set('http', http);
    }
  }

  // Start Copilot SDK runtime
  await startRuntime();

  // Start channels
  const messageHandler = (msg: { channel: string; sender: string; content: string; attachments?: string[] }) => {
    createMessage(db, msg.channel, msg.sender, msg.content, msg.attachments);
    logger.debug(`Message received from ${msg.channel}/${msg.sender}`);
  };

  for (const [name, channel] of channels) {
    try {
      await channel.start(messageHandler);
      logger.info(`Channel started: ${name}`);
    } catch (error) {
      logger.error(`Failed to start channel ${name}: ${error}`);
    }
  }

  // Start orchestrator
  const orchestrator = new Orchestrator(config, db, channels);
  orchestrator.start();

  // Dashboard
  const startTime = new Date();
  const dashboardInterval = setInterval(() => {
    process.stdout.write('\x1B[2J\x1B[H'); // Clear screen
    process.stdout.write(renderDashboard(orchestrator, db, startTime));
  }, 2000);

  // Initial render
  process.stdout.write(renderDashboard(orchestrator, db, startTime));

  console.log(chalk.dim('Press Ctrl+C to stop.\n'));

  // Graceful shutdown
  const shutdown = async () => {
    console.log(chalk.dim('\nShutting down...'));
    clearInterval(dashboardInterval);
    orchestrator.stop();

    for (const [name, channel] of channels) {
      try {
        await channel.stop();
        logger.debug(`Channel stopped: ${name}`);
      } catch (error) {
        logger.error(`Error stopping channel ${name}: ${error}`);
      }
    }

    await stopRuntime();
    closeDb();
    console.log(chalk.green('CawPilot stopped. 👋\n'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
