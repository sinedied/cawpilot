import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  loadConfig,
  saveConfig,
  configExists,
  getConfigPath,
  getDbPath,
  getSkillsPath,
  type CawpilotConfig,
} from '../../src/workspace/config.js';

describe('workspace/config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cawpilot-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns correct paths', () => {
    expect(getConfigPath('/workspace')).toBe(
      '/workspace/.cawpilot/config.json',
    );
    expect(getDbPath('/workspace')).toBe('/workspace/.cawpilot/db/data.sqlite');
    expect(getSkillsPath('/workspace')).toBe('/workspace/.cawpilot/skills');
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.channels).toEqual([]);
    expect(config.repos).toEqual([]);
    expect(config.skills).toEqual([]);
    expect(config.maxConcurrency).toBe(5);
    expect(config.models).toEqual({ orchestrator: 'gpt-4.1', task: 'gpt-4.1' });
    expect(config.workspacePath).toBe(tmpDir);
  });

  it('reports config does not exist', () => {
    expect(configExists(tmpDir)).toBe(false);
  });

  it('saves and loads config', () => {
    const config: CawpilotConfig = {
      channels: [{ type: 'telegram', enabled: true, telegramToken: 'tok' }],
      repos: ['user/repo'],
      skills: ['local-tunnel'],
      maxConcurrency: 5,
      persistence: { enabled: true, repo: 'user/my-cawpilot' },
      models: { orchestrator: 'claude-sonnet-4.5', task: 'claude-sonnet-4.5' },
      workspacePath: tmpDir,
    };

    saveConfig(config);
    expect(configExists(tmpDir)).toBe(true);

    const loaded = loadConfig(tmpDir);
    expect(loaded.channels).toHaveLength(1);
    expect(loaded.channels[0].telegramToken).toBe('tok');
    expect(loaded.repos).toEqual(['user/repo']);
    expect(loaded.skills).toEqual(['local-tunnel']);
    expect(loaded.models).toEqual({ orchestrator: 'claude-sonnet-4.5', task: 'claude-sonnet-4.5' });
    expect(loaded.maxConcurrency).toBe(5);
  });

  it('does not save workspacePath in the file', () => {
    const config: CawpilotConfig = {
      channels: [],
      repos: [],
      skills: [],
      maxConcurrency: 5,
      persistence: { enabled: false, repo: '' },
      models: { orchestrator: 'gpt-4.1', task: 'gpt-4.1' },
      workspacePath: tmpDir,
    };

    saveConfig(config);

    const raw = readFileSync(getConfigPath(tmpDir), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.workspacePath).toBeUndefined();
  });
});
