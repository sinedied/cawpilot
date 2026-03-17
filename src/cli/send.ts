import chalk from 'chalk';
import { loadConfig } from '../workspace/config.js';
import { getDb } from '../db/client.js';
import { getDbPath } from '../workspace/config.js';
import { createMessage } from '../db/messages.js';

export async function runSend(workspacePath: string, message: string): Promise<void> {
  const config = loadConfig(workspacePath);
  const db = getDb(getDbPath(workspacePath));

  createMessage(db, 'cli', 'local', message);
  console.log(chalk.dim(`Message queued: "${message}"`));
  console.log(chalk.dim('Start the bot with `cawpilot start` to process it.'));

  db.close();
}
