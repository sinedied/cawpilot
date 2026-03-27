import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const BRANCH_PREFIX = 'cp-';

function resolvePathWithExistingAncestor(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  const missingSegments: string[] = [];
  let currentPath = absolutePath;

  while (!existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return absolutePath;
    }

    missingSegments.unshift(path.basename(currentPath));
    currentPath = parentPath;
  }

  const resolvedBase = realpathSync.native(currentPath);
  return missingSegments.length > 0
    ? path.resolve(resolvedBase, ...missingSegments)
    : resolvedBase;
}

export function isInsideWorkspace(
  filePath: string,
  workspacePath: string,
): boolean {
  const resolvedWorkspace = resolvePathWithExistingAncestor(workspacePath);
  const resolvedTarget = resolvePathWithExistingAncestor(
    path.resolve(workspacePath, filePath),
  );
  const normalizedWorkspace = resolvedWorkspace.endsWith(path.sep)
    ? resolvedWorkspace
    : resolvedWorkspace + path.sep;

  return (
    resolvedTarget === resolvedWorkspace ||
    resolvedTarget.startsWith(normalizedWorkspace)
  );
}

export function ensureBranchPrefix(branchName: string): string {
  const trimmedName = branchName.trim();
  return trimmedName.startsWith(BRANCH_PREFIX)
    ? trimmedName
    : `${BRANCH_PREFIX}${trimmedName}`;
}

export function validateRepoName(repoFullName: string): string {
  const trimmedName = repoFullName.trim();

  if (!/^(?:[\w.\-]+)\/(?:[\w.\-]+)$/v.test(trimmedName)) {
    throw new Error(`Invalid repository name: ${repoFullName}`);
  }

  return trimmedName;
}

export function validateBranchName(branchName: string): string {
  const safeName = ensureBranchPrefix(branchName);
  const branchBody = safeName.slice(BRANCH_PREFIX.length);

  const isValidPattern =
    branchBody.length > 0 &&
    [...branchBody].every(
      (character) => /[\w.\/]/v.test(character) || character === '-',
    );
  const hasUnsafeSequence =
    safeName.includes('..') ||
    safeName.includes('//') ||
    safeName.includes('@{') ||
    safeName.endsWith('/') ||
    safeName.endsWith('.') ||
    safeName.endsWith('.lock');

  if (!isValidPattern || hasUnsafeSequence) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }

  return safeName;
}
