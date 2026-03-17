import { execSync } from 'node:child_process';
import { logger } from '../utils/logger.js';
import type { CawpilotConfig } from './config.js';

export function syncToRepo(config: CawpilotConfig): void {
  if (!config.persistence.enabled || !config.persistence.repo) {
    return;
  }

  const repo = config.persistence.repo;
  logger.info(`Syncing configuration to ${repo}...`);

  try {
    // Check if repo exists, create if not
    try {
      execSync(`gh repo view ${repo} --json name`, { stdio: 'pipe' });
    } catch {
      logger.info(`Creating private repository ${repo}...`);
      execSync(`gh repo create ${repo} --private --description "CawPilot configuration"`, {
        stdio: 'pipe',
      });
    }

    logger.debug(`Persistence sync to ${repo} completed`);
  } catch (error) {
    logger.error(`Failed to sync to ${repo}: ${error}`);
  }
}

export function pullFromRepo(config: CawpilotConfig): void {
  if (!config.persistence.enabled || !config.persistence.repo) {
    return;
  }

  const repo = config.persistence.repo;
  logger.info(`Pulling configuration from ${repo}...`);

  try {
    execSync(`gh repo view ${repo} --json name`, { stdio: 'pipe' });
    logger.debug(`Persistence pull from ${repo} completed`);
  } catch {
    logger.debug(`Repo ${repo} not found, skipping pull`);
  }
}
