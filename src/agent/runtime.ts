import { CopilotClient, defineTool } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type Database from 'better-sqlite3';
import type { CawpilotConfig } from '../workspace/config.js';
import { getSkillsPath } from '../workspace/config.js';
import { buildTools, type ToolContext } from './tools.js';
import type { Channel } from '../channels/types.js';
import { logger } from '../utils/logger.js';

let client: CopilotClient | undefined;

export async function startRuntime(): Promise<CopilotClient> {
  if (client) return client;

  client = new CopilotClient({
    logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
  });

  await client.start();
  logger.info('Copilot SDK runtime started');
  return client;
}

export async function stopRuntime(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
    logger.info('Copilot SDK runtime stopped');
  }
}

export function getClient(): CopilotClient {
  if (!client) throw new Error('Runtime not started. Call startRuntime() first.');
  return client;
}

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

export async function createTaskSession(options: SessionOptions): Promise<CopilotSession> {
  const cl = getClient();
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

  const session = await cl.createSession({
    model: options.config.model,
    tools: sdkTools,
    skillDirectories: [skillsDir],
    streaming: true,
    systemMessage: {
      content: options.systemPrompt,
    },
    provider: options.config.provider as Parameters<typeof cl.createSession>[0]['provider'],
    onPermissionRequest: async () => ({ kind: 'approved' as const }),
    onUserInputRequest: async (request: { question: string }) => {
      // Route the question back to the user through the originating channel
      const channel = options.channels.get(options.sourceChannel);
      if (channel) {
        await channel.send(options.sourceSender, `❓ ${request.question}`);
      }
      // For now, return a placeholder — the follow-up response handling
      // will be connected through the message processing pipeline
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

  logger.debug(`Task session created for task ${options.taskId}`);
  return session;
}
