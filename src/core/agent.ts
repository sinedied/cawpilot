import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CawPilotConfig } from './config.js';
import type { IncomingMessage } from '../types/index.js';

export interface Agent {
  handleMessage(message: IncomingMessage): Promise<string>;
  stop(): Promise<void>;
}

export async function createAgent(config: CawPilotConfig): Promise<Agent> {
  const client = new CopilotClient({
    useLoggedInUser: true,
  });

  await client.start();

  // Map of sender → session ID for persistent conversations
  const sessions = new Map<string, string>();

  return {
    async handleMessage(message: IncomingMessage): Promise<string> {
      let sessionId = sessions.get(message.from);

      if (!sessionId) {
        const session = await client.createSession({
          model: 'gpt-5',
          onPermissionRequest: approveAll,
          systemMessage: {
            content: buildSystemMessage(config),
          },
        });
        sessionId = session.sessionId;
        sessions.set(message.from, sessionId);

        const result = await session.sendAndWait({
          prompt: message.text,
        });

        return result?.data?.content ?? 'No response from agent.';
      }

      const session = await client.resumeSession(sessionId, {
        onPermissionRequest: approveAll,
      });
      const result = await session.sendAndWait({
        prompt: message.text,
      });

      return result?.data?.content ?? 'No response from agent.';
    },

    async stop(): Promise<void> {
      await client.stop();
    },
  };
}

function buildSystemMessage(config: CawPilotConfig): string {
  return `You are CawPilot, an on-call coding assistant.

You help developers through messaging. Be concise — responses will be sent as chat messages.

## Rules
- Only work in branches with the "${config.branching.prefix}" prefix. NEVER commit to main.
- Connected repositories: ${config.github.repos.join(', ') || 'none configured'}
- Workspace path: ${config.workspace.path}

## Available Skills
${config.skills.map((s) => `- ${s}`).join('\n')}

Keep responses short and actionable. Use code blocks sparingly — they render poorly in messaging apps.
When you need to share longer output, offer to create a gist or file instead.`;
}
