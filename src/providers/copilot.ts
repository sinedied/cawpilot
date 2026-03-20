import process from 'node:process';
import {
  CopilotClient,
  defineTool,
  type CopilotSession,
} from '@github/copilot-sdk';
import { getSkillsPath } from '../workspace/config.js';
import { buildTools, type ToolContext } from '../agent/tools.js';
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

    const toolCtx: ToolContext = {
      db: options.db,
      channels: options.channels,
      workspacePath: options.config.workspacePath,
      taskId: options.taskId,
      sourceChannel: options.sourceChannel,
      sourceSender: options.sourceSender,
      orchestrator: options.orchestrator,
    };

    const tools = buildTools(toolCtx);
    const sdkTools = Object.entries(tools).map(([name, def]) =>
      defineTool(name, {
        description: def.description,
        parameters: def.parameters,
        handler: def.handler,
      }),
    );

    const skillsDir = getSkillsPath(options.config.workspacePath);

    const session = await this.client.createSession({
      model: options.config.model,
      tools: sdkTools,
      skillDirectories: [skillsDir],
      streaming: true,
      systemMessage: {
        content: options.systemPrompt,
      },
      provider: options.config.provider as Parameters<
        typeof this.client.createSession
      >[0]['provider'],
      onPermissionRequest: async () => ({ kind: 'approved' as const }),
      async onUserInputRequest(request: { question: string }) {
        const channel = options.channels.get(options.sourceChannel);
        if (channel) {
          await channel.send(options.sourceSender, `❓ ${request.question}`);
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
