import { getActiveTasks } from '../db/tasks.js';
import { createMessage } from '../db/messages.js';
import type { CommandContext } from './handler.js';

// UUID v4 pattern
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iv;

export async function handleCancelCommand(
  channelName: string,
  sender: string,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const channel = ctx.channels.get(channelName);
  if (!channel) return;

  const input = args.join(' ').trim();

  if (input.toLowerCase() === 'all') {
    const activeTasks = getActiveTasks(ctx.db);

    if (activeTasks.length === 0) {
      await channel.send(sender, 'No active tasks to cancel.');
      return;
    }

    const results = await Promise.all(
      activeTasks.map(async (task) => ctx.orchestrator.cancelTask(task.id)),
    );
    const cancelledCount = results.filter(Boolean).length;

    await channel.send(
      sender,
      cancelledCount === activeTasks.length
        ? `🚫 Cancelled ${cancelledCount} active task(s).`
        : `⚠️ Cancelled ${cancelledCount} of ${activeTasks.length} active task(s).`,
    );
    return;
  }

  // No argument: cancel the sole active task, or list choices
  if (!input) {
    const active = getActiveTasks(ctx.db).filter(
      (t) => t.status === 'in-progress',
    );

    if (active.length === 0) {
      await channel.send(sender, 'No active tasks to cancel.');
      return;
    }

    if (active.length === 1) {
      const cancelled = await ctx.orchestrator.cancelTask(active[0].id);
      await channel.send(
        sender,
        cancelled
          ? `🚫 Cancelled: ${active[0].title}`
          : `⚠️ Could not cancel task.`,
      );
      return;
    }

    // Multiple active tasks — list them
    const lines = [
      'Multiple active tasks. Specify which to cancel:\n',
      ...active.map((t) => `• \`${t.id.slice(0, 8)}\` — ${t.title}`),
      '\nUse `/cancel <id>` or `/cancel <description>`.',
    ];
    await channel.send(sender, lines.join('\n'));
    return;
  }

  // Argument looks like a task ID (or prefix)
  if (UUID_RE.test(input)) {
    const cancelled = await ctx.orchestrator.cancelTask(input);
    await channel.send(
      sender,
      cancelled
        ? `🚫 Task cancelled.`
        : `⚠️ No active task found with ID \`${input.slice(0, 8)}\`.`,
    );
    return;
  }

  // Check for short ID prefix match
  const active = getActiveTasks(ctx.db);
  const prefixMatch = active.find((t) => t.id.startsWith(input));
  if (prefixMatch) {
    const cancelled = await ctx.orchestrator.cancelTask(prefixMatch.id);
    await channel.send(
      sender,
      cancelled
        ? `🚫 Cancelled: ${prefixMatch.title}`
        : `⚠️ Could not cancel task.`,
    );
    return;
  }

  // Natural language — queue as a regular message for the bot to handle
  createMessage(ctx.db, channelName, sender, `Cancel the task: ${input}`);
  await channel.send(sender, `Looking for a task matching "${input}"…`);
}
