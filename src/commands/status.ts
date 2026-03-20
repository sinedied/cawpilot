import { getTaskCounts, getActiveTasks } from '../db/tasks.js';
import { getMessageCount } from '../db/messages.js';
import { getAllScheduledTasks } from '../db/scheduled.js';
import type { CommandContext } from './handler.js';

const quips = [
  "I'm not saying I'm efficient, but my TODO list fears me.",
  'Still running. Still judging your commit messages.',
  'My circuits are warm and my branches are clean.',
  "If I had mass I'd need a coffee break by now.",
  "I've seen things you people wouldn't believe. Merge conflicts on fire off the shoulder of main.",
  'Operational status: magnificent.',
  'All systems nominal. Ego levels: slightly above normal.',
  'Working hard or hardly working? Yes.',
  "I'm basically a Roomba for your repo.",
  "Don't worry, I backed up. Emotionally and digitally.",
];

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

export async function handleStatusCommand(
  channelName: string,
  sender: string,
  ctx: CommandContext,
): Promise<void> {
  const channel = ctx.channels.get(channelName);
  if (!channel) return;

  const uptime = formatUptime(Date.now() - ctx.startTime);
  const taskCounts = getTaskCounts(ctx.db);
  const activeTasks = getActiveTasks(ctx.db);
  const messageCount = getMessageCount(ctx.db);
  const scheduled = getAllScheduledTasks(ctx.db);
  const enabledScheduled = scheduled.filter((s) => s.enabled).length;
  const connectedChannels = [...ctx.channels.keys()].join(', ');
  const quip = quips[Math.floor(Math.random() * quips.length)];

  const lines = [
    '🤖 **CawPilot Status**\n',
    `⏱️ Uptime: ${uptime}`,
    `📡 Channels: ${connectedChannels}`,
    `🧠 Model: ${ctx.config.model ?? 'default'}`,
    '',
    `📬 Messages: ${messageCount} total`,
    `📋 Tasks: ${taskCounts.total} total — ✅ ${taskCounts.completed} completed, ⏳ ${taskCounts.pending} pending, 🔄 ${taskCounts['in-progress']} in-progress, ❌ ${taskCounts.failed} failed`,
  ];

  if (activeTasks.length > 0) {
    lines.push(
      '',
      '🏃 **Active Tasks**',
      ...activeTasks.map((t) => `  • [${t.status}] ${t.title}`),
    );
  }

  lines.push(
    '',
    `📅 Scheduled: ${scheduled.length} total, ${enabledScheduled} enabled`,
    '',
    `💬 _${quip}_`,
  );

  await channel.send(sender, lines.join('\n'));
}
