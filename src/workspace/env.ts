import process from 'node:process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../utils/logger.js';

export function getEnvPath(workspacePath: string): string {
  return join(workspacePath, '.cawpilot', '.env');
}

/**
 * Load KEY=VALUE pairs from .cawpilot/.env into process.env.
 * Existing env vars take precedence (e.g. GH_TOKEN from `docker run -e`).
 */
export function loadEnvFile(workspacePath: string): void {
  const envPath = getEnvPath(workspacePath);
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) continue;

    // Only set if not already defined — runtime env vars take precedence
    if (process.env[key] === undefined) {
      process.env[key] = value;
      logger.debug(`Loaded ${key} from .env`);
    }
  }
}

/**
 * Upsert a key in the .cawpilot/.env file.
 */
export function saveEnvValue(
  workspacePath: string,
  key: string,
  value: string,
): void {
  const envPath = getEnvPath(workspacePath);
  mkdirSync(dirname(envPath), { recursive: true });

  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf8').split('\n');
  }

  const prefix = `${key}=`;
  const idx = lines.findIndex(
    (l) => l.trim().startsWith(prefix) || l.trim().startsWith(`${key} =`),
  );
  const newLine = `${key}=${value}`;

  if (idx === -1) {
    lines.push(newLine);
  } else {
    lines[idx] = newLine;
  }

  writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  logger.debug(`Saved ${key} to ${envPath}`);
}
