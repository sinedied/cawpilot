import type Database from 'better-sqlite3';
import type { CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';

/**
 * Minimal model info returned by providers.
 */
export interface AgentModel {
  id: string;
  name: string;
}

export interface MessageAttachment {
  type: 'file';
  path: string;
  displayName?: string;
}

export interface SendOptions {
  prompt: string;
  attachments?: MessageAttachment[];
}

/**
 * A single conversation session with the agent.
 */
export interface AgentSession {
  readonly sessionId: string;

  /**
   * Send a prompt and wait for the session to become idle, with no timeout.
   */
  send(options: SendOptions): Promise<{ data?: { content?: string } } | undefined>;

  /**
   * Send a prompt and wait for idle with a timeout.
   */
  sendAndWait(options: SendOptions, timeout?: number): Promise<{ data?: { content?: string } } | undefined>;

  /**
   * Subscribe to session events.
   */
  on(eventType: string, handler: (event: { data?: Record<string, unknown> }) => void): () => void;

  /**
   * Disconnect and free resources (session data preserved for resumption).
   */
  disconnect(): Promise<void>;
}

/**
 * Options for creating a task session.
 */
export interface SessionOptions {
  config: CawpilotConfig;
  db: Database.Database;
  channels: Map<string, Channel>;
  taskId: string;
  sourceChannel: string;
  sourceSender: string;
  systemPrompt: string;
  onAssistantMessage?: (content: string) => void;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  login?: string;
}

/**
 * An agent provider abstracts the underlying LLM/agent runtime.
 * Implement this interface to add support for a new agent backend.
 */
export interface AgentProvider {
  readonly name: string;

  /** Start the provider (connect, spawn processes, etc.) */
  start(): Promise<void>;

  /** Stop the provider and clean up resources */
  stop(): Promise<void>;

  /** Check authentication status */
  checkAuth(): Promise<AuthStatus>;

  /** List available models */
  listModels(): Promise<AgentModel[]>;

  /** Create a session for processing a task */
  createSession(options: SessionOptions): Promise<AgentSession>;
}
