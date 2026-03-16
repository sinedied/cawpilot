export interface CawPilotConfig {
  messaging: MessagingConfig;
  github: GitHubConfig;
  workspace: WorkspaceConfig;
  branching: BranchingConfig;
  skills: string[];
}

export interface MessagingConfig {
  platform: 'signal' | 'whatsapp' | 'telegram';
  signalApiUrl?: string;
  signalPhoneNumber?: string;
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
