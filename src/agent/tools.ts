import { z } from 'zod';
import type Database from 'better-sqlite3';
import { updateTaskStatus } from '../db/tasks.js';
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
});

const updateTodoSchema = z.object({
  taskId: z.string().describe('The task ID to update'),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed', 'need-info']).describe('New task status'),
  result: z.string().optional().describe('Result or summary of the task'),
});

const createBranchSchema = z.object({
  repoDir: z.string().describe('Path to the repository directory'),
  branchName: z.string().describe('Branch name (caw- prefix will be added if missing)'),
});

const createPrSchema = z.object({
  repoDir: z.string().describe('Path to the repository directory'),
  title: z.string().describe('PR title'),
  body: z.string().describe('PR body/description'),
});

export function buildTools(ctx: ToolContext) {
  return {
    send_message: {
      description: 'Send a message back to the user through the originating channel',
      parameters: {
        type: 'object' as const,
        properties: {
          content: { type: 'string', description: 'The message content to send' },
        },
        required: ['content'],
      },
      handler: async (args: unknown) => {
        const { content } = sendMessageSchema.parse(args);
        const channel = ctx.channels.get(ctx.sourceChannel);
        if (channel) {
          await channel.send(ctx.sourceSender, content);
        }
        return { sent: true };
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
      description: 'Create a new branch in a repository (caw- prefix enforced)',
      parameters: {
        type: 'object' as const,
        properties: {
          repoDir: { type: 'string', description: 'Path to the repository directory' },
          branchName: { type: 'string', description: 'Branch name (caw- prefix will be added)' },
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
