import path from 'node:path';
import process from 'node:process';
import {
  CopilotClient,
  defineTool,
  type CopilotSession,
  type PermissionRequest,
  type PermissionRequestResult,
} from '@github/copilot-sdk';
import { getSkillsPath } from '../workspace/config.js';
import { logger } from '../utils/logger.js';
import type {
  AgentProvider,
  AgentSession,
  AgentModel,
  AuthStatus,
  SessionOptions,
  SendOptions,
} from './provider.js';

class CopilotAgentSession implements AgentSession {
  readonly sessionId: string;

  constructor(private readonly session: CopilotSession) {
    this.sessionId = session.sessionId;
  }

  async send(
    options: SendOptions,
  ): Promise<{ data?: { content?: string } } | undefined> {
    return new Promise((resolve, reject) => {
      let lastMessage: { data?: { content?: string } } | undefined;

      const unsubscribe = this.session.on((event) => {
        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
        switch (event.type) {
          case 'assistant.message': {
            lastMessage = event as { data?: { content?: string } };

            break;
          }

          case 'session.idle': {
            unsubscribe();
            resolve(lastMessage);

            break;
          }

          case 'session.error': {
            unsubscribe();
            reject(
              new Error(
                (event as { data?: { message?: string } }).data?.message ??
                  'Session error',
              ),
            );

            break;
          }

          default: {
            // Ignore other events
            break;
          }
        }
      });

      this.session.send(options).catch((error: unknown) => {
        unsubscribe();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async sendAndWait(
    options: SendOptions,
    timeout?: number,
  ): Promise<{ data?: { content?: string } } | undefined> {
    const result = await this.session.sendAndWait(options, timeout);
    return result as { data?: { content?: string } } | undefined;
  }

  on(
    eventType: string,
    handler: (event: { data?: Record<string, unknown> }) => void,
  ): () => void {
    return this.session.on((event) => {
      if (event.type === eventType) {
        handler(event as { data?: Record<string, unknown> });
      }
    });
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async disconnect(): Promise<void> {
    await this.session.disconnect();
  }
}

/**
 * Check whether a resolved file path is inside the allowed workspace.
 */
export function isInsideWorkspace(
  filePath: string,
  workspacePath: string,
): boolean {
  const resolved = path.resolve(workspacePath, filePath);
  const normalizedWorkspace = path.resolve(workspacePath) + path.sep;
  return (
    resolved === path.resolve(workspacePath) ||
    resolved.startsWith(normalizedWorkspace)
  );
}

export function createSandboxedPermissionHandler(
  workspacePath: string,
): (request: PermissionRequest) => Promise<PermissionRequestResult> {
  const deny = (reason: string): PermissionRequestResult => ({
    kind: 'denied-by-rules' as const,
    rules: [reason],
  });

  return async (request: PermissionRequest) => {
    switch (request.kind) {
      case 'read': {
        const readPath = request.path as string | undefined;
        if (readPath && !isInsideWorkspace(readPath, workspacePath)) {
          logger.warn(`Blocked read outside workspace: ${readPath}`);
          return deny(`Path outside workspace: ${readPath}`);
        }

        break;
      }

      case 'write': {
        const writePath = request.fileName as string | undefined;
        if (writePath && !isInsideWorkspace(writePath, workspacePath)) {
          logger.warn(`Blocked write outside workspace: ${writePath}`);
          return deny(`Path outside workspace: ${writePath}`);
        }

        break;
      }

      case 'shell': {
        const possiblePaths = request.possiblePaths as string[] | undefined;
        if (possiblePaths) {
          for (const p of possiblePaths) {
            if (!isInsideWorkspace(p, workspacePath)) {
              logger.warn(`Blocked shell with path outside workspace: ${p}`);
              return deny(
                `Shell command references path outside workspace: ${p}`,
              );
            }
          }
        }

        break;
      }

      case 'mcp':
      case 'url':
      case 'custom-tool': {
        break;
      }
    }

    return { kind: 'approved' as const };
  };
}

export class CopilotProvider implements AgentProvider {
  readonly name = 'copilot';
  private client: CopilotClient | undefined;

  async start(): Promise<void> {
    if (this.client) return;

    // Suppress Node.js experimental warnings from the Copilot CLI subprocess
    process.env.NODE_NO_WARNINGS = '1';

    this.client = new CopilotClient({
      logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
    });

    await this.client.start();
    logger.info('Copilot SDK runtime started');
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
      logger.info('Copilot SDK runtime stopped');
    }
  }

  async listModels(): Promise<AgentModel[]> {
    await this.start();
    try {
      const models = await this.client!.listModels();
      return models.map((m) => ({ id: m.id, name: m.name }));
    } catch (error) {
      logger.warn(`Failed to list models: ${error}`);
      return [];
    }
  }

  async checkAuth(): Promise<AuthStatus> {
    await this.start();
    try {
      const status = await this.client!.getAuthStatus();
      return { isAuthenticated: status.isAuthenticated, login: status.login };
    } catch {
      return { isAuthenticated: false };
    }
  }

  async createSession(options: SessionOptions): Promise<AgentSession> {
    if (!this.client)
      throw new Error('Provider not started. Call start() first.');

    const sdkTools = Object.entries(options.tools).map(([name, def]) =>
      defineTool(name, {
        description: def.description,
        parameters: def.parameters,
        handler: def.handler,
      }),
    );

    const skillsDir = getSkillsPath(options.config.workspacePath);

    const { workspacePath } = options.config;

    const session = await this.client.createSession({
      model: options.config.model,
      tools: sdkTools,
      skillDirectories: [skillsDir],
      streaming: true,
      workingDirectory: workspacePath,
      systemMessage: {
        content: options.systemPrompt,
      },
      provider: options.config.provider as Parameters<
        typeof this.client.createSession
      >[0]['provider'],
      onPermissionRequest: createSandboxedPermissionHandler(workspacePath),
      async onUserInputRequest(request: { question: string }) {
        const channel = options.channels.get(options.sourceChannel);
        if (channel?.canPushMessages && channel.waitForInput) {
          await channel.send(options.sourceSender, `❓ ${request.question}`);
          const answer = await channel.waitForInput(options.sourceSender);
          return { answer, wasFreeform: true };
        }

        return { answer: 'Waiting for user response...', wasFreeform: true };
      },
    });

    if (options.onAssistantMessage) {
      session.on('assistant.message', (event) => {
        if (event.data?.content) {
          options.onAssistantMessage!(event.data.content);
        }
      });
    }

    logger.debug(`Copilot session created for task ${options.taskId}`);
    return new CopilotAgentSession(session);
  }
}
