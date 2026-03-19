import { CopilotProvider } from '../providers/copilot.js';
import type {
  AgentProvider,
  AgentSession,
  AgentModel,
  AuthStatus,
  SessionOptions,
} from '../providers/provider.js';

let provider: AgentProvider | undefined;

/**
 * Get the current provider, or create the default (Copilot) one.
 */
function getProvider(): AgentProvider {
  provider ??= new CopilotProvider();
  return provider;
}

/**
 * Replace the agent provider (call before startRuntime).
 */
export function setProvider(p: AgentProvider): void {
  provider = p;
}

export async function startRuntime(): Promise<void> {
  const p = getProvider();
  await p.start();
}

export async function stopRuntime(): Promise<void> {
  if (provider) {
    await provider.stop();
    provider = undefined;
  }
}

export async function listAvailableModels(): Promise<AgentModel[]> {
  const p = getProvider();
  return p.listModels();
}

export async function checkCopilotAuth(): Promise<AuthStatus> {
  const p = getProvider();
  return p.checkAuth();
}

export async function createTaskSession(
  options: SessionOptions,
): Promise<AgentSession> {
  const p = getProvider();
  return p.createSession(options);
}

export {
  type AgentProvider,
  type AgentSession,
  type AuthStatus,
  type AgentModel,
  type SessionOptions,
} from '../providers/provider.js';
