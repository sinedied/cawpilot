import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { logger } from '../utils/logger.js';

const BRANCH_PREFIX = 'cp-';

export function getReposPath(workspacePath: string): string {
  return join(workspacePath, 'repos');
}

export function ensureWorkspace(workspacePath: string): void {
  mkdirSync(join(workspacePath, '.cawpilot', 'skills'), { recursive: true });
  mkdirSync(join(workspacePath, 'repos'), { recursive: true });
  logger.debug(`Workspace ensured at ${workspacePath}`);
}

export function cloneRepo(workspacePath: string, repoFullName: string): string {
  const reposDir = getReposPath(workspacePath);
  const repoDir = join(reposDir, repoFullName.replace('/', '_'));

  if (existsSync(repoDir)) {
    logger.debug(`Repo ${repoFullName} already cloned at ${repoDir}`);
    pullRepo(repoDir);
    return repoDir;
  }

  logger.info(`Cloning ${repoFullName}...`);
  execSync(`gh repo clone ${repoFullName} "${repoDir}"`, {
    stdio: 'pipe',
  });
  logger.info(`Cloned ${repoFullName} to ${repoDir}`);
  return repoDir;
}

export function pullRepo(repoDir: string): void {
  try {
    execSync('git pull --ff-only', { cwd: repoDir, stdio: 'pipe' });
    logger.debug(`Pulled latest for ${basename(repoDir)}`);
  } catch {
    logger.warn(
      `Failed to pull ${basename(repoDir)}, continuing with existing state`,
    );
  }
}

export function createBranch(repoDir: string, branchName: string): string {
  const safeName = ensureBranchPrefix(branchName);
  execSync(`git checkout -b ${safeName}`, { cwd: repoDir, stdio: 'pipe' });
  logger.info(`Created branch ${safeName} in ${basename(repoDir)}`);
  return safeName;
}

export function checkoutBranch(repoDir: string, branchName: string): void {
  const safeName = ensureBranchPrefix(branchName);
  execSync(`git checkout ${safeName}`, { cwd: repoDir, stdio: 'pipe' });
  logger.debug(`Checked out ${safeName} in ${basename(repoDir)}`);
}

export function pushBranch(repoDir: string, branchName: string): void {
  const safeName = ensureBranchPrefix(branchName);
  execSync(`git push -u origin ${safeName}`, { cwd: repoDir, stdio: 'pipe' });
  logger.info(`Pushed ${safeName} in ${basename(repoDir)}`);
}

export function createPullRequest(
  repoDir: string,
  title: string,
  body: string,
): string {
  const result = execSync(
    `gh pr create --title "${title.replaceAll('"', String.raw`\"`)}" --body "${body.replaceAll('"', String.raw`\"`)}" --head "$(git branch --show-current)"`,
    { cwd: repoDir, stdio: 'pipe' },
  );
  const prUrl = result.toString().trim();
  logger.info(`Created PR: ${prUrl}`);
  return prUrl;
}

export function getCurrentBranch(repoDir: string): string {
  return execSync('git branch --show-current', { cwd: repoDir, stdio: 'pipe' })
    .toString()
    .trim();
}

export function isSafeBranch(branchName: string): boolean {
  return branchName.startsWith(BRANCH_PREFIX);
}

function ensureBranchPrefix(branchName: string): string {
  if (branchName.startsWith(BRANCH_PREFIX)) return branchName;
  return `${BRANCH_PREFIX}${branchName}`;
}

export function listUserRepos(): string[] {
  try {
    const result = execSync(
      'gh repo list --json nameWithOwner --limit 100 -q ".[].nameWithOwner"',
      { stdio: 'pipe' },
    );
    return result.toString().trim().split('\n').filter(Boolean);
  } catch {
    logger.error('Failed to list repos. Is GitHub CLI authenticated?');
    return [];
  }
}

export function getGitHubUser(): string | undefined {
  try {
    const result = execSync('gh api user -q .login', { stdio: 'pipe' });
    return result.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}
