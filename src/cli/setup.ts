import { input, checkbox } from '@inquirer/prompts';
import { loadConfig, saveConfig, hasExistingConfig } from './config.js';
import { ensureGitHubAuth, selectRepos } from './github.js';
import type { CawPilotConfig } from '../core/config.js';

export async function runSetup(): Promise<void> {
  const existing = await hasExistingConfig();
  const current = await loadConfig();

  if (existing) {
    console.log('\n🐦 CawPilot Setup (reconfigure)\n');
    console.log(`   Current channel: ${current.channel.name}`);
    console.log(`   Current repos: ${current.github.repos.length > 0 ? current.github.repos.join(', ') : 'none'}`);
    console.log(`   Current skills: ${current.skills.length > 0 ? current.skills.join(', ') : 'none'}\n`);
  } else {
    console.log('\n🐦 CawPilot Setup\n');
  }

  // Step 1: Telegram channel setup
  const currentToken = (current.channel.options?.botToken as string) ?? '';

  console.log('🤖 Telegram bot setup:');
  console.log('   1. Open Telegram and message @BotFather');
  console.log('   2. Send /newbot and follow the prompts');
  console.log('   3. Copy the bot token and paste it below\n');

  const telegramBotToken = await input({
    message: 'Telegram bot token:',
    default: currentToken || undefined,
  });

  // Step 2: GitHub authentication via GitHub CLI
  await ensureGitHubAuth();

  // Step 3: Interactive repo selection (pre-select existing repos)
  const repos = await selectRepos(current.github.repos);

  // Step 4: Todo repo
  const todoRepo = await input({
    message: 'Private repo for todo list (e.g. your-user/todo):',
    default: current.github.todoRepo ?? '',
  });

  // Step 5: Choose skills
  const skills = await checkbox({
    message: 'Enable skills:',
    choices: [
      { name: 'tunnel — Expose local ports with a public URL', value: 'tunnel', checked: current.skills.includes('tunnel') || !existing },
      { name: 'todo — Manage tasks in a private GitHub repo', value: 'todo', checked: current.skills.includes('todo') || !existing },
      { name: 'review — Code review assistance', value: 'review', checked: current.skills.includes('review') || !existing },
      { name: 'git — Git operations with branch safety', value: 'git', checked: current.skills.includes('git') || !existing },
    ],
  });

  // Step 6: Branch prefix
  const branchPrefix = await input({
    message: 'Branch prefix for safe operations:',
    default: current.branching.prefix,
  });

  const config: CawPilotConfig = {
    channel: {
      name: 'telegram',
      options: {
        botToken: telegramBotToken || undefined,
        allowedChatIds: (current.channel.options?.allowedChatIds as number[]) ?? [],
      },
    },
    github: {
      repos,
      todoRepo: todoRepo || undefined,
    },
    workspace: {
      path: current.workspace.path,
    },
    branching: {
      prefix: branchPrefix,
    },
    skills,
  };

  await saveConfig(config);
  console.log('\n✅ Configuration saved to .cawpilot/config.json');
  console.log('   Run `cawpilot start` to begin.\n');
}
