import { select, input, checkbox, confirm } from '@inquirer/prompts';
import { saveConfig } from './config.js';
import { ensureGitHubAuth, selectRepos } from './github.js';
import type { CawPilotConfig } from '../core/config.js';

export async function runSetup(): Promise<void> {
  console.log('\n🐦 CawPilot Setup\n');

  // Step 1: Choose messaging platform
  const platform = await select({
    message: 'Choose a messaging platform:',
    choices: [
      { name: 'Signal (recommended)', value: 'signal' as const },
      { name: 'WhatsApp (coming soon)', value: 'whatsapp' as const, disabled: true },
      { name: 'Telegram (coming soon)', value: 'telegram' as const, disabled: true },
    ],
  });

  // Step 2: Signal-specific setup
  let signalApiUrl = 'http://localhost:8080';
  let signalPhoneNumber = '';

  if (platform === 'signal') {
    signalApiUrl = await input({
      message: 'Signal API URL:',
      default: 'http://localhost:8080',
    });

    signalPhoneNumber = await input({
      message: 'Your Signal phone number (international format, e.g. +1234567890):',
    });

    console.log('\n📱 To link Signal, open this URL in your browser:');
    console.log(`   ${signalApiUrl}/v1/qrcodelink?device_name=cawpilot`);
    console.log('   Then scan the QR code from Signal > Settings > Linked Devices\n');
  }

  // Step 3: GitHub authentication via GitHub CLI
  await ensureGitHubAuth();

  // Step 4: Interactive repo selection
  const repos = await selectRepos();

  // Step 5: Todo repo
  const todoRepo = await input({
    message: 'Private repo for todo list (e.g. your-user/todo):',
    default: '',
  });

  // Step 6: Choose skills
  const skills = await checkbox({
    message: 'Enable skills:',
    choices: [
      { name: 'tunnel — Expose local ports with a public URL', value: 'tunnel', checked: true },
      { name: 'todo — Manage tasks in a private GitHub repo', value: 'todo', checked: true },
      { name: 'review — Code review assistance', value: 'review', checked: true },
      { name: 'git — Git operations with branch safety', value: 'git', checked: true },
    ],
  });

  // Step 7: Branch prefix
  const branchPrefix = await input({
    message: 'Branch prefix for safe operations:',
    default: 'ocp-',
  });

  const config: CawPilotConfig = {
    messaging: {
      platform,
      signalApiUrl,
      signalPhoneNumber,
    },
    github: {
      repos,
      todoRepo: todoRepo || undefined,
    },
    workspace: {
      path: './workspace',
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
