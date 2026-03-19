import type Database from 'better-sqlite3';
import type { CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import type { Orchestrator } from '../agent/orchestrator.js';
import { handlePairCommand } from './pair.js';

export type CommandContext = {
  config: CawpilotConfig;
  db: Database.Database;
  channels: Map<string, Channel>;
  orchestrator: Orchestrator;
};

export async function handleCommand(
  command: string,
  channelName: string,
  sender: string,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  switch (command) {
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
      const { getAllScheduledTasks } = await import('../db/scheduled.js');
      const scheduled = getAllScheduledTasks(ctx.db);
      const channel = ctx.channels.get(channelName);
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
      const channel = ctx.channels.get(channelName);
      if (!channel) break;

      if (!ctx.config.persistence.enabled) {
        await channel.send(
          sender,
          '⚠️ Persistence is not enabled. Run `cawpilot setup` to enable it.',
        );
        break;
      }

      const { runBackup } = await import('../workspace/persistence.js');
      const result = runBackup(ctx.config);
      await channel.send(
        sender,
        result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      );
      break;
    }

    default: {
      const channel = ctx.channels.get(channelName);
      if (channel) {
        await channel.send(sender, `Unknown command: /${command}`);
      }
    }
  }
}
