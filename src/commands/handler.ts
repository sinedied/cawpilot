import type Database from 'better-sqlite3';
import type { CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import type { Orchestrator } from '../agent/orchestrator.js';
import { handlePairCommand } from './pair.js';
import { handleStatusCommand } from './status.js';
import { handleCancelCommand } from './cancel.js';
import { handleHelpCommand } from './help.js';

export type CommandContext = {
  config: CawpilotConfig;
  db: Database.Database;
  channels: Map<string, Channel>;
  orchestrator: Orchestrator;
  startTime: number;
};

async function handleScheduleCommand(
  channelName: string,
  sender: string,
  ctx: CommandContext,
): Promise<void> {
  const { getAllScheduledTasks } = await import('../db/scheduled.js');
  const scheduled = getAllScheduledTasks(ctx.db);
  const channel = ctx.channels.get(channelName);
  if (!channel) return;

  if (scheduled.length === 0) {
    await channel.send(sender, 'No scheduled tasks configured.');
    return;
  }

  const lines = ['📅 Scheduled Tasks\n'];
  for (const t of scheduled) {
    const status = t.enabled ? '✅ enabled' : '⏸️ disabled';
    const lastRun = t.lastRun ? new Date(t.lastRun).toLocaleString() : 'never';
    const nextRun = t.nextRun
      ? new Date(t.nextRun).toLocaleString()
      : 'pending';
    lines.push(
      `• ${t.name} — ${status}`,
      `  Schedule: every ${t.schedule} min | Last: ${lastRun} | Next: ${nextRun}`,
    );
  }

  await channel.send(sender, lines.join('\n'));
}

async function handleBackupCommand(
  channelName: string,
  sender: string,
  ctx: CommandContext,
): Promise<void> {
  const channel = ctx.channels.get(channelName);
  if (!channel) return;

  if (!ctx.config.persistence.enabled) {
    await channel.send(
      sender,
      '⚠️ Persistence is not enabled. Run `cawpilot setup` to enable it.',
    );
    return;
  }

  const { runBackup } = await import('../workspace/persistence.js');
  const result = runBackup(ctx.config);
  await channel.send(
    sender,
    result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
  );
}

export async function handleCommand(
  command: string,
  channelName: string,
  sender: string,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  switch (command) {
    case 'help': {
      const channel = ctx.channels.get(channelName);
      if (channel) {
        await handleHelpCommand(channel, sender);
      }

      break;
    }

    case 'pair': {
      await handlePairCommand(
        channelName,
        sender,
        args[0],
        ctx.channels,
        ctx.config,
      );
      break;
    }

    case 'bootstrap': {
      const { runBootstrap } = await import('../agent/bootstrap.js');
      await runBootstrap(ctx.config, ctx.db, ctx.channels, channelName, sender);
      break;
    }

    case 'clean': {
      ctx.orchestrator.archiveCompletedTasks();
      const channel = ctx.channels.get(channelName);
      if (channel) {
        await channel.send(sender, '🧹 Completed and stale tasks archived.');
      }

      break;
    }

    case 'schedule': {
      await handleScheduleCommand(channelName, sender, ctx);
      break;
    }

    case 'backup': {
      await handleBackupCommand(channelName, sender, ctx);
      break;
    }

    case 'status': {
      await handleStatusCommand(channelName, sender, ctx);
      break;
    }

    case 'cancel': {
      await handleCancelCommand(channelName, sender, args, ctx);
      break;
    }

    default: {
      const channel = ctx.channels.get(channelName);
      if (channel) {
        await channel.send(
          sender,
          `Unknown command: /${command}. Use /help to see available commands.`,
        );
      }
    }
  }
}
