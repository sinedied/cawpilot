import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isInsideWorkspace,
  createSandboxedPermissionHandler,
} from '../../src/providers/copilot.js';

const workspace = '/home/user/workspace';

describe('isInsideWorkspace', () => {
  it('allows a file inside the workspace', () => {
    expect(isInsideWorkspace(`${workspace}/src/index.ts`, workspace)).toBe(
      true,
    );
  });

  it('allows the workspace root itself', () => {
    expect(isInsideWorkspace(workspace, workspace)).toBe(true);
  });

  it('allows a relative path resolved inside the workspace', () => {
    expect(isInsideWorkspace('src/file.ts', workspace)).toBe(true);
  });

  it('rejects a path outside the workspace', () => {
    expect(isInsideWorkspace('/etc/passwd', workspace)).toBe(false);
  });

  it('rejects a path that traverses above the workspace', () => {
    expect(isInsideWorkspace(`${workspace}/../secret`, workspace)).toBe(false);
  });

  it('rejects a sibling directory with a matching prefix', () => {
    expect(
      isInsideWorkspace('/home/user/workspace-evil/file.ts', workspace),
    ).toBe(false);
  });
});

describe('createSandboxedPermissionHandler', () => {
  const handler = createSandboxedPermissionHandler(workspace);

  it('approves a read inside the workspace', async () => {
    const result = await handler({
      kind: 'read',
      path: `${workspace}/src/index.ts`,
    });
    expect(result).toEqual({ kind: 'approved' });
  });

  it('denies a read outside the workspace', async () => {
    const result = await handler({
      kind: 'read',
      path: '/etc/shadow',
    });
    expect(result).toMatchObject({ kind: 'denied-by-rules' });
  });

  it('approves a read with no path (e.g. listing)', async () => {
    const result = await handler({ kind: 'read' });
    expect(result).toEqual({ kind: 'approved' });
  });

  it('approves a write inside the workspace', async () => {
    const result = await handler({
      kind: 'write',
      fileName: `${workspace}/src/new.ts`,
    });
    expect(result).toEqual({ kind: 'approved' });
  });

  it('denies a write outside the workspace', async () => {
    const result = await handler({
      kind: 'write',
      fileName: '/tmp/evil.sh',
    });
    expect(result).toMatchObject({ kind: 'denied-by-rules' });
  });

  it('denies a write that traverses above workspace', async () => {
    const result = await handler({
      kind: 'write',
      fileName: `${workspace}/../../etc/crontab`,
    });
    expect(result).toMatchObject({ kind: 'denied-by-rules' });
  });

  it('approves a shell with paths inside workspace', async () => {
    const result = await handler({
      kind: 'shell',
      possiblePaths: [`${workspace}/src`, `${workspace}/tests`],
    });
    expect(result).toEqual({ kind: 'approved' });
  });

  it('denies a shell with any path outside workspace', async () => {
    const result = await handler({
      kind: 'shell',
      possiblePaths: [`${workspace}/src`, '/usr/bin'],
    });
    expect(result).toMatchObject({ kind: 'denied-by-rules' });
  });

  it('approves a shell with no possiblePaths', async () => {
    const result = await handler({
      kind: 'shell',
    });
    expect(result).toEqual({ kind: 'approved' });
  });

  it('approves other request kinds (url, mcp, custom-tool)', async () => {
    for (const kind of ['url', 'mcp', 'custom-tool'] as const) {
      const result = await handler({ kind });
      expect(result).toEqual({ kind: 'approved' });
    }
  });
});
