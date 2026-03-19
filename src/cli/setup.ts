import chalk from 'chalk';
import ora from 'ora';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { input, confirm, checkbox, select } from '@inquirer/prompts';
import { readdirSync, existsSync, cpSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig,
  saveConfig,
  getSkillsPath,
  getSoulPath,
  type CawpilotConfig,
  type ChannelConfig,
} from '../workspace/config.js';
import { ensureWorkspace, getGitHubUser } from '../workspace/manager.js';
import { startRuntime, stopRuntime, listAvailableModels } from '../agent/runtime.js';
import { logger } from '../utils/logger.js';

export async function runSetup(workspacePath: string): Promise<void> {

  console.log(chalk.bold.cyan('\n🐦 Welcome to CawPilot Setup\n'));
  console.log(chalk.dim('This wizard will configure your CawPilot instance.\n'));

  ensureWorkspace(workspacePath);  ensureGitignore(workspacePath);  const config = loadConfig(workspacePath);

  // Step 1: Channels
  console.log(chalk.bold('Step 1: Channels'));

  const channels = await setupChannels(config.channels);
  config.channels = channels;

  // Step 2: GitHub auth
  console.log(chalk.bold('\nStep 2: GitHub Authentication'));
  const spinner = ora('Checking GitHub authentication...').start();
  const user = getGitHubUser();

  if (!user) {
    spinner.fail('GitHub CLI not authenticated. Run: gh auth login');
    return;
  }
  spinner.succeed(`Authenticated as ${chalk.green(user)}`);

  // Step 3: Persistence
  console.log(chalk.bold('\nStep 3: Configuration Persistence'));
  const enablePersistence = await confirm({
    message: 'Persist configuration in a private GitHub repo? (recommended)',
    default: true,
  });

  if (enablePersistence) {
    const repoName = await input({
      message: 'Repository name:',
      default: `${user}/my-cawpilot`,
    });
    config.persistence = { enabled: true, repo: repoName };
  } else {
    config.persistence = { enabled: false, repo: '' };
  }

  // Step 4: Skills
  console.log(chalk.bold('\nStep 4: Skills'));
  const skills = await setupSkills(workspacePath);
  config.skills = skills;

  // Step 5: Copilot CLI & Model
  console.log(chalk.bold('\nStep 5: Copilot Agent Runtime'));
  const model = await setupCopilotAndModel(config.model);
  config.model = model;

  // Save
  saveConfig(config);
  copyEnabledSkills(workspacePath, skills);
  ensureSoulFile(workspacePath);

  console.log(chalk.bold.green('\n✅ Setup complete!\n'));
  console.log(chalk.dim('Customize your agent personality in .cawpilot/soul.md'));

  const doBootstrap = await confirm({
    message: 'Run initial bootstrapping to customize the agent to your needs?',
    default: true,
  });

  if (doBootstrap) {
    console.log(chalk.dim('\nStarting bootstrap... (you can also run it later with /bootstrap)\n'));
    // Defer to start command which will handle the bootstrap
    const { runBootstrapStandalone } = await import('../agent/bootstrap.js');
    await runBootstrapStandalone(config);
  } else {
    console.log(chalk.dim('You can run /bootstrap anytime after starting CawPilot.'));
  }

  console.log(chalk.dim('\nStart CawPilot with: cawpilot start\n'));
}

async function setupChannels(existing: ChannelConfig[]): Promise<ChannelConfig[]> {
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
    const token = await input({
      message: 'Telegram Bot Token (from BotFather):',
      default: existingTg?.telegramToken ?? '',
    });
    channels.push({
      type: 'telegram',
      enabled: true,
      telegramToken: token,
      allowList: existingTg?.allowList ?? [],
    });
    console.log(chalk.dim('  Use /pair after starting to link your Telegram account.'));
  }

  if (selected.includes('http')) {
    const port = await input({
      message: 'HTTP API port:',
      default: String(existingHttp?.httpPort ?? 3000),
    });
    const apiKey = existingHttp?.httpApiKey ?? randomBytes(24).toString('base64url');
    channels.push({
      type: 'http',
      enabled: true,
      httpPort: parseInt(port, 10),
      httpApiKey: apiKey,
    });
    console.log(chalk.dim(`  HTTP API Key: ${chalk.bold(apiKey)}`));
    console.log(chalk.dim('  Use this key in the X-Api-Key header for requests.'));
  }

  return channels;
}

