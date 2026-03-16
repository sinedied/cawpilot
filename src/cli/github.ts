import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkbox, confirm, input } from '@inquirer/prompts';

const exec = promisify(execFile);

export async function ensureGitHubAuth(): Promise<void> {
  console.log('🔑 Checking GitHub authentication via GitHub CLI...\n');

  if (!(await isGhInstalled())) {
    console.error(
      'GitHub CLI (gh) is not installed.\n' +
        'Install it from https://cli.github.com/ and run `gh auth login` first.',
    );
    process.exit(1);
  }

  if (await isGhAuthenticated()) {
    const username = await getGhUsername();
    console.log(`✅ Authenticated as ${username}\n`);
    return;
  }

  console.log('You are not logged in. Starting GitHub CLI authentication...\n');
  await runGhAuthLogin();

  if (!(await isGhAuthenticated())) {
    console.error('GitHub authentication failed. Please run `gh auth login` manually.');
    process.exit(1);
  }

  const username = await getGhUsername();
  console.log(`\n✅ Authenticated as ${username}\n`);
}

export async function selectRepos(preSelected: string[] = []): Promise<string[]> {
  const wantRepos = await confirm({
    message: 'Connect GitHub repositories?',
    default: true,
  });

  if (!wantRepos) {
    return [];
  }

  console.log('\n📂 Fetching your repositories...');
  const allRepos = await fetchRepos();

  if (allRepos.length === 0) {
    console.log('No repositories found.');
    return preSelected;
  }

  console.log(`   Found ${allRepos.length} repositories.\n`);
  console.log('   Type to filter, space to toggle, enter to confirm.\n');

  const selected = await searchableCheckbox(allRepos, new Set(preSelected));
  return selected;
}

async function isGhInstalled(): Promise<boolean> {
  try {
    await exec('gh', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function isGhAuthenticated(): Promise<boolean> {
  try {
    await exec('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

async function getGhUsername(): Promise<string> {
  const { stdout } = await exec('gh', ['api', 'user', '--jq', '.login']);
  return stdout.trim();
}

async function runGhAuthLogin(): Promise<void> {
  const { spawn } = await import('node:child_process');
  return new Promise<void>((resolve, reject) => {
    const child = spawn('gh', ['auth', 'login'], {
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gh auth login exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function fetchRepos(): Promise<string[]> {
  try {
    const { stdout } = await exec('gh', [
      'repo',
      'list',
      '--limit',
      '200',
      '--json',
      'nameWithOwner',
      '--jq',
      '.[].nameWithOwner',
    ]);
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error('Failed to fetch repositories:', error);
    return [];
  }
}

async function searchableCheckbox(repos: string[], initial: Set<string> = new Set()): Promise<string[]> {
  let filter = '';
  let selected = new Set<string>(initial);

  while (true) {
    const filtered = filter
      ? repos.filter((r) => r.toLowerCase().includes(filter.toLowerCase()))
      : repos;

    const choices = filtered.map((repo) => ({
      name: repo,
      value: repo,
      checked: selected.has(repo),
    }));

    if (choices.length === 0 && filter) {
      // No matches — let user refine the filter
      filter = await input({
        message: `No repos match "${filter}". Search (leave empty to show all):`,
        default: '',
      });
      continue;
    }

    const result = await checkbox<string>({
      message: `Select repositories${filter ? ` (filter: "${filter}")` : ''} — ${selected.size} selected`,
      choices,
      pageSize: 15,
      loop: false,
    });

    // Update selected set: add newly checked, remove unchecked from visible list
    for (const repo of filtered) {
      if (result.includes(repo)) {
        selected.add(repo);
      } else {
        selected.delete(repo);
      }
    }

    const action = await input({
      message: `${selected.size} repo(s) selected. Type to filter, or press Enter to confirm:`,
      default: '',
    });

    if (action === '') {
      break;
    }

    filter = action;
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}
