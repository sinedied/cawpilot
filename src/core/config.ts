export interface CawPilotConfig {
  channel: ChannelConfig;
  github: GitHubConfig;
  workspace: WorkspaceConfig;
  branching: BranchingConfig;
  skills: string[];
}

export interface ChannelConfig {
  /** Channel name (e.g. 'telegram'). */
  name: string;
  /** Channel-specific options passed to the channel factory. */
  options: Record<string, unknown>;
}

export interface GitHubConfig {
  repos: string[];
  todoRepo?: string;
}

export interface WorkspaceConfig {
  path: string;
}

export interface BranchingConfig {
  prefix: string;
}
