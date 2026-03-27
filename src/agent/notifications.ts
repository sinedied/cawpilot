import chalk from 'chalk';
import { setNotification } from '../cli/dashboard.js';

function summarizeTitle(title: string): string {
  return title.slice(0, 40);
}

export function notifyTaskStarted(title: string): void {
  setNotification(chalk.yellow(`⟳ Working on: ${summarizeTitle(title)}`));
}

export function notifyTaskCompleted(title: string): void {
  setNotification(chalk.green(`✅ Task done: ${summarizeTitle(title)}`));
}

export function notifyTaskFailed(title: string): void {
  setNotification(chalk.red(`❌ Task failed: ${summarizeTitle(title)}`));
}

export function notifyTaskCancelled(title: string): void {
  setNotification(chalk.yellow(`🚫 Task cancelled: ${summarizeTitle(title)}`));
}

export function notifyAutoBackup(message: string): void {
  setNotification(chalk.green(`💾 Auto-backup: ${message}`));
}
