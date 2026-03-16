import { simpleGit } from 'simple-git';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class WorkspaceManager {
  private readonly workspacePath: string;
  private readonly branchPrefix: string;

  constructor(workspacePath: string, branchPrefix: string) {
    this.workspacePath = workspacePath;
    this.branchPrefix = branchPrefix;
  }

  async cloneRepo(repoUrl: string, name: string): Promise<string> {
    const repoPath = join(this.workspacePath, name);
    await mkdir(repoPath, { recursive: true });

    const git = simpleGit();
    await git.clone(repoUrl, repoPath);
    return repoPath;
  }

  async ensureSafeBranch(repoPath: string, branchName: string): Promise<void> {
    if (!branchName.startsWith(this.branchPrefix)) {
      throw new Error(
        `Branch "${branchName}" does not match required prefix "${this.branchPrefix}". ` +
        `CawPilot only operates on ${this.branchPrefix}* branches.`
      );
    }

    const git = simpleGit(repoPath);
    const branches = await git.branchLocal();
    if (!branches.all.includes(branchName)) {
      await git.checkoutLocalBranch(branchName);
    } else {
      await git.checkout(branchName);
    }
  }

  async isProtectedBranch(repoPath: string): Promise<boolean> {
    const git = simpleGit(repoPath);
    const current = await git.revparse(['--abbrev-ref', 'HEAD']);
    return !current.trim().startsWith(this.branchPrefix);
  }
}
