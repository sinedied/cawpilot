import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getAllTasks } from '../db/tasks.js';
import { logger } from '../utils/logger.js';

/**
 * Archive completed/failed tasks to .cawpilot/archive/TODO-YYYY-MM-DD.md
 * and remove them from the DB.
 */
export function archiveCompletedTasks(db: Database.Database, workspacePath: string): number {
  const tasks = getAllTasks(db);
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'failed');

  if (done.length === 0) {
    logger.debug('No completed tasks to archive');
    return 0;
  }

  const statusIcons: Record<string, string> = {
    'completed': '✅',
    'failed': '❌',
  };

  const archiveLines = [`# CawPilot Tasks Archive — ${new Date().toISOString().slice(0, 10)}\n`];
  for (const t of done) {
    archiveLines.push(`- ${statusIcons[t.status] || '•'} ${t.title}${t.result ? ` — ${t.result}` : ''}`);
  }
  archiveLines.push('');

  const archiveDir = join(workspacePath, '.cawpilot', 'archive');
  mkdirSync(archiveDir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const archivePath = join(archiveDir, `TODO-${dateStr}.md`);

  if (existsSync(archivePath)) {
    const existing = readFileSync(archivePath, 'utf-8');
    writeFileSync(archivePath, existing + '\n' + archiveLines.slice(1).join('\n'), 'utf-8');
  } else {
    writeFileSync(archivePath, archiveLines.join('\n'), 'utf-8');
  }

  // Remove archived tasks from DB
  const stmt = db.prepare(`DELETE FROM tasks WHERE id = ?`);
  const tx = db.transaction(() => {
    for (const t of done) {
      stmt.run(t.id);
    }
  });
  tx();

  logger.info(`Archived ${done.length} task(s) to ${archivePath}`);
  return done.length;
}
