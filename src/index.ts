import { createAgent } from './core/agent.js';
import { loadConfig } from './cli/config.js';
import { createChannel } from './channels/index.js';

// Register built-in channels
import './channels/telegram.js';

export async function main() {
  const config = await loadConfig();
  const channel = createChannel(config.channel.name, config.channel.options);
  const agent = await createAgent(config);

  const shutdown = async () => {
    console.log('\nShutting down...');
    await channel.stop();
    await agent.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await channel.start(async (message) => {
    const response = await agent.handleMessage(message);
    await channel.send(message.from, response);
  });

  console.log('CawPilot is running. Waiting for messages...');
}

main().catch((error) => {
  console.error('Failed to start CawPilot:', error);
  process.exit(1);
});
