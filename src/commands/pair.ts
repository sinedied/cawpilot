import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import type Database from 'better-sqlite3';
import { type CawpilotConfig, saveConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import { type TelegramChannel } from '../channels/telegram.js';
import { setNotification } from '../cli/dashboard.js';
import { logger } from '../utils/logger.js';

type PendingPair = {
  code: string;
  sourceChannel: string;
  sourceSender: string;
  expiresAt: number;
};

const pendingPairs: PendingPair[] = [];

function generatePairCode(): string {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export async function handlePairCommand(
  channelName: string,
  sender: string,
  code: string | undefined,
  channels: Map<string, Channel>,
  config: CawpilotConfig,
): Promise<void> {
  const channel = channels.get(channelName);
  if (!channel) return;

  // Prune expired codes
  const now = Date.now();
  for (let i = pendingPairs.length - 1; i >= 0; i--) {
    if (pendingPairs[i].expiresAt < now) pendingPairs.splice(i, 1);
  }

  if (!code) {
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
      expiresAt: Date.now() + 5 * 60 * 1000,
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

  if (channelName === 'telegram') {
    const tg = channels.get('telegram') as TelegramChannel;
    tg.addToAllowList(sender);

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
}
