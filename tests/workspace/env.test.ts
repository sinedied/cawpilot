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
  getEnvPath,
  loadEnvFile,
  saveEnvValue,
} from '../../src/workspace/env.js';

describe('workspace/env', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cawpilot-test-${randomUUID()}`);
    mkdirSync(join(tmpDir, '.cawpilot'), { recursive: true });
    // Save env vars we might modify
    savedEnv.GH_TOKEN = process.env.GH_TOKEN;
    savedEnv.TEST_VAR = process.env.TEST_VAR;
    delete process.env.GH_TOKEN;
    delete process.env.TEST_VAR;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns correct env path', () => {
    expect(getEnvPath('/workspace')).toBe('/workspace/.cawpilot/.env');
  });

  it('does nothing when .env file does not exist', () => {
    // Should not throw
    loadEnvFile(tmpDir);
  });

  it('loads KEY=VALUE pairs into process.env', () => {
    const envPath = getEnvPath(tmpDir);
    writeFileSync(envPath, 'GH_TOKEN=ghp_test123\nTEST_VAR=hello\n');

    loadEnvFile(tmpDir);

    expect(process.env.GH_TOKEN).toBe('ghp_test123');
    expect(process.env.TEST_VAR).toBe('hello');
  });

  it('skips comments and blank lines', () => {
    const envPath = getEnvPath(tmpDir);
    writeFileSync(
      envPath,
      '# This is a comment\n\nGH_TOKEN=ghp_abc\n  # Another comment\n',
    );

    loadEnvFile(tmpDir);

    expect(process.env.GH_TOKEN).toBe('ghp_abc');
  });

  it('does not overwrite existing env vars (runtime takes precedence)', () => {
    process.env.GH_TOKEN = 'runtime_token';
    const envPath = getEnvPath(tmpDir);
    writeFileSync(envPath, 'GH_TOKEN=file_token\n');

    loadEnvFile(tmpDir);

    expect(process.env.GH_TOKEN).toBe('runtime_token');
  });

  it('saves a new key to .env file', () => {
    saveEnvValue(tmpDir, 'GH_TOKEN', 'ghp_saved');

    const content = readFileSync(getEnvPath(tmpDir), 'utf8');
    expect(content).toContain('GH_TOKEN=ghp_saved');
  });

  it('upserts an existing key in .env file', () => {
    const envPath = getEnvPath(tmpDir);
    writeFileSync(envPath, 'GH_TOKEN=old_value\nOTHER=keep\n');

    saveEnvValue(tmpDir, 'GH_TOKEN', 'new_value');

    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('GH_TOKEN=new_value');
    expect(content).toContain('OTHER=keep');
    expect(content).not.toContain('old_value');
  });

  it('creates .cawpilot directory if it does not exist', () => {
    const freshDir = join(tmpdir(), `cawpilot-test-${randomUUID()}`);
    mkdirSync(freshDir, { recursive: true });

    saveEnvValue(freshDir, 'GH_TOKEN', 'ghp_new');

    expect(existsSync(getEnvPath(freshDir))).toBe(true);
    const content = readFileSync(getEnvPath(freshDir), 'utf8');
    expect(content).toContain('GH_TOKEN=ghp_new');

    rmSync(freshDir, { recursive: true, force: true });
  });
});
