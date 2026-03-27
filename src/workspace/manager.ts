import { existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { logger } from '../utils/logger.js';
import { runCommand } from './commands.js';
import {
  BRANCH_PREFIX,
  validateBranchName,
  validateRepoName,
} from './safety.js';

export function getReposPath(workspacePath: string): string {
  return join(workspacePath, 'repos');
}

export function ensureWorkspace(workspacePath: string): void {
  mkdirSync(join(workspacePath, '.cawpilot', 'skills'), { recursive: true });
  mkdirSync(join(workspacePath, 'repos'), { recursive: true });
  logger.debug(`Workspace ensured at ${workspacePath}`);
}

export function cloneRepo(workspacePath: string, repoFullName: string): string {
  const safeRepoName = validateRepoName(repoFullName);
  const reposDir = getReposPath(workspacePath);
  const repoDir = join(reposDir, safeRepoName.replace('/', '_'));

  if (existsSync(repoDir)) {
    logger.debug(`Repo ${safeRepoName} already cloned at ${repoDir}`);
    pullRepo(repoDir);
    return repoDir;
  }

  logger.info(`Cloning ${safeRepoName}...`);
  runCommand('gh', ['repo', 'clone', safeRepoName, repoDir], {
    stdio: 'pipe',
  });
  logger.info(`Cloned ${safeRepoName} to ${repoDir}`);
  return repoDir;
}

export function pullRepo(repoDir: string): void {
  try {
    runCommand('git', ['pull', '--ff-only'], { cwd: repoDir, stdio: 'pipe' });
    logger.debug(`Pulled latest for ${basename(repoDir)}`);
  } catch {
    logger.warn(
      `Failed to pull ${basename(repoDir)}, continuing with existing state`,
    );
  }
}

export function createBranch(repoDir: string, branchName: string): string {
  const safeName = validateBranchName(branchName);
  runCommand('git', ['checkout', '-b', safeName], {
    cwd: repoDir,
    stdio: 'pipe',
  });
  logger.info(`Created branch ${safeName} in ${basename(repoDir)}`);
  return safeName;
}

export function checkoutBranch(repoDir: string, branchName: string): void {
  const safeName = validateBranchName(branchName);
  runCommand('git', ['checkout', safeName], { cwd: repoDir, stdio: 'pipe' });
  logger.debug(`Checked out ${safeName} in ${basename(repoDir)}`);
}

export function pushBranch(repoDir: string, branchName: string): void {
  const safeName = validateBranchName(branchName);
  runCommand('git', ['push', '-u', 'origin', safeName], {
    cwd: repoDir,
    stdio: 'pipe',
  });
  logger.info(`Pushed ${safeName} in ${basename(repoDir)}`);
}

export function createPullRequest(
  repoDir: string,
  title: string,
  body: string,
): string {
  const currentBranch = validateBranchName(getCurrentBranch(repoDir));
  const prUrl = runCommand(
    'gh',
    ['pr', 'create', '--title', title, '--body', body, '--head', currentBranch],
    { cwd: repoDir, stdio: 'pipe' },
  );
  logger.info(`Created PR: ${prUrl}`);
  return prUrl;
}

export function getCurrentBranch(repoDir: string): string {
  return runCommand('git', ['branch', '--show-current'], {
    cwd: repoDir,
    stdio: 'pipe',
  });
}

export function isSafeBranch(branchName: string): boolean {
  return branchName.startsWith(BRANCH_PREFIX);
}

export function listUserRepos(): string[] {
  try {
    return runCommand(
      'gh',
      [
        'repo',
        'list',
        '--json',
        'nameWithOwner',
        '--limit',
        '100',
        '-q',
        '.[].nameWithOwner',
      ],
      { stdio: 'pipe' },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    logger.error('Failed to list repos. Is GitHub CLI authenticated?');
    return [];
  }
}

export function getGitHubUser(): string | undefined {
  try {
    return runCommand('gh', ['api', 'user', '-q', '.login'], {
      stdio: 'pipe',
    });
  } catch {
    return undefined;
  }
}
