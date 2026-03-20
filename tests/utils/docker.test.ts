import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We can't easily create /.dockerenv or /proc/1/cgroup in tests,
// so we mock the fs functions used by the module.

describe('utils/docker', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects Docker via /.dockerenv', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        existsSync: (p: string) =>
          p === '/.dockerenv' ? true : actual.existsSync(p),
      };
    });

    const { isRunningInDocker } = await import(
      '../../src/utils/docker.js'
    );
    expect(isRunningInDocker()).toBe(true);
  });

  it('detects Docker via /proc/1/cgroup fallback', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        existsSync: (p: string) =>
          p === '/.dockerenv' ? false : actual.existsSync(p),
        readFileSync: (p: string | URL, ...args: unknown[]) =>
          p === '/proc/1/cgroup'
            ? '12:devices:/docker/abc123\n'
            : (actual.readFileSync as Function)(p, ...args),
      };
    });

    const { isRunningInDocker } = await import(
      '../../src/utils/docker.js'
    );
    expect(isRunningInDocker()).toBe(true);
  });

  it('returns false when not in Docker', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        existsSync: (p: string) =>
          p === '/.dockerenv' ? false : actual.existsSync(p),
        readFileSync: (p: string | URL, ...args: unknown[]) => {
          if (p === '/proc/1/cgroup') throw new Error('No such file');
          return (actual.readFileSync as Function)(p, ...args);
        },
      };
    });

    const { isRunningInDocker } = await import(
      '../../src/utils/docker.js'
    );
    expect(isRunningInDocker()).toBe(false);
  });
});
