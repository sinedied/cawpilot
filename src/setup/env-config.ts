import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChannelConfig } from '../workspace/config.js';
import { logger } from '../utils/logger.js';

export type EnvStepStatus = {
  ghAuth: { available: boolean; user?: string };
  telegramToken: { available: boolean };
  model: { available: boolean; value?: string };
};

/**
 * Check GitHub auth status by running `gh auth status`.
 * Returns the authenticated username if successful.
 */
export function checkGitHubAuth(): string | undefined {
  try {
    const result = execSync('gh api user -q .login', { stdio: 'pipe' });
    return result.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Authenticate GitHub CLI with a token.
 * Returns the authenticated username if successful.
 */
export function authenticateGitHub(token: string): string | undefined {
  try {
    execSync('gh auth login --with-token', {
      input: token,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return checkGitHubAuth();
  } catch {
    return undefined;
  }
}

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

  // GH_TOKEN — try to authenticate, then verify
  if (process.env.GH_TOKEN) {
    const user = checkGitHubAuth() ?? authenticateGitHub(process.env.GH_TOKEN);
    if (user) {
      status.ghAuth = { available: true, user };
    }
  } else {
    const user = checkGitHubAuth();
    if (user) {
      status.ghAuth = { available: true, user };
    }
  }

  // TELEGRAM_TOKEN
  if (process.env.TELEGRAM_TOKEN) {
    status.telegramToken = { available: true };
  }

  // COPILOT_MODEL
  if (process.env.COPILOT_MODEL) {
    status.model = { available: true, value: process.env.COPILOT_MODEL };
  }

  return status;
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

  // Ensure HTTP channel exists (always enabled for web setup/API)
  const existingHttp = channels.find((c) => c.type === 'http');
  if (!existingHttp) {
    channels.push({
      type: 'http',
      enabled: true,
      httpPort: 2243,
      httpApiKey: randomBytes(24).toString('base64url'),
    });
  }

  return channels;
}

/**
 * List available skills from a skills directory.
 */
export function listSkillDirs(skillsRoot: string): string[] {
  try {
    if (!existsSync(skillsRoot)) return [];
    return readdirSync(skillsRoot, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() && existsSync(join(skillsRoot, d.name, 'SKILL.md')),
      )
      .map((d) => d.name);
  } catch {
    logger.warn('Failed to list skills');
    return [];
  }
}
