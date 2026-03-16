import { createAgent } from './core/agent.js';
import { loadConfig } from './cli/config.js';
import { createMessagingAdapter } from './messaging/adapter.js';

export async function main() {
  const config = await loadConfig();
  const messaging = createMessagingAdapter(config);
  const agent = await createAgent(config);

  const shutdown = async () => {
    console.log('\nShutting down...');
    await messaging.stop();
    await agent.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await messaging.start(async (message) => {
    const response = await agent.handleMessage(message);
    await messaging.send(message.from, response);
  });

  console.log('CawPilot is running. Waiting for messages...');
}

main().catch((error) => {
  console.error('Failed to start CawPilot:', error);
  process.exit(1);
});
