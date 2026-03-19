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

/**
 * A single conversation session with the agent.
 */
export interface AgentSession {
  readonly sessionId: string;

  /**
   * Send a prompt and wait for the session to become idle, with no timeout.
   * @param options - prompt and optional attachments
   * @returns the final assistant message, or undefined
   */
  send(
    options: { prompt: string },
  ): Promise<{ data?: { content?: string } } | undefined>;

  /**
   * Send a prompt and wait for idle with a timeout.
   * @param options - prompt and optional attachments
   * @param timeout - timeout in ms
   * @returns the final assistant message, or undefined
   */
  sendAndWait(
    options: { prompt: string },
    timeout?: number,
  ): Promise<{ data?: { content?: string } } | undefined>;

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

  /** List available models */
  listModels(): Promise<AgentModel[]>;

  /** Create a session for processing a task */
  createSession(options: SessionOptions): Promise<AgentSession>;
}
