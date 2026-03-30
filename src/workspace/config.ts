import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../utils/logger.js';

export type ProviderConfig = {
  type: 'openai' | 'azure' | 'anthropic';
  baseUrl: string;
  apiKey?: string;
};

export type ChannelConfig = {
  type: 'telegram' | 'http';
  enabled: boolean;
  telegramToken?: string;
  httpPort?: number;
  httpApiKey?: string;
  allowList?: string[];
};

export type WebConfig = {
  setupEnabled: boolean;
};

export type CawpilotConfig = {
  channels: ChannelConfig[];
  repos: string[];
  skills: string[];
  maxConcurrency: number;
  contextMessagesCount: number;
  cleanupIntervalDays: number;
  persistence: {
    enabled: boolean;
    repo: string;
    backupIntervalDays: number;
  };
  web: WebConfig;
  provider?: ProviderConfig;
  models: {
    orchestrator: string;
    task: string;
  };
  workspacePath: string;
};

const DEFAULT_CONFIG: CawpilotConfig = {
  channels: [],
  repos: [],
  skills: [],
  maxConcurrency: 5,
  contextMessagesCount: 10,
  cleanupIntervalDays: 7,
  persistence: {
    enabled: false,
    repo: '',
    backupIntervalDays: 1,
  },
  web: {
    setupEnabled: true,
  },
  models: {
    orchestrator: 'gpt-4.1',
    task: 'gpt-4.1',
  },
  workspacePath: '',
};

export function getConfigPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'config.json');
}

export function getDbPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'db', 'data.sqlite');
}

export function getSkillsPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'skills');
}

export function getSoulPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'SOUL.md');
}

export function getUserPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'USER.md');
}

export function getAttachmentsPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', 'attachments');
}

/**
 * Returns paths to context files (SOUL.md, USER.md) that exist in the workspace.
 * These are attached to task sessions for personality and user context.
 */
export function getContextFiles(workspacePath: string): string[] {
  return [getSoulPath(workspacePath), getUserPath(workspacePath)].filter((p) =>
    existsSync(p),
  );
}

export function loadSoul(workspacePath: string): string | undefined {
  const soulPath = getSoulPath(workspacePath);
  if (!existsSync(soulPath)) return undefined;
  return readFileSync(soulPath, 'utf8');
}

export function loadConfig(workspacePath: string): CawpilotConfig {
  const configPath = getConfigPath(workspacePath);
  if (!existsSync(configPath)) {
    logger.debug(`No config found at ${configPath}, using defaults`);
    return { ...DEFAULT_CONFIG, workspacePath };
  }

  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<CawpilotConfig>;
  const config = { ...DEFAULT_CONFIG, ...parsed, workspacePath };
  logger.debug(`Config loaded from ${configPath}`);
  return config;
}

export function saveConfig(config: CawpilotConfig): void {
  const configPath = getConfigPath(config.workspacePath);
  mkdirSync(dirname(configPath), { recursive: true });

  const { workspacePath: _, ...toSave } = config;
  writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf8');
  logger.info(`Config saved to ${configPath}`);
}

export function configExists(workspacePath: string): boolean {
  return existsSync(getConfigPath(workspacePath));
}
