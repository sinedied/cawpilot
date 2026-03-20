import process from 'node:process';
import chalk from 'chalk';
import {
  loadConfig,
  getDbPath,
  getAttachmentsPath,
} from '../workspace/config.js';
import { getDb, closeDb } from '../db/client.js';
import { createMessage } from '../db/messages.js';
import { ensureWorkspace, cloneRepo } from '../workspace/manager.js';
import { startRuntime, stopRuntime } from '../agent/runtime.js';
import { Orchestrator } from '../agent/orchestrator.js';
import { CliChannel } from '../channels/cli.js';
import { TelegramChannel } from '../channels/telegram.js';
import { HttpChannel } from '../channels/http.js';
import type { Channel, CommandHandler, MessageHandler } from '../channels/types.js';
import { logger } from '../utils/logger.js';
import { handleCommand } from '../commands/handler.js';
import {
  initDashboard,
  renderDashboard,
  refreshDashboard,
} from './dashboard.js';

export type StartOptions = {
  debug: boolean;
};

export async function runStart(
  workspacePath: string,
  options?: StartOptions,
): Promise<void> {
  const { debug } = options ?? { debug: false };
  const config = loadConfig(workspacePath);
  config.workspacePath = workspacePath;
  const startTime = new Date();

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
      const tg = new TelegramChannel(
        chConfig.telegramToken,
        chConfig.allowList ?? [],
      );
      tg.setAttachmentsDir(getAttachmentsPath(workspacePath));
      channels.set('telegram', tg);
    }

    if (chConfig.type === 'http') {
      const http = new HttpChannel(
        chConfig.httpPort ?? 3000,
        chConfig.httpApiKey,
      );
      http.setAttachmentsDir(getAttachmentsPath(workspacePath));
      channels.set('http', http);
    }
  }

  // Command handler delegates to centralized handler
  const commandHandler: CommandHandler = async (command, channelName, sender, args) => {
    await handleCommand(command, channelName, sender, args, {
      config,
      db,
      channels,
      orchestrator,
      startTime: startTime.getTime(),
    });
  };

  // Wire command handler to all channels
  cliChannel.setCommandHandler(commandHandler);
  for (const [, ch] of channels) {
    if (ch.setCommandHandler && ch !== cliChannel) {
      ch.setCommandHandler(commandHandler);
    }
  }

  // Start Copilot SDK runtime
  await startRuntime();

  // Start channels
  const messageHandler: MessageHandler = (msg) => {
    createMessage(db, msg.channel, msg.sender, msg.content, msg.attachments);
    logger.debug(`Message received from ${msg.channel}/${msg.sender}`);
  };

  const startResults = await Promise.allSettled(
    [...channels.entries()].map(async ([name, channel]) => {
      await channel.start(messageHandler);
      logger.info(`Channel started: ${name}`);
    }),
  );
  for (const [i, result] of startResults.entries()) {
    if (result.status === 'rejected') {
      const name = [...channels.keys()][i];
      logger.error(`Failed to start channel ${name}: ${result.reason}`);
    }
  }

  // Start orchestrator
  const orchestrator = new Orchestrator(config, db, channels);
  orchestrator.start();

  // Dashboard
  if (debug) {
    // Debug mode: just log, no dashboard refresh
    console.log(renderDashboard(orchestrator, db, startTime));
    console.log(chalk.dim('Debug logging enabled. Press Ctrl+C to stop.\n'));
  } else {
    // Normal mode: clear screen, draw dashboard + prompt
    initDashboard(orchestrator, db, startTime);
  }

  const dashboardInterval = debug
    ? undefined
    : setInterval(() => {
        refreshDashboard(orchestrator, db, startTime);
      }, 5000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log(chalk.dim('\nShutting down...'));
    if (dashboardInterval) clearInterval(dashboardInterval);
    orchestrator.stop();

    const channelEntries = [...channels.entries()];
    const stopResults = await Promise.allSettled(
      channelEntries.map(async ([name, channel]) => {
        await channel.stop();
        logger.debug(`Channel stopped: ${name}`);
      }),
    );
    for (const [i, result] of stopResults.entries()) {
      if (result.status === 'rejected') {
        logger.error(
          `Error stopping channel ${channelEntries[i][0]}: ${result.reason}`,
        );
      }
    }

    await stopRuntime();
    closeDb();
    console.log(chalk.green('CawPilot stopped. 👋\n'));
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });
}
