import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CawPilotConfig } from '../core/config.js';

const CONFIG_PATH = join(process.cwd(), '.cawpilot', 'config.json');

export async function loadConfig(): Promise<CawPilotConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as CawPilotConfig;
  } catch {
    return getDefaultConfig();
  }
}

export async function saveConfig(config: CawPilotConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getDefaultConfig(): CawPilotConfig {
  return {
    messaging: {
      platform: 'signal',
      signalPhoneNumber: '',
    },
    github: {
      repos: [],
    },
    workspace: {
      path: './workspace',
    },
    branching: {
      prefix: 'ocp-',
    },
    skills: [],
  };
}
