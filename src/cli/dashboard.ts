import chalk from 'chalk';
import type Database from 'better-sqlite3';
import type { Orchestrator } from '../agent/orchestrator.js';
import { getTaskCounts, getActiveTasks } from '../db/tasks.js';
import { getMessageCount } from '../db/messages.js';

let notificationText = '';
let dashboardLineCount = 0;

export function setNotification(text: string): void {
  notificationText = text;
}

export function clearNotification(): void {
  notificationText = '';
}

function getWidth(): number {
  return process.stdout.columns || 60;
}

function hLine(): string {
  const w = Math.max(getWidth() - 2, 20);
  return chalk.dim(` ${'─'.repeat(w)}`);
}

function pad(label: string, value: string): string {
  return ` ${chalk.dim(label)} ${value}`;
}

export function renderDashboard(
  orchestrator: Orchestrator,
  db: Database.Database,
  startTime: Date,
): string {
  const uptime = formatUptime(Date.now() - startTime.getTime());
  const counts = getTaskCounts(db);
  const messageCount = getMessageCount(db);
  const w = getWidth();

  const lines: string[] = [];

  // Header
  const title = ' 🐦 CawPilot';
  lines.push(
    chalk.bold.cyan(title),
    hLine(),
    // Stats
    pad('Uptime:   ', uptime),
    pad('Messages: ', String(messageCount)),
    pad(
      'Tasks:    ',
      `${chalk.yellow(String(counts['in-progress']))} active · ${chalk.green(String(counts.completed))} done · ${chalk.red(String(counts.failed))} failed`,
    ),
    pad('Queue:    ', `${counts.pending} pending`),
  );

  // Active task names
  const active = getActiveTasks(db);
  if (active.length > 0) {
    lines.push(hLine());
    for (const t of active.slice(0, 3)) {
      const icon =
        t.status === 'in-progress'
          ? chalk.yellow('⟳')
          : t.status === 'need-info'
            ? chalk.magenta('?')
            : chalk.dim('·');
      const title =
        t.title.length > w - 8 ? t.title.slice(0, w - 11) + '...' : t.title;
      lines.push(` ${icon} ${chalk.dim(title)}`);
    }

    if (active.length > 3) {
      lines.push(chalk.dim(`   +${active.length - 3} more`));
    }
  }

  lines.push(hLine(), notificationText ? ` ${notificationText}` : '');

  dashboardLineCount = lines.length;
  return lines.join('\n');
}

/**
 * Clear screen and draw the initial dashboard + prompt.
 */
export function initDashboard(
  orchestrator: Orchestrator,
  db: Database.Database,
  startTime: Date,
): void {
  process.stdout.write('\u001B[2J\u001B[H'); // Clear screen, cursor home
  const content = renderDashboard(orchestrator, db, startTime);
  process.stdout.write(content + '\n');
  process.stdout.write(chalk.green('> '));
}

/**
 * Redraws the dashboard at the top of the screen using absolute positioning.
 * Uses DEC save/restore cursor so the user's prompt position is preserved.
 */
export function refreshDashboard(
  orchestrator: Orchestrator,
  db: Database.Database,
  startTime: Date,
): void {
  if (dashboardLineCount === 0) return;

  const content = renderDashboard(orchestrator, db, startTime);
  const lines = content.split('\n');

  process.stdout.write('\u001B7'); // DEC save cursor
  process.stdout.write('\u001B[1;1H'); // Move to row 1, col 1
  for (const line of lines) {
    process.stdout.write(`${line}\u001B[K\n`); // Line + clear to EOL
  }

  process.stdout.write('\u001B8'); // DEC restore cursor
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
