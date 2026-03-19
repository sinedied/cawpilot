import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import type { CawpilotConfig } from './config.js';

/**
 * Ensure the persistence repo exists (create if needed).
 */
export function ensurePersistenceRepo(repo: string): void {
  try {
    execSync(`gh repo view ${repo} --json name`, { stdio: 'pipe' });
  } catch {
    logger.info(`Creating private repository ${repo}...`);
    execSync(
      `gh repo create ${repo} --private --description "CawPilot backup"`,
      {
        stdio: 'pipe',
      },
    );
  }
}

/**
 * Run a backup: git init (if needed), add, commit with date, push.
 * Respects the workspace .gitignore.
 */
export function runBackup(config: CawpilotConfig): {
  success: boolean;
  message: string;
} {
  if (!config.persistence.enabled || !config.persistence.repo) {
    return { success: false, message: 'Persistence is not enabled.' };
  }

  const { repo } = config.persistence;
  const ws = config.workspacePath;

  try {
    ensurePersistenceRepo(repo);

    // Init git repo if not already
    if (!existsSync(join(ws, '.git'))) {
      execSync('git init', { cwd: ws, stdio: 'pipe' });
      execSync(`git remote add origin https://github.com/${repo}.git`, {
        cwd: ws,
        stdio: 'pipe',
      });
      logger.debug('Initialized git repo in workspace');
    }

    // Stage all files (respects .gitignore)
    execSync('git add -A', { cwd: ws, stdio: 'pipe' });

    // Check if there are changes to commit
    try {
      execSync('git diff --cached --quiet', { cwd: ws, stdio: 'pipe' });
      return { success: true, message: 'Nothing to back up — no changes.' };
    } catch {
      // There are staged changes, proceed with commit
    }

    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    execSync(`git commit -m "Backup ${date}"`, { cwd: ws, stdio: 'pipe' });
    execSync('git push -u origin HEAD', { cwd: ws, stdio: 'pipe' });

    logger.info(`Backup pushed to ${repo}`);
    return { success: true, message: `Backed up to ${repo}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Backup failed: ${msg}`);
    return { success: false, message: `Backup failed: ${msg}` };
  }
}

/**
 * Pull latest from persistence repo into workspace.
 */
export function pullFromRepo(config: CawpilotConfig): void {
  if (!config.persistence.enabled || !config.persistence.repo) {
    return;
  }

  const ws = config.workspacePath;
  if (!existsSync(join(ws, '.git'))) {
    return;
  }

  try {
    execSync('git pull --ff-only', { cwd: ws, stdio: 'pipe' });
    logger.debug('Pulled latest from persistence repo');
  } catch {
    logger.debug('Failed to pull from persistence repo, continuing');
  }
}
