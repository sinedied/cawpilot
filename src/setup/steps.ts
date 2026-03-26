import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  readdirSync,
  existsSync,
  cpSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkillsPath, type ChannelConfig } from '../workspace/config.js';
import { getGitHubUser } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';

// Re-export for consumers that import from this module
export { getGitHubUser } from '../workspace/manager.js';

// ── GitHub Auth ─────────────────────────────────────────────────────────────

/**
 * Authenticate GitHub CLI with a personal access token.
 * Returns the authenticated username if successful.
 */
export function authenticateGitHub(token: string): string | undefined {
  try {
    execSync('gh auth login --with-token', {
      input: token,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return getGitHubUser();
  } catch {
    return undefined;
  }
}

// ── Env Var Status ──────────────────────────────────────────────────────────

export type EnvStepStatus = {
  ghAuth: { available: boolean; user?: string };
  telegramToken: { available: boolean };
  model: { available: boolean; value?: string };
};

/**
 * Resolve env vars into step completion status.
 * Auth env vars are only marked available if auth check passes.
 */
export function resolveEnvStatus(): EnvStepStatus {
  const status: EnvStepStatus = {
    ghAuth: { available: false },
    telegramToken: { available: false },
    model: { available: false },
  };

  if (process.env.GH_TOKEN) {
    const user = getGitHubUser() ?? authenticateGitHub(process.env.GH_TOKEN);
    if (user) {
      status.ghAuth = { available: true, user };
    }
  } else {
    const user = getGitHubUser();
    if (user) {
      status.ghAuth = { available: true, user };
    }
  }

  if (process.env.TELEGRAM_TOKEN) {
    status.telegramToken = { available: true };
  }

  if (process.env.COPILOT_MODEL) {
    status.model = { available: true, value: process.env.COPILOT_MODEL };
  }

  return status;
}

// ── Skills ──────────────────────────────────────────────────────────────────

/**
 * Resolve the root skills directory (dev or dist).
 */
export function getSkillsRoot(): string {
  const devPath = join(process.cwd(), 'skills');
  const distPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'skills',
  );
  return existsSync(devPath) ? devPath : distPath;
}

/**
 * List available skill names from a skills directory.
 */
export function listAvailableSkills(skillsRoot?: string): string[] {
  const root = skillsRoot ?? getSkillsRoot();
  try {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && existsSync(join(root, d.name, 'SKILL.md')),
      )
      .map((d) => d.name);
  } catch {
    logger.warn('Failed to list skills');
    return [];
  }
}

/**
 * Copy selected skills from the skills root to the workspace.
 */
export function copyEnabledSkills(
  workspacePath: string,
  skills: string[],
  skillsRoot?: string,
): void {
  const targetDir = getSkillsPath(workspacePath);
  mkdirSync(targetDir, { recursive: true });
  const root = skillsRoot ?? getSkillsRoot();

  for (const skill of skills) {
    const src = join(root, skill);
    const dest = join(targetDir, skill);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
      logger.debug(`Copied skill ${skill} to workspace`);
    }
  }
}

// ── Channels ────────────────────────────────────────────────────────────────

const DEFAULT_HTTP_PORT = 2243;

/**
 * Generate a random API key for the HTTP channel.
 */
export function generateApiKey(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Sanitize and normalize channel configs (from user input or API).
 */
export function sanitizeChannels(channels: ChannelConfig[]): ChannelConfig[] {
  return channels
    .filter((c) => c.type === 'telegram' || c.type === 'http')
    .map((c) => ({
      type: c.type,
      enabled: c.enabled ?? true,
      ...(c.type === 'telegram' && {
        telegramToken: c.telegramToken,
        allowList: c.allowList ?? [],
      }),
      ...(c.type === 'http' && {
        httpPort: c.httpPort ?? DEFAULT_HTTP_PORT,
        httpApiKey: c.httpApiKey ?? generateApiKey(),
      }),
    }));
}

/**
 * Build channel configs from env vars, merging with existing config.
 */
export function buildChannelsFromEnv(
  existing: ChannelConfig[],
): ChannelConfig[] {
  const channels = [...existing];
  const telegramToken = process.env.TELEGRAM_TOKEN;

  if (telegramToken) {
    const existingTg = channels.find((c) => c.type === 'telegram');
    if (existingTg) {
      existingTg.telegramToken = telegramToken;
      existingTg.enabled = true;
    } else {
      channels.push({
        type: 'telegram',
        enabled: true,
        telegramToken,
        allowList: [],
      });
    }
  }

  const existingHttp = channels.find((c) => c.type === 'http');
  if (!existingHttp) {
    channels.push({
      type: 'http',
      enabled: true,
      httpPort: DEFAULT_HTTP_PORT,
      httpApiKey: generateApiKey(),
    });
  }

  return channels;
}

// ── Templates ───────────────────────────────────────────────────────────────

/**
 * Resolve a template file path (dev or dist).
 */
function resolveTemplatePath(filename: string): string | undefined {
  const devPath = join(process.cwd(), 'templates', filename);
  if (existsSync(devPath)) return devPath;

  const distPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'templates',
    filename,
  );
  if (existsSync(distPath)) return distPath;

  return undefined;
}

/**
 * Ensure a template file exists in the workspace .cawpilot/ directory.
 */
export function ensureTemplate(workspacePath: string, filename: string): void {
  const targetPath = join(workspacePath, '.cawpilot', filename);
  if (existsSync(targetPath)) return;

  const src = resolveTemplatePath(filename);
  if (src) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(src, targetPath);
    logger.debug(`Template ${filename} created at ${targetPath}`);
  }
}

/**
 * Ensure .gitignore exists in the workspace root.
 */
export function ensureGitignore(workspacePath: string): void {
  const gitignorePath = join(workspacePath, '.gitignore');
  if (existsSync(gitignorePath)) return;

  const src = resolveTemplatePath('_.gitignore');
  if (src) {
    copyFileSync(src, gitignorePath);
    logger.debug(`Gitignore created at ${gitignorePath}`);
  }
}

/**
 * Finalize setup: copy skills, ensure templates.
 */
export function finalizeSetup(workspacePath: string, skills: string[]): void {
  copyEnabledSkills(workspacePath, skills);
  ensureTemplate(workspacePath, 'SOUL.md');
  ensureTemplate(workspacePath, 'USER.md');
}
