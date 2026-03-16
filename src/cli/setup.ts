import { select, input, checkbox, confirm } from '@inquirer/prompts';
import { loadConfig, saveConfig, hasExistingConfig } from './config.js';
import { ensureGitHubAuth, selectRepos } from './github.js';
import type { CawPilotConfig } from '../core/config.js';

export async function runSetup(): Promise<void> {
  const existing = await hasExistingConfig();
  const current = await loadConfig();

  if (existing) {
    console.log('\n🐦 CawPilot Setup (reconfigure)\n');
    console.log(`   Current platform: ${current.messaging.platform}`);
    console.log(`   Current repos: ${current.github.repos.length > 0 ? current.github.repos.join(', ') : 'none'}`);
    console.log(`   Current skills: ${current.skills.length > 0 ? current.skills.join(', ') : 'none'}\n`);
  } else {
    console.log('\n🐦 CawPilot Setup\n');
  }

  // Step 1: Choose messaging platform
  const platform = await select({
    message: 'Choose a messaging platform:',
    default: current.messaging.platform,
    choices: [
      { name: 'Signal', value: 'signal' as const },
      { name: 'WhatsApp', value: 'whatsapp' as const },
      { name: 'Telegram (coming soon)', value: 'telegram' as const, disabled: true },
    ],
  });

  // Step 2: Signal-specific setup
  let signalPhoneNumber = current.messaging.signalPhoneNumber ?? '';

  if (platform === 'signal') {
    signalPhoneNumber = await input({
      message: 'Your Signal phone number (international format, e.g. +1234567890):',
      default: signalPhoneNumber || undefined,
    });

    const shouldLink = await confirm({
      message: 'Link CawPilot as a secondary Signal device now?',
      default: !existing,
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

  // Step 4: Interactive repo selection (pre-select existing repos)
  const repos = await selectRepos(current.github.repos);

  // Step 5: Todo repo
  const todoRepo = await input({
    message: 'Private repo for todo list (e.g. your-user/todo):',
    default: current.github.todoRepo ?? '',
  });

  // Step 6: Choose skills
  const skills = await checkbox({
    message: 'Enable skills:',
    choices: [
      { name: 'tunnel — Expose local ports with a public URL', value: 'tunnel', checked: current.skills.includes('tunnel') || !existing },
      { name: 'todo — Manage tasks in a private GitHub repo', value: 'todo', checked: current.skills.includes('todo') || !existing },
      { name: 'review — Code review assistance', value: 'review', checked: current.skills.includes('review') || !existing },
      { name: 'git — Git operations with branch safety', value: 'git', checked: current.skills.includes('git') || !existing },
    ],
  });

  // Step 7: Branch prefix
  const branchPrefix = await input({
    message: 'Branch prefix for safe operations:',
    default: current.branching.prefix,
  });

  const config: CawPilotConfig = {
    messaging: {
      platform,
      signalPhoneNumber,
      whatsappAuthDir: current.messaging.whatsappAuthDir,
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
