import chalk from 'chalk';
import { getDb, closeDb } from '../db/client.js';
import { getDbPath } from '../workspace/config.js';
import { createMessage } from '../db/messages.js';

export async function runSend(workspacePath: string, message: string): Promise<void> {
  const db = getDb(getDbPath(workspacePath));

  createMessage(db, 'cli', 'local', message);
  console.log(chalk.dim(`Message queued: "${message}"`));
  console.log(chalk.dim('If the bot is running, it will be processed shortly.'));

  closeDb();
}
