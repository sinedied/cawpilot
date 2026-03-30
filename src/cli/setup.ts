import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { input, confirm, checkbox, select, password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import {
  loadConfig,
  type ChannelConfig,
  type CawpilotConfig,
} from '../workspace/config.js';
import { getGitHubUser } from '../workspace/manager.js';
import {
  startRuntime,
  stopRuntime,
  listAvailableModels,
  checkCopilotAuth,
} from '../agent/runtime.js';
import { isRunningInDocker } from '../utils/docker.js';
import { loadEnvFile, saveEnvValue } from '../workspace/env.js';
import { renderBanner, gradientText } from '../ui/banner.js';
import {
  listAvailableSkills,
  generateApiKey,
  repoExists,
  restoreFromBackup,
  completeSetup,
} from '../setup/steps.js';

export async function runSetup(workspacePath: string): Promise<void> {
  console.log('\n' + renderBanner() + '\n');
  console.log(
    chalk.dim("  Let's get you set up — this'll only take a minute.\n"),
  );

  mkdirSync(workspacePath, { recursive: true });
  loadEnvFile(workspacePath);
  const config = loadConfig(workspacePath);

  // Step 1: GitHub auth
  console.log(chalk.bold('Connecting to GitHub'));
  let spinner = ora('Checking GitHub CLI...').start();

  try {
    execSync('gh --version', { stdio: 'pipe' });
    spinner.succeed('GitHub CLI found');
  } catch {
    spinner.fail('GitHub CLI not found.');
    console.log(chalk.yellow('  Install it from: https://cli.github.com/'));
    return;
  }

  spinner = ora('Checking GitHub authentication...').start();
  let user = getGitHubUser();

  if (!user) {
    spinner.warn('GitHub CLI not authenticated');

    if (isRunningInDocker()) {
      user = await authenticateDocker();
    } else {
      console.log(chalk.dim('  Running: gh auth login\n'));
      const result = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit' });
      if (result.status === 0) {
        user = getGitHubUser();
      }
    }

    if (!user) {
      console.log(chalk.red('\n  GitHub authentication failed.'));
      return;
    }
  }

  // Persist token for future container restarts (only in Docker)
  if (isRunningInDocker()) {
    persistGitHubToken(workspacePath);
  }

  spinner.succeed(`Authenticated as ${chalk.green(user)}`);

  // Step 2: Persistence
  console.log(chalk.bold('\nBack up your config?'));
  const enablePersistence = await confirm({
    message: 'Persist configuration in a private GitHub repo? (recommended)',
    default: true,
  });

  if (enablePersistence) {
    const result = await promptPersistenceRepo(config, user);
    config.persistence = {
      enabled: true,
      repo: result.repo,
      backupIntervalDays: 1,
    };

    if (result.restore) {
      const restoreSpinner = ora('Restoring from backup...').start();
      const restoreResult = restoreFromBackup(workspacePath, result.repo);
      if (restoreResult.success && restoreResult.config) {
        restoreSpinner.succeed(restoreResult.message);
        // Reload config from restored backup, keep persistence settings
        Object.assign(config, restoreResult.config);
        config.persistence = {
          enabled: true,
          repo: result.repo,
          backupIntervalDays: 1,
        };
      } else {
        restoreSpinner.warn(restoreResult.message);
      }
    }
  } else {
    config.persistence = { enabled: false, repo: '', backupIntervalDays: 1 };
  }

  // Step 3: Channels
  console.log(chalk.bold('\nWhere should your bot listen?'));

  const channels = await setupChannels(config.channels);
  config.channels = channels;

  // Step 4: Copilot CLI & Model
  console.log(chalk.bold('\nChoose your models'));
  const models = await setupCopilotAndModels(config.models);
  config.models = models;

  // Step 5: Skills
  console.log(chalk.bold('\nPick your skills'));
  const skills = await setupSkills(workspacePath);
  config.skills = skills;

  // Finalize
  const setupSpinner = ora('Completing setup...').start();
  const { persistenceResult } = completeSetup(workspacePath, config);
  if (persistenceResult) {
    if (persistenceResult.success) {
      setupSpinner.succeed(persistenceResult.message);
    } else {
      setupSpinner.warn(persistenceResult.message);
    }
  } else {
    setupSpinner.succeed('Setup complete.');
  }

  console.log(chalk.bold.green("\n  You're all set! 🎉\n"));

  const doStart = await confirm({
    message: 'Start cawpilot now?',
    default: false,
  });

  if (doStart) {
    console.log(
      chalk.dim(
        '\nTip: use /bootstrap once started to customize the agent interactively.\n',
      ),
    );
    const debug = false;
    const { runStart } = await import('./start.js');
    await runStart(workspacePath, { debug });
  } else {
    console.log('');
    console.log('  Run ' + gradientText('cawpilot start') + ' to begin.');
    console.log(
      chalk.dim('  Use /bootstrap once started to customize the agent.\n'),
    );
  }
}

async function promptPersistenceRepo(
  config: CawpilotConfig,
  user: string,
): Promise<{ repo: string; restore: boolean }> {
  let repoName = '';

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    repoName = await input({
      message: 'Repository name:',
      default: repoName || config.persistence.repo || `${user}/my-cawpilot`,
      validate: (value) =>
        /^(?:[\w.\-]+)\/(?:[\w.\-]+)$/v.test(value.trim()) ||
        'Use owner/repo format (e.g. user/my-cawpilot)',
    });

    const checkSpinner = ora('Checking repository...').start();
    const exists = repoExists(repoName);
    checkSpinner.stop();

    if (!exists) {
      return { repo: repoName, restore: false };
    }

    // eslint-disable-next-line no-await-in-loop
    const restore = await confirm({
      message: `Repository ${repoName} already exists. Restore from backup?`,
      default: true,
    });

    if (restore) {
      return { repo: repoName, restore: true };
    }

    // User declined restore — loop back to change repo name
  }
}