async function setupSkills(workspacePath: string): Promise<string[]> {
  const skillsRoot = join(workspacePath, '..', 'skills');
  // Also check relative to the project root
  const projectSkillsDir = join(process.cwd(), 'skills');
  const skillsDir = existsSync(skillsRoot) ? skillsRoot : projectSkillsDir;

  if (!existsSync(skillsDir)) {
    console.log(chalk.dim('No skills directory found.'));
    return [];
  }

  const available = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => d.name);

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

function copyEnabledSkills(workspacePath: string, skills: string[]): void {
  const targetDir = getSkillsPath(workspacePath);
  mkdirSync(targetDir, { recursive: true });

  const projectSkillsDir = join(process.cwd(), 'skills');

  for (const skill of skills) {
    const src = join(projectSkillsDir, skill);
    const dest = join(targetDir, skill);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
      logger.debug(`Copied skill ${skill} to workspace`);
    }
  }
}

async function setupCopilotAndModel(currentModel: string): Promise<string> {
  // Check Copilot CLI is installed
  let copilotOk = false;
  const spinner = ora('Checking Copilot CLI...').start();
  try {
    const version = execSync('copilot --version', { stdio: 'pipe' }).toString().trim();
    spinner.succeed(`Copilot CLI: ${chalk.dim(version)}`);
    copilotOk = true;
  } catch {
    spinner.fail('Copilot CLI not found.');
    console.log(chalk.yellow('  Install it from: https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli'));
    console.log(chalk.yellow('  CawPilot requires the Copilot CLI to operate.\n'));
    return currentModel;
  }

  // Check auth by trying to start the runtime and list models
  const modelSpinner = ora('Fetching available models...').start();
  try {
    const models = await listAvailableModels();
    await stopRuntime();

    if (models.length === 0) {
      modelSpinner.warn('Could not fetch models. Using current model setting.');
      return currentModel;
    }

    modelSpinner.succeed(`Found ${models.length} available model(s)`);

    const chosen = await select({
      message: 'Select the model to use:',
      choices: models.map((m) => ({
        name: `${m.name} ${chalk.dim(`(${m.id})`)}`,
        value: m.id,
      })),
      default: models.find((m) => m.id === currentModel)?.id ?? models[0].id,
    });

    return chosen;
  } catch (error) {
    modelSpinner.fail('Failed to connect to Copilot CLI.');
    console.log(chalk.yellow('  Make sure you are authenticated: copilot auth login'));
    console.log(chalk.yellow(`  Keeping current model: ${currentModel}\n`));
    await stopRuntime().catch(() => {});
    return currentModel;
  }
}

function ensureSoulFile(workspacePath: string): void {
  const soulPath = getSoulPath(workspacePath);
  if (existsSync(soulPath)) return;

  // Copy the template from templates/SOUL.md
  const devTemplatePath = join(process.cwd(), 'templates', 'SOUL.md');
  const distTemplatePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'SOUL.md');
  const src = existsSync(devTemplatePath) ? devTemplatePath : distTemplatePath;

  if (existsSync(src)) {
    mkdirSync(dirname(soulPath), { recursive: true });
    copyFileSync(src, soulPath);
    logger.debug(`Soul file created at ${soulPath}`);
  }
}

function ensureGitignore(workspacePath: string): void {
  const gitignorePath = join(workspacePath, '.gitignore');
  if (existsSync(gitignorePath)) return;

  const devPath = join(process.cwd(), 'templates', '_.gitignore');
  const distPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', '_.gitignore');
  const src = existsSync(devPath) ? devPath : distPath;

  if (existsSync(src)) {
    copyFileSync(src, gitignorePath);
    logger.debug(`Gitignore created at ${gitignorePath}`);
  }
}
