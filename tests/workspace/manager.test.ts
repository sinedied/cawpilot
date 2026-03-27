import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ensureWorkspace,
  isSafeBranch,
  getReposPath,
} from '../../src/workspace/manager.js';
import {
  validateBranchName,
  validateRepoName,
} from '../../src/workspace/safety.js';

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
    it('returns true for cp- prefixed branches', () => {
      expect(isSafeBranch('cp-feature')).toBe(true);
      expect(isSafeBranch('cp-fix-bug')).toBe(true);
      expect(isSafeBranch('cp-')).toBe(true);
    });

    it('returns false for non-prefixed branches', () => {
      expect(isSafeBranch('main')).toBe(false);
      expect(isSafeBranch('feature-cp')).toBe(false);
      expect(isSafeBranch('')).toBe(false);
    });

    it('rejects invalid branch names', () => {
      expect(() => validateBranchName('cp-test$(whoami)')).toThrow(
        /Invalid branch name/,
      );
      expect(() => validateBranchName('cp-test;rm-rf')).toThrow(
        /Invalid branch name/,
      );
    });
  });

  describe('validateRepoName', () => {
    it('accepts owner/repo identifiers', () => {
      expect(validateRepoName('owner/repo')).toBe('owner/repo');
    });

    it('rejects invalid repo names', () => {
      expect(() => validateRepoName('owner/repo`whoami`')).toThrow(
        /Invalid repository name/,
      );
      expect(() => validateRepoName('owner repo')).toThrow(
        /Invalid repository name/,
      );
    });
  });

  describe('getReposPath', () => {
    it('returns repos subdirectory', () => {
      expect(getReposPath('/workspace')).toBe('/workspace/repos');
    });
  });
});
