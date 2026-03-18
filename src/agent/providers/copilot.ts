import { CopilotClient, defineTool } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import { getSkillsPath } from '../../workspace/config.js';
import { buildTools, type ToolContext } from '../tools.js';
import { logger } from '../../utils/logger.js';
import type { AgentProvider, AgentSession, AgentModel, SessionOptions } from '../provider.js';

class CopilotAgentSession implements AgentSession {
  readonly sessionId: string;

  constructor(private readonly session: CopilotSession) {
    this.sessionId = session.sessionId;
  }

  async sendAndWait(
    options: { prompt: string },
    timeout?: number,
  ): Promise<{ data?: { content?: string } } | undefined> {
    const result = await this.session.sendAndWait(options, timeout);
    return result as { data?: { content?: string } } | undefined;
  }

  on(eventType: string, handler: (event: { data?: Record<string, unknown> }) => void): () => void {
    return this.session.on((event) => {
      if (event.type === eventType) {
        handler(event as { data?: Record<string, unknown> });
      }
    });
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

  async createSession(options: SessionOptions): Promise<AgentSession> {
    if (!this.client) throw new Error('Provider not started. Call start() first.');

    const toolCtx: ToolContext = {
      db: options.db,
      channels: options.channels,
      workspacePath: options.config.workspacePath,
      taskId: options.taskId,
      sourceChannel: options.sourceChannel,
      sourceSender: options.sourceSender,
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
      provider: options.config.provider as Parameters<typeof this.client.createSession>[0]['provider'],
      onPermissionRequest: async () => ({ kind: 'approved' as const }),
      onUserInputRequest: async (request: { question: string }) => {
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
