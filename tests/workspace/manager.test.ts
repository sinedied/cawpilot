import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ensureWorkspace, isSafeBranch, getReposPath } from '../../src/workspace/manager.js';

describe('workspace/manager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cawpilot-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureWorkspace', () => {
    it('creates required directories', () => {
      ensureWorkspace(tmpDir);

      expect(existsSync(join(tmpDir, '.cawpilot', 'skills'))).toBe(true);
      expect(existsSync(join(tmpDir, 'repos'))).toBe(true);
    });

    it('is idempotent', () => {
      ensureWorkspace(tmpDir);
      ensureWorkspace(tmpDir);
      expect(existsSync(join(tmpDir, '.cawpilot', 'skills'))).toBe(true);
    });
  });

  describe('isSafeBranch', () => {
    it('returns true for caw- prefixed branches', () => {
      expect(isSafeBranch('caw-feature')).toBe(true);
      expect(isSafeBranch('caw-fix-bug')).toBe(true);
      expect(isSafeBranch('caw-')).toBe(true);
    });

    it('returns false for non-prefixed branches', () => {
      expect(isSafeBranch('main')).toBe(false);
      expect(isSafeBranch('feature-caw')).toBe(false);
      expect(isSafeBranch('')).toBe(false);
    });
  });

  describe('getReposPath', () => {
    it('returns repos subdirectory', () => {
      expect(getReposPath('/workspace')).toBe('/workspace/repos');
    });
  });
});
