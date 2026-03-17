import chalk from 'chalk';
import type { Orchestrator } from '../agent/orchestrator.js';
import { getTaskCounts } from '../db/tasks.js';
import { getMessageCount } from '../db/messages.js';
import type Database from 'better-sqlite3';

const DASHBOARD_LINES = 7;

export function renderDashboard(
  orchestrator: Orchestrator,
  db: Database.Database,
  startTime: Date,
): string {
  const uptime = formatUptime(Date.now() - startTime.getTime());
  const counts = getTaskCounts(db);
  const messageCount = getMessageCount(db);

  const lines = [
    chalk.bold.cyan(' 🐦 CawPilot'),
    chalk.dim(` ─────────────────────────────`),
    ` ${chalk.dim('Uptime:')}    ${uptime}`,
    ` ${chalk.dim('Messages:')} ${messageCount}`,
    ` ${chalk.dim('Tasks:')}    ${chalk.yellow(String(counts['in-progress']))} active · ${chalk.green(String(counts.completed))} done · ${chalk.red(String(counts.failed))} failed`,
    ` ${chalk.dim('Queue:')}    ${counts.pending} pending`,
    chalk.dim(` ─────────────────────────────`),
  ];

  return lines.join('\n');
}

/**
 * Moves the cursor up to the dashboard area and re-renders in place,
 * without clearing any log output below.
 */
export function refreshDashboard(
  orchestrator: Orchestrator,
  db: Database.Database,
  startTime: Date,
): void {
  const content = renderDashboard(orchestrator, db, startTime);
  // Move cursor up to overwrite the dashboard lines, then re-print
  process.stdout.write(`\x1B[${DASHBOARD_LINES}A\x1B[0G`);
  process.stdout.write(content + '\n');
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
