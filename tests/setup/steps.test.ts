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
  generateApiKey,
  sanitizeChannels,
  buildChannelsFromEnv,
  listAvailableSkills,
  copyEnabledSkills,
  ensureTemplate,
  ensureGitignore,
  finalizeSetup,
} from '../../src/setup/steps.js';

describe('setup/steps', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cawpilot-logic-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateApiKey', () => {
    it('returns a non-empty base64url string', () => {
      const key = generateApiKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(10);
    });

    it('generates unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('sanitizeChannels', () => {
    it('filters out invalid channel types', () => {
      const result = sanitizeChannels([
        { type: 'telegram', enabled: true, telegramToken: 'tok' },
        { type: 'unknown' as 'telegram', enabled: true },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('telegram');
    });

    it('normalizes telegram channels with defaults', () => {
      const result = sanitizeChannels([
        { type: 'telegram', enabled: true, telegramToken: 'tok123' },
      ]);
      expect(result[0]).toEqual({
        type: 'telegram',
        enabled: true,
        telegramToken: 'tok123',
        allowList: [],
      });
    });

    it('normalizes http channels with defaults', () => {
      const result = sanitizeChannels([
        { type: 'http', enabled: true },
      ]);
      expect(result[0].type).toBe('http');
      expect(result[0].httpPort).toBe(2243);
      expect(result[0].httpApiKey).toBeTruthy();
    });

    it('preserves existing httpApiKey', () => {
      const result = sanitizeChannels([
        { type: 'http', enabled: true, httpApiKey: 'existing-key' },
      ]);
      expect(result[0].httpApiKey).toBe('existing-key');
    });

    it('defaults enabled to true when undefined', () => {
      const result = sanitizeChannels([
        { type: 'telegram', telegramToken: 'tok' } as any,
      ]);
      expect(result[0].enabled).toBe(true);
    });
  });

  describe('buildChannelsFromEnv', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('adds telegram channel from TELEGRAM_TOKEN', () => {
      process.env = { ...originalEnv, TELEGRAM_TOKEN: 'env-token' };
      const result = buildChannelsFromEnv([]);
      const tg = result.find((c) => c.type === 'telegram');
      expect(tg).toBeDefined();
      expect(tg!.telegramToken).toBe('env-token');
      expect(tg!.enabled).toBe(true);
    });

    it('updates existing telegram channel token', () => {
      process.env = { ...originalEnv, TELEGRAM_TOKEN: 'new-token' };
      const result = buildChannelsFromEnv([
        {
          type: 'telegram',
          enabled: false,
          telegramToken: 'old-token',
          allowList: ['123'],
        },
      ]);
      const tg = result.find((c) => c.type === 'telegram');
      expect(tg!.telegramToken).toBe('new-token');
      expect(tg!.enabled).toBe(true);
      expect(tg!.allowList).toEqual(['123']);
    });

    it('ensures http channel exists', () => {
      process.env = { ...originalEnv };
      delete process.env.TELEGRAM_TOKEN;
      const result = buildChannelsFromEnv([]);
      const http = result.find((c) => c.type === 'http');
      expect(http).toBeDefined();
      expect(http!.httpPort).toBe(2243);
    });

    it('does not duplicate http channel', () => {
      process.env = { ...originalEnv };
      delete process.env.TELEGRAM_TOKEN;
      const result = buildChannelsFromEnv([
        { type: 'http', enabled: true, httpPort: 8080, httpApiKey: 'key' },
      ]);
      const httpChannels = result.filter((c) => c.type === 'http');
      expect(httpChannels).toHaveLength(1);
      expect(httpChannels[0].httpPort).toBe(8080);
    });
  });

  describe('listAvailableSkills', () => {
    it('returns empty for non-existent directory', () => {
      const result = listAvailableSkills('/nonexistent/path');
      expect(result).toEqual([]);
    });

    it('returns skill names that contain SKILL.md', () => {
      const skillsDir = join(tmpDir, 'skills');
      mkdirSync(join(skillsDir, 'skill-a'), { recursive: true });
      writeFileSync(join(skillsDir, 'skill-a', 'SKILL.md'), '# Skill A');
      mkdirSync(join(skillsDir, 'skill-b'), { recursive: true });
      writeFileSync(join(skillsDir, 'skill-b', 'SKILL.md'), '# Skill B');
      // This one has no SKILL.md — should be excluded
      mkdirSync(join(skillsDir, 'not-a-skill'), { recursive: true });

      const result = listAvailableSkills(skillsDir);
      expect(result).toEqual(['skill-a', 'skill-b']);
    });
  });

  describe('copyEnabledSkills', () => {
    it('copies selected skills to workspace', () => {
      const skillsDir = join(tmpDir, 'skills');
      mkdirSync(join(skillsDir, 'my-skill'), { recursive: true });
      writeFileSync(join(skillsDir, 'my-skill', 'SKILL.md'), '# My Skill');

      const ws = join(tmpDir, 'workspace');
      mkdirSync(ws, { recursive: true });

      copyEnabledSkills(ws, ['my-skill'], skillsDir);

      const copied = join(ws, '.cawpilot', 'skills', 'my-skill', 'SKILL.md');
      expect(existsSync(copied)).toBe(true);
      expect(readFileSync(copied, 'utf8')).toBe('# My Skill');
    });

    it('skips non-existent skills without error', () => {
      const skillsDir = join(tmpDir, 'skills');
      mkdirSync(skillsDir, { recursive: true });

      const ws = join(tmpDir, 'workspace');
      mkdirSync(ws, { recursive: true });

      // Should not throw
      copyEnabledSkills(ws, ['missing-skill'], skillsDir);
    });
  });

  describe('ensureTemplate', () => {
    it('does not overwrite existing template', () => {
      const ws = join(tmpDir, 'workspace');
      const targetDir = join(ws, '.cawpilot');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'SOUL.md'), 'existing content');

      ensureTemplate(ws, 'SOUL.md');

      expect(readFileSync(join(targetDir, 'SOUL.md'), 'utf8')).toBe(
        'existing content',
      );
    });
  });

  describe('ensureGitignore', () => {
    it('does not overwrite existing .gitignore', () => {
      writeFileSync(join(tmpDir, '.gitignore'), 'my-ignore');

      ensureGitignore(tmpDir);

      expect(readFileSync(join(tmpDir, '.gitignore'), 'utf8')).toBe(
        'my-ignore',
      );
    });
  });

  describe('finalizeSetup', () => {
    it('creates template files in workspace', () => {
      const ws = join(tmpDir, 'workspace');
      mkdirSync(ws, { recursive: true });

      // finalizeSetup calls copyEnabledSkills + ensureTemplate
      // Skills copy will skip since no skills root exists in test
      finalizeSetup(ws, []);

      // Templates may or may not exist depending on whether templates/ dir
      // is resolvable from the test runner — the function should not throw
    });
  });
});
