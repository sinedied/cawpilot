import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../utils/logger.js';

export interface ProviderConfig {
  type: 'openai' | 'azure' | 'anthropic';
  baseUrl: string;
  apiKey?: string;
}

export interface ChannelConfig {
  type: 'telegram' | 'http';
  enabled: boolean;
  telegramToken?: string;
  httpPort?: number;
  httpApiKey?: string;
  allowList?: string[];
}

export interface CawpilotConfig {
  channels: ChannelConfig[];
  repos: string[];
  skills: string[];
  maxConcurrency: number;
  contextMessagesCount: number;
  cleanupIntervalDays: number;
  persistence: {
    enabled: boolean;
    repo: string;
  };
  provider?: ProviderConfig;
  model: string;
  workspacePath: string;
}

const DEFAULT_CONFIG: CawpilotConfig = {
  channels: [],
  repos: [],
  skills: [],
  maxConcurrency: 3,
  contextMessagesCount: 10,
  cleanupIntervalDays: 7,
  persistence: {
    enabled: false,
    repo: '',
  },
  model: 'gpt-4.1',
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

export function loadSoul(workspacePath: string): string | undefined {
  const soulPath = getSoulPath(workspacePath);
  if (!existsSync(soulPath)) return undefined;
  return readFileSync(soulPath, 'utf-8');
}

export function loadConfig(workspacePath: string): CawpilotConfig {
  const configPath = getConfigPath(workspacePath);
  if (!existsSync(configPath)) {
    logger.debug(`No config found at ${configPath}, using defaults`);
    return { ...DEFAULT_CONFIG, workspacePath };
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<CawpilotConfig>;
  const config = { ...DEFAULT_CONFIG, ...parsed, workspacePath };
  logger.debug(`Config loaded from ${configPath}`);
  return config;
}

export function saveConfig(config: CawpilotConfig): void {
  const configPath = getConfigPath(config.workspacePath);
  mkdirSync(dirname(configPath), { recursive: true });

  const { workspacePath: _, ...toSave } = config;
  writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
  logger.info(`Config saved to ${configPath}`);
}

export function configExists(workspacePath: string): boolean {
  return existsSync(getConfigPath(workspacePath));
}
