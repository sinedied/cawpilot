import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
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
import type { Channel, MessageHandler } from '../channels/types.js';
import { logger } from '../utils/logger.js';
import {
  initDashboard,
  renderDashboard,
  refreshDashboard,
  setNotification,
} from './dashboard.js';

type PendingPair = {
  code: string;
  sourceChannel: string;
  sourceSender: string;
  expiresAt: number;
};

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

  // Pairing state
  const pendingPairs: PendingPair[] = [];

  function generatePairCode(): string {
    const raw = randomBytes(4).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
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

  // Pair command handler shared across all channels
  const handlePairCommand = async (
    channelName: string,
    sender: string,
    code?: string,
  ) => {
    const channel = channels.get(channelName);
    if (!channel) return;

    // Prune expired codes
    const now = Date.now();
    for (let i = pendingPairs.length - 1; i >= 0; i--) {
      if (pendingPairs[i].expiresAt < now) pendingPairs.splice(i, 1);
    }

    if (!code) {
      // "/pair" with no code — generate a pairing code (only from linked channels or CLI)
      const isLinked =
        channelName === 'cli' ||
        (channelName === 'telegram' &&
          (channels.get('telegram') as TelegramChannel)?.isLinked(sender));

      if (!isLinked) {
        await channel.send(
          sender,
          '❌ You must be on a linked channel to generate a pairing code. Use /pair <code> to link with an existing code.',
        );
        return;
      }

      const newCode = generatePairCode();
      pendingPairs.push({
        code: newCode,
        sourceChannel: channelName,
        sourceSender: sender,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });
      setNotification(
        chalk.cyan(`🔗 Pairing code: ${chalk.bold(newCode)} (valid 5 min)`),
      );
      await channel.send(
        sender,
        `🔗 Pairing code: ${chalk.bold(newCode)}\nSend /pair ${newCode} from the channel you want to link. Valid for 5 minutes.`,
      );
      return;
    }

    // "/pair <code>" — attempt to link
    const pairIndex = pendingPairs.findIndex(
      (p) => p.code === code.toUpperCase(),
    );
    if (pairIndex === -1) {
      await channel.send(sender, '❌ Invalid or expired pairing code.');
      return;
    }

    const pair = pendingPairs[pairIndex];
    pendingPairs.splice(pairIndex, 1);

    // Link the sender on this channel
    if (channelName === 'telegram') {
      const tg = channels.get('telegram') as TelegramChannel;
      tg.addToAllowList(sender);

      // Persist to config
      const tgConfig = config.channels.find((c) => c.type === 'telegram');
      if (tgConfig) {
        tgConfig.allowList = tg.getAllowList();
        saveConfig(config);
      }
    }

    await channel.send(
      sender,
      '✅ Channel linked! You can now send messages here.',
    );

    // Notify the originating channel
    const sourceChannel = channels.get(pair.sourceChannel);
    if (sourceChannel) {
      await sourceChannel.send(
        pair.sourceSender,
        `✅ A new ${channelName} user has been linked.`,
      );
    }

    setNotification(
      chalk.green(`\u2705 ${channelName} user linked successfully`),
    );
    logger.info(
      `Paired ${channelName}/${sender} via code from ${pair.sourceChannel}/${pair.sourceSender}`,
    );
  };

  // Generic command handler for all channels
  const handleCommand = async (
    command: string,
    channelName: string,
    sender: string,
    args: string[],
  ) => {
    switch (command) {
      case 'pair': {
        await handlePairCommand(channelName, sender, args[0]);
        break;
      }

      case 'bootstrap': {
        const { runBootstrap } = await import('../agent/bootstrap.js');
        await runBootstrap(config, db, channels, channelName, sender);
        break;
      }

      case 'clean': {
        orchestrator.archiveCompletedTasks();
        const channel = channels.get(channelName);
        if (channel) {
          await channel.send(sender, '🧹 Completed and stale tasks archived.');
        }

        break;
      }

      case 'schedule': {
        const { getAllScheduledTasks } = await import('../db/scheduled.js');
        const scheduled = getAllScheduledTasks(db);
        const channel = channels.get(channelName);
        if (!channel) break;

        if (scheduled.length === 0) {
          await channel.send(sender, 'No scheduled tasks configured.');
          break;
        }

        const lines = ['📅 **Scheduled Tasks**\n'];
        for (const t of scheduled) {
          const status = t.enabled ? '✅ enabled' : '⏸️ disabled';
          const lastRun = t.lastRun
            ? new Date(t.lastRun).toLocaleString()
            : 'never';
          const nextRun = t.nextRun
            ? new Date(t.nextRun).toLocaleString()
            : 'pending';
          lines.push(
            `• **${t.name}** — ${status}`,
            `  Schedule: every ${t.schedule} min | Last: ${lastRun} | Next: ${nextRun}`,
          );
        }

        await channel.send(sender, lines.join('\n'));
        break;
      }

      case 'backup': {
        const channel = channels.get(channelName);
        if (!channel) break;

        if (!config.persistence.enabled) {
          await channel.send(
            sender,
            '⚠️ Persistence is not enabled. Run `cawpilot setup` to enable it.',
          );
          break;
        }

        const { runBackup } = await import('../workspace/persistence.js');
        const result = runBackup(config);
        await channel.send(
          sender,
          result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
        );
        break;
      }

      default: {
        const channel = channels.get(channelName);
        if (channel) {
          await channel.send(sender, `Unknown command: /${command}`);
        }
      }
    }
  };

  // Wire command handler to all channels
  cliChannel.setCommandHandler(handleCommand);
  for (const [, ch] of channels) {
    if (ch.setCommandHandler && ch !== cliChannel) {
      ch.setCommandHandler(handleCommand);
    }
  }

  // Start Copilot SDK runtime
  await startRuntime();

  // Start channels
  const messageHandler: MessageHandler = (msg) => {
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