async function setupChannels(
  existing: ChannelConfig[],
): Promise<ChannelConfig[]> {
  const existingTg = existing.find((c) => c.type === 'telegram');
  const existingHttp = existing.find((c) => c.type === 'http');

  const selected = await checkbox({
    message: 'Select channels to enable:',
    choices: [
      {
        name: 'Telegram',
        value: 'telegram' as const,
        checked: existingTg?.enabled ?? true,
      },
      {
        name: 'HTTP API',
        value: 'http' as const,
        checked: existingHttp?.enabled ?? true,
      },
    ],
  });

  const channels: ChannelConfig[] = [];

  if (selected.includes('telegram')) {
    const envToken = process.env.TELEGRAM_TOKEN;
    const defaultToken = envToken ?? existingTg?.telegramToken ?? '';
    let token: string;

    if (envToken) {
      token = envToken;
      console.log(chalk.dim('  Telegram token loaded from environment.'));
    } else {
      token = await input({
        message: 'Telegram Bot Token (from BotFather):',
        default: defaultToken,
        transformer: (value) =>
          value ? '•'.repeat(Math.min(value.length, 20)) : '',
      });
    }

    channels.push({
      type: 'telegram',
      enabled: true,
      telegramToken: token,
      allowList: existingTg?.allowList ?? [],
    });
    console.log(
      chalk.dim('  Use /pair after starting to link your Telegram account.'),
    );
  }

  if (selected.includes('http')) {
    const port = await input({
      message: 'HTTP API port:',
      default: String(existingHttp?.httpPort ?? 2243),
    });
    const apiKey = existingHttp?.httpApiKey ?? generateApiKey();
    channels.push({
      type: 'http',
      enabled: true,
      httpPort: Number.parseInt(port, 10),
      httpApiKey: apiKey,
    });
    console.log(chalk.dim('  HTTP API Key: <see .cawpilot/config.json>'));
    console.log(
      chalk.dim('  Use this key in the X-Api-Key header for requests.'),
    );
  }

  return channels;
}

async function setupSkills(_workspacePath: string): Promise<string[]> {
  const available = listAvailableSkills();

  if (available.length === 0) {
    console.log(chalk.dim('No skills available.'));
    return [];
  }

  const selected = await checkbox({
    message: 'Select skills to enable:',
    choices: available.map((s) => ({ name: s, value: s, checked: true })),
  });

  return selected;
}

