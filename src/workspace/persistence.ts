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

function ensureGitRepo(workspacePath: string, repo: string): void {
  if (!existsSync(join(workspacePath, '.git'))) {
    execSync('git init', { cwd: workspacePath, stdio: 'pipe' });
    execSync(`git remote add origin https://github.com/${repo}.git`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });
    logger.debug('Initialized git repo in workspace');
  }
}

function hasCommits(workspacePath: string): boolean {
  try {
    execSync('git rev-parse HEAD', { cwd: workspacePath, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize persistence: create repo, init git, and push initial commit.
 */
export function initializePersistence(config: CawpilotConfig): {
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
    ensureGitRepo(ws, repo);

    if (!hasCommits(ws)) {
      execSync('git add -A', { cwd: ws, stdio: 'pipe' });

      // Check if there's anything to commit
      try {
        execSync('git diff --cached --quiet', { cwd: ws, stdio: 'pipe' });
        // Nothing staged — create an empty initial commit
        execSync('git commit --allow-empty -m "Initial setup"', {
          cwd: ws,
          stdio: 'pipe',
        });
      } catch {
        // There are staged changes, commit them
        execSync('git commit -m "Initial setup"', {
          cwd: ws,
          stdio: 'pipe',
        });
      }

      execSync('git push -u origin HEAD', { cwd: ws, stdio: 'pipe' });
      logger.info(`Initial config pushed to ${repo}`);
      return { success: true, message: `Repository ${repo} initialized.` };
    }

    return { success: true, message: `Repository ${repo} already set up.` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Persistence initialization failed: ${msg}`);
    return {
      success: false,
      message: `Persistence setup failed: ${msg}`,
    };
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
    ensureGitRepo(ws, repo);

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
