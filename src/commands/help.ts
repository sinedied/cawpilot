import type { Channel } from '../channels/types.js';

const commands: Array<{ name: string; description: string }> = [
  { name: 'help', description: 'Show this list of available commands' },
  {
    name: 'status',
    description: 'Show uptime, channels, tasks, and scheduled jobs',
  },
  {
    name: 'cancel',
    description: 'Cancel an active task (optionally by id or description)',
  },
  {
    name: 'schedule',
    description: 'List all scheduled tasks and their status',
  },
  { name: 'clean', description: 'Archive completed and stale tasks' },
  {
    name: 'pair',
    description: 'Generate or redeem a pairing code to link a channel',
  },
  {
    name: 'bootstrap',
    description: 'Run the bootstrap agent on configured repos',
  },
  {
    name: 'backup',
    description: 'Back up configuration to the persistence repo',
  },
];

export async function handleHelpCommand(
  channel: Channel,
  sender: string,
): Promise<void> {
  const lines = [
    '📖 Available Commands\n',
    ...commands.map((c) => `• /${c.name} — ${c.description}`),
  ];
  await channel.send(sender, lines.join('\n'));
}