async function setupCopilotAndModels(currentModels: {
  orchestrator: string;
  task: string;
}): Promise<{ orchestrator: string; task: string }> {
  // Check Copilot CLI is installed
  let copilotOk = false;
  const spinner = ora('Checking Copilot CLI...').start();
  try {
    const version = execSync('copilot --version', { stdio: 'pipe' })
      .toString()
      .trim();
    spinner.succeed(`Copilot CLI: ${chalk.dim(version)}`);
    copilotOk = true;
  } catch {
    spinner.warn('Copilot CLI not found');
    const install = await confirm({
      message: 'Install Copilot CLI now? (npm install -g @github/copilot)',
      default: true,
    });
    if (install) {
      const installSpinner = ora('Installing Copilot CLI...').start();
      try {
        execSync('npm install -g @github/copilot', { stdio: 'pipe' });
        const version = execSync('copilot --version', { stdio: 'pipe' })
          .toString()
          .trim();
        installSpinner.succeed(`Copilot CLI installed: ${chalk.dim(version)}`);
        copilotOk = true;
      } catch {
        installSpinner.fail('Failed to install Copilot CLI');
        console.log(
          chalk.yellow('  Install manually: npm install -g @github/copilot\n'),
        );
        return currentModels;
      }
    } else {
      console.log(
        chalk.yellow('  cawpilot requires the Copilot CLI to operate.\n'),
      );
      return currentModels;
    }
  }

  // Check auth via SDK, run copilot /login if needed
  const authSpinner = ora('Checking Copilot authentication...').start();
  try {
    const authStatus = await checkCopilotAuth();
    if (authStatus.isAuthenticated) {
      authSpinner.succeed(
        `Copilot authenticated as ${chalk.green(authStatus.login ?? 'user')}`,
      );
    } else {
      authSpinner.warn('Copilot CLI not authenticated');
      console.log(chalk.dim('  Running: copilot /login\n'));
      const loginResult = spawnSync('copilot', ['/login'], {
        stdio: 'inherit',
      });
      if (loginResult.status !== 0) {
        console.log(chalk.red('\n  Copilot authentication failed.'));
        console.log(chalk.yellow('  Keeping current models.\n'));
        await stopRuntime().catch(() => {});
        return currentModels;
      }

      // Re-check after login
      const recheck = await checkCopilotAuth();
      if (!recheck.isAuthenticated) {
        console.log(chalk.red('\n  Copilot authentication failed.'));
        console.log(chalk.yellow('  Keeping current models.\n'));
        await stopRuntime().catch(() => {});
        return currentModels;
      }

      authSpinner.stop();
      console.log(
        chalk.green(`  ✓ Authenticated as ${recheck.login ?? 'user'}`),
      );
    }
  } catch {
    authSpinner.warn('Could not check Copilot auth status');
  }

  // List models
  const modelSpinner = ora('Fetching available models...').start();
  try {
    const models = await listAvailableModels();
    await stopRuntime();

    if (models.length === 0) {
      modelSpinner.warn(
        'Could not fetch models. Using current model settings.',
      );
      return currentModels;
    }

    modelSpinner.succeed(`Found ${models.length} available model(s)`);

    const modelChoices = models.map((m) => ({
      name: `${m.name} ${chalk.dim(`(${m.id})`)}`,
      value: m.id,
    }));

    const orchestrator = await select({
      message: 'Select the model for orchestration (task routing):',
      choices: modelChoices,
      default:
        models.find((m) => m.id === currentModels.orchestrator)?.id ??
        models[0].id,
    });

    const task = await select({
      message: 'Select the model for running tasks:',
      choices: modelChoices,
      default:
        models.find((m) => m.id === currentModels.task)?.id ?? orchestrator,
    });

    return { orchestrator, task };
  } catch {
    modelSpinner.fail('Failed to connect to Copilot CLI.');
    console.log(
      chalk.yellow('  Make sure you are authenticated: copilot /login'),
    );
    console.log(chalk.yellow('  Keeping current models.\n'));
    await stopRuntime().catch(() => {});
    return currentModels;
  }
}

async function authenticateDocker(): Promise<string | undefined> {
  const method = await select({
    message: 'Choose authentication method:',
    choices: [
      {
        name: 'Paste a Personal Access Token (PAT)',
        value: 'token' as const,
      },
      {
        name: 'Device code flow (opens github.com/login/device)',
        value: 'device' as const,
      },
    ],
  });

  if (method === 'token') {
    const token = await password({
      message: 'GitHub Personal Access Token:',
    });

    if (!token) return undefined;

    const result = spawnSync('gh', ['auth', 'login', '--with-token'], {
      input: token,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0) return undefined;
    return getGitHubUser();
  }

  // Device code flow — no browser needed, user enters code at github.com
  console.log('');
  const result = spawnSync(
    'gh',
    ['auth', 'login', '--web', '--git-protocol', 'https'],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) return undefined;
  return getGitHubUser();
}

function persistGitHubToken(workspacePath: string): void {
  try {
    const token = execSync('gh auth token', { stdio: 'pipe' })
      .toString()
      .trim();
    if (token) {
      saveEnvValue(workspacePath, 'GH_TOKEN', token);
      console.log(
        chalk.dim('  GitHub token saved for future container sessions.'),
      );
    }
  } catch {
    // Non-critical — token may have been provided via GH_TOKEN env var
  }
}
