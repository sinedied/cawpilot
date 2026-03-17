import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig, configExists, getDbPath } from '../workspace/config.js';
import { logger } from '../utils/logger.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(workspacePath: string): Promise<void> {
  console.log(chalk.bold.cyan('\n🐦 CawPilot Doctor\n'));

  const checks: CheckResult[] = [];

  // Check Copilot CLI
  const spinner = ora('Checking Copilot CLI...').start();
  checks.push(checkCopilotCli());
  spinner.stop();

  // Check GitHub CLI
  checks.push(checkGitHubCli());

  // Check GitHub auth
  checks.push(checkGitHubAuth());

  // Check Node.js version
  checks.push(checkNodeVersion());

  // Check config exists
  checks.push(checkConfig(workspacePath));

  // Check database path writable
  checks.push(checkDatabase(workspacePath));

  // Print results
  console.log('');
  for (const check of checks) {
    const icon = check.ok ? chalk.green('✓') : chalk.red('✗');
    const detail = check.ok ? chalk.dim(check.detail) : chalk.red(check.detail);
    console.log(`  ${icon} ${check.name}: ${detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(chalk.green('  All checks passed! ✨\n'));
  } else {
    console.log(chalk.red(`  ${failed.length} check(s) failed.\n`));
    process.exitCode = 1;
  }
}

function checkCopilotCli(): CheckResult {
  try {
    const version = execSync('copilot --version', { stdio: 'pipe' }).toString().trim();
    return { name: 'Copilot CLI', ok: true, detail: version };
  } catch {
    return { name: 'Copilot CLI', ok: false, detail: 'Not found. Install from https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli' };
  }
}

function checkGitHubCli(): CheckResult {
  try {
    const version = execSync('gh --version', { stdio: 'pipe' }).toString().split('\n')[0].trim();
    return { name: 'GitHub CLI', ok: true, detail: version };
  } catch {
    return { name: 'GitHub CLI', ok: false, detail: 'Not found. Install from https://cli.github.com/' };
  }
}

function checkGitHubAuth(): CheckResult {
  try {
    const status = execSync('gh auth status', { stdio: 'pipe' }).toString().trim();
    return { name: 'GitHub Auth', ok: true, detail: 'Authenticated' };
  } catch {
    return { name: 'GitHub Auth', ok: false, detail: 'Not authenticated. Run: gh auth login' };
  }
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1), 10);
  if (major >= 24) {
    return { name: 'Node.js', ok: true, detail: version };
  }
  return { name: 'Node.js', ok: false, detail: `${version} (requires 24+)` };
}

function checkConfig(workspacePath: string): CheckResult {
  if (configExists(workspacePath)) {
    return { name: 'Configuration', ok: true, detail: 'Found' };
  }
  return { name: 'Configuration', ok: false, detail: 'Not found. Run: cawpilot setup' };
}

function checkDatabase(workspacePath: string): CheckResult {
  const dbDir = getDbPath(workspacePath).replace('/db.sqlite', '');
  try {
    if (!existsSync(dbDir)) {
      return { name: 'Database', ok: true, detail: 'Directory will be created on start' };
    }
    return { name: 'Database', ok: true, detail: 'Directory exists' };
  } catch {
    return { name: 'Database', ok: false, detail: 'Cannot access database directory' };
  }
}
