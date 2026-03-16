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
      { name: 'Signal', value: 'signal' as const },
      { name: 'WhatsApp', value: 'whatsapp' as const },
      { name: 'Telegram (coming soon)', value: 'telegram' as const, disabled: true },
    ],
  });

  // Step 2: Signal-specific setup
  let signalPhoneNumber = '';

  if (platform === 'signal') {
    signalPhoneNumber = await input({
      message: 'Your Signal phone number (international format, e.g. +1234567890):',
    });

    const shouldLink = await confirm({
      message: 'Link CawPilot as a secondary Signal device now?',
      default: true,
    });

    if (shouldLink) {
      console.log('\n📱 Linking Signal device...');
      console.log('   A QR code will appear — scan it from Signal > Settings > Linked Devices\n');

      const { SignalCli } = await import('signal-sdk');
      const signal = new SignalCli(signalPhoneNumber);
      try {
        await signal.deviceLink({ name: 'cawpilot' });
        console.log('\n✅ Signal device linked successfully!\n');
      } catch (error) {
        console.error('\n⚠️  Device linking failed:', error);
        console.log('   You can retry later with: npx signal-sdk connect "cawpilot"\n');
      } finally {
        await signal.gracefulShutdown().catch(() => {});
      }
    } else {
      console.log('\n   You can link later with: npx signal-sdk connect "cawpilot"\n');
    }
  }

  // Step 2b: WhatsApp-specific setup
  if (platform === 'whatsapp') {
    console.log('\n📱 WhatsApp uses Baileys (pure Node.js, no external dependencies).');
    console.log('   On first start, a QR code will appear in the terminal.');
    console.log('   Scan it from WhatsApp > Settings > Linked Devices > Link a Device\n');
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
