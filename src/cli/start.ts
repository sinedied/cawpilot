import process from 'node:process';
import React from 'react';
import chalk from 'chalk';
import { render } from 'ink';
import {
  loadConfig,
  configExists,
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
import type {
  Channel,
  CommandHandler,
  MessageHandler,
} from '../channels/types.js';
import { logger } from '../utils/logger.js';
import { loadEnvFile } from '../workspace/env.js';
import { App } from '../ui/app.js';
import { handleCommand } from '../commands/handler.js';
import { registerSignalHandlers } from '../utils/signals.js';
import { addChatMessage } from './dashboard.js';

export type StartOptions = {
  debug: boolean;
};

export async function runStart(
  workspacePath: string,
  options?: StartOptions,
): Promise<void> {
  const { debug } = options ?? { debug: false };

  // Check if setup is needed
  const setupKey = process.env.CAWPILOT_WEBSETUP_KEY;
  const hasConfig = configExists(workspacePath);

  if (!hasConfig || (setupKey && loadConfig(workspacePath).web?.setupEnabled)) {
    console.log(
      chalk.yellow(
        'No workspace configuration found. Running setup...\n',
      ),
    );

    if (setupKey) {
      logger.info('Entering web setup mode');
      const { runSetupServer } = await import('../setup/server.js');
      await runSetupServer(workspacePath);
    } else {
      const { runSetup } = await import('./setup.js');
      await runSetup(workspacePath);
      await runStart(workspacePath, options);
    }

    return;
  }

  const config = loadConfig(workspacePath);
  config.workspacePath = workspacePath;
  const startTime = new Date();

  ensureWorkspace(workspacePath);
  loadEnvFile(workspacePath);
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
        chConfig.httpPort ?? 2243,
        chConfig.httpApiKey,
      );
      http.setAttachmentsDir(getAttachmentsPath(workspacePath));
      channels.set('http', http);
    }
  }

  const orchestrator = new Orchestrator(config, db, channels);

  // Command handler delegates to centralized handler
  const commandHandler: CommandHandler = async (
    command,
    channelName,
    sender,
    args,
  ) => {
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

  // In dashboard mode, configure CLI channel BEFORE start() so it skips readline
  if (!debug) {
    cliChannel.enableDashboardMode((content) => {
      addChatMessage({ sender: 'bot', content });
    });
  }

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
  orchestrator.start();

  // Graceful shutdown
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = async () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
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
    })();

    return shutdownPromise;
  };

  // Dashboard
  if (debug) {
    // Debug mode: just log, no Ink dashboard
    console.log(chalk.dim('Debug logging enabled. Press Ctrl+C to stop.\n'));

    registerSignalHandlers(
      {
        SIGINT() {
          console.log(chalk.dim('\nShutting down...'));
          shutdown()
            .then(() => {
              console.log(chalk.green('cawpilot stopped.\n'));
              process.exit(0);
            })
            .catch(() => process.exit(1));
        },
        SIGTERM() {
          shutdown()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
        },
      },
      { once: true },
    );
  } else {
    // Normal mode: Ink dashboard in alternate screen
    const handleInput = (text: string) => {
      cliChannel.handleLine(text);
    };

    // Enter alternate screen buffer
    process.stdout.write('\u001B[?1049h');

    const inkApp = render(
      React.createElement(App, {
        db,
        startTime,
        onInput: handleInput,
      }),
      {
        exitOnCtrlC: true,
        patchConsole: false,
      },
    );

    // Also handle SIGTERM for containerized shutdown
    const disposeSignalHandlers = registerSignalHandlers(
      {
        SIGTERM() {
          inkApp.unmount();
        },
      },
      { once: true },
    );

    await inkApp.waitUntilExit();
    disposeSignalHandlers();

    // Leave alternate screen buffer
    process.stdout.write('\u001B[?1049l');
    await shutdown();
    console.log(chalk.green('cawpilot stopped.\n'));
    process.exit(0);
  }
}
