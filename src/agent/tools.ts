import { z } from 'zod';
import type Database from 'better-sqlite3';
import { updateTaskStatus } from '../db/tasks.js';
import { createBotMessage } from '../db/messages.js';
import type { Channel } from '../channels/types.js';
import { logger } from '../utils/logger.js';
import type { Orchestrator } from '../agent/orchestrator.js';
import { isInsideWorkspace } from '../workspace/safety.js';

export type ToolDefinition = {
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
};

export type ToolDefinitions = Record<string, ToolDefinition>;

export type ToolContext = {
  db: Database.Database;
  channels: Map<string, Channel>;
  workspacePath: string;
  taskId: string;
  sourceChannel: string;
  sourceSender: string;
  orchestrator?: Orchestrator;
};

// Tool definitions use raw JSON Schema (not Zod) because the Copilot SDK
// defineTool expects JSON Schema objects for the `parameters` field.
// We define schemas separately for runtime validation via zod.

const sendMessageSchema = z.object({
  content: z.string().describe('The message content to send'),
  attachments: z
    .array(
      z.object({
        path: z.string().describe('Absolute path to the file'),
      }),
    )
    .optional()
    .describe(
      'Optional file attachments (images, PDFs, audio, etc.) to send along with the message.',
    ),
  channel: z
    .string()
    .optional()
    .describe(
      'Target channel name (e.g. "cli", "telegram", "http"). Defaults to the originating channel.',
    ),
  sender: z
    .string()
    .optional()
    .describe(
      'Target sender/chat ID. Defaults to the originating sender. For telegram, use the chat ID.',
    ),
});

const updateTodoSchema = z.object({
  taskId: z.string().describe('The task ID to update'),
  status: z
    .enum([
      'pending',
      'in-progress',
      'completed',
      'failed',
      'need-info',
      'cancelled',
    ])
    .describe('New task status'),
  result: z.string().optional().describe('Result or summary of the task'),
});

export function buildTools(ctx: ToolContext): ToolDefinitions {
  return {
    send_message: {
      description:
        'Send a message to the user, optionally with file attachments (images, PDFs, audio, etc.). By default sends to the originating channel, but can target any connected channel by name.',
      parameters: {
        type: 'object' as const,
        properties: {
          content: {
            type: 'string',
            description: 'The message content to send',
          },
          attachments: {
            type: 'array',
            description:
              'Optional file attachments to send with the message (images, PDFs, audio, etc.)',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to the file',
                },
              },
              required: ['path'],
            },
          },
          channel: {
            type: 'string',
            description:
              'Target channel name (e.g. "cli", "telegram", "http"). Defaults to the originating channel.',
          },
          sender: {
            type: 'string',
            description:
              'Target sender/chat ID. Defaults to the originating sender.',
          },
        },
        required: ['content'],
      },
      async handler(args: unknown) {
        const {
          content,
          attachments: fileAttachments,
          channel: targetChannel,
          sender: targetSender,
        } = sendMessageSchema.parse(args);

        for (const attachment of fileAttachments ?? []) {
          if (!isInsideWorkspace(attachment.path, ctx.workspacePath)) {
            logger.warn(
              `Rejected attachment outside workspace: ${attachment.path}`,
            );
            return {
              sent: false,
              error: `Attachment path outside workspace: ${attachment.path}`,
            };
          }
        }

        const chName = targetChannel ?? ctx.sourceChannel;
        const chSender = targetSender ?? ctx.sourceSender;
        const channel = ctx.channels.get(chName);
        if (channel) {
          const attachments = fileAttachments?.map((a) => ({
            type: 'file' as const,
            path: a.path,
            mimeType: 'application/octet-stream',
          }));
          await channel.send(chSender, content, attachments);
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
      async handler() {
        const channelNames = [...ctx.channels.keys()];
        return { channels: channelNames, source: ctx.sourceChannel };
      },
    },

    update_task_status: {
      description:
        'Update the status of a task. Use "cancelled" to abort an active task.',
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'The task ID to update' },
          status: {
            type: 'string',
            enum: [
              'pending',
              'in-progress',
              'completed',
              'failed',
              'need-info',
              'cancelled',
            ],
            description: 'New task status',
          },
          result: {
            type: 'string',
            description: 'Result or summary of the task',
          },
        },
        required: ['taskId', 'status'],
      },
      async handler(args: unknown) {
        const { taskId, status, result } = updateTodoSchema.parse(args);

        if (status === 'cancelled' && ctx.orchestrator) {
          const cancelled = await ctx.orchestrator.cancelTask(taskId);
          logger.debug(`Task ${taskId} cancel request: ${cancelled}`);
          return { updated: cancelled, cancelled };
        }

        updateTaskStatus(ctx.db, taskId, status, result);
        logger.debug(`Task ${taskId} updated to ${status}`);
        return { updated: true };
      },
    },
  };
}
