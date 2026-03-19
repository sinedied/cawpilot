import { z } from 'zod';
import type Database from 'better-sqlite3';
import { updateTaskStatus } from '../db/tasks.js';
import { createBotMessage } from '../db/messages.js';
import type { Channel } from '../channels/types.js';
import { createBranch, createPullRequest, pushBranch } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';

export interface ToolContext {
  db: Database.Database;
  channels: Map<string, Channel>;
  workspacePath: string;
  taskId: string;
  sourceChannel: string;
  sourceSender: string;
}

// Tool definitions use raw JSON Schema (not Zod) because the Copilot SDK
// defineTool expects JSON Schema objects for the `parameters` field.
// We define schemas separately for runtime validation via zod.

const sendMessageSchema = z.object({
  content: z.string().describe('The message content to send'),
  channel: z.string().optional().describe('Target channel name (e.g. "cli", "telegram", "http"). Defaults to the originating channel.'),
  sender: z.string().optional().describe('Target sender/chat ID. Defaults to the originating sender. For telegram, use the chat ID.'),
});

const updateTodoSchema = z.object({
  taskId: z.string().describe('The task ID to update'),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'need-info']).describe('New task status'),
  result: z.string().optional().describe('Result or summary of the task'),
});

const createBranchSchema = z.object({
  repoDir: z.string().describe('Path to the repository directory'),
  branchName: z.string().describe('Branch name (cp- prefix will be added if missing)'),
});

const createPrSchema = z.object({
  repoDir: z.string().describe('Path to the repository directory'),
  title: z.string().describe('PR title'),
  body: z.string().describe('PR body/description'),
});

export function buildTools(ctx: ToolContext) {
  return {
    send_message: {
      description: 'Send a message to the user. By default sends to the originating channel, but can target any connected channel by name.',
      parameters: {
        type: 'object' as const,
        properties: {
          content: { type: 'string', description: 'The message content to send' },
          channel: { type: 'string', description: 'Target channel name (e.g. "cli", "telegram", "http"). Defaults to the originating channel.' },
          sender: { type: 'string', description: 'Target sender/chat ID. Defaults to the originating sender.' },
        },
        required: ['content'],
      },
      handler: async (args: unknown) => {
        const { content, channel: targetChannel, sender: targetSender } = sendMessageSchema.parse(args);
        const chName = targetChannel ?? ctx.sourceChannel;
        const chSender = targetSender ?? ctx.sourceSender;
        const channel = ctx.channels.get(chName);
        if (channel) {
          await channel.send(chSender, content);
          createBotMessage(ctx.db, chName, chSender, content, ctx.taskId);
          return { sent: true, channel: chName };
        }
        return { sent: false, error: `Channel "${chName}" not found` };
      },
    },

    list_channels: {
      description: 'List all connected and available channels',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
      handler: async () => {
        const channelNames = [...ctx.channels.keys()];
        return { channels: channelNames, source: ctx.sourceChannel };
      },
    },

    update_task_status: {
      description: 'Update the status of the current task',
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'The task ID to update' },
          status: {
            type: 'string',
            enum: ['pending', 'in-progress', 'completed', 'failed', 'need-info'],
            description: 'New task status',
          },
          result: { type: 'string', description: 'Result or summary of the task' },
        },
        required: ['taskId', 'status'],
      },
      handler: async (args: unknown) => {
        const { taskId, status, result } = updateTodoSchema.parse(args);
        updateTaskStatus(ctx.db, taskId, status, result);
        logger.debug(`Task ${taskId} updated to ${status}`);
        return { updated: true };
      },
    },

    create_branch: {
      description: 'Create a new branch in a repository (cp- prefix enforced)',
      parameters: {
        type: 'object' as const,
        properties: {
          repoDir: { type: 'string', description: 'Path to the repository directory' },
          branchName: { type: 'string', description: 'Branch name (cp- prefix will be added)' },
        },
        required: ['repoDir', 'branchName'],
      },
      handler: async (args: unknown) => {
        const { repoDir, branchName } = createBranchSchema.parse(args);
        const name = createBranch(repoDir, branchName);
        return { branch: name };
      },
    },

    create_pull_request: {
      description: 'Push the current branch and create a pull request',
      parameters: {
        type: 'object' as const,
        properties: {
          repoDir: { type: 'string', description: 'Path to the repository directory' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR body/description' },
        },
        required: ['repoDir', 'title', 'body'],
      },
      handler: async (args: unknown) => {
        const { repoDir, title, body } = createPrSchema.parse(args);
        pushBranch(repoDir, '');
        const prUrl = createPullRequest(repoDir, title, body);
        return { url: prUrl };
      },
    },
  };
}
