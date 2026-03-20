import type Database from 'better-sqlite3';
import { type CawpilotConfig, getContextFiles } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import { getMessagesByTask } from '../db/messages.js';
import {
  getTaskById,
  updateTaskStatus,
  setTaskSessionId,
  type Task,
} from '../db/tasks.js';
import { logger } from '../utils/logger.js';
import { createTaskSession } from './runtime.js';
import { TASK_SYSTEM_PROMPT, buildTaskPrompt } from './prompts.js';
import { buildTools, type ToolContext } from './tools.js';
import type { Orchestrator } from './orchestrator.js';

export type RunTaskOptions = {
  task: Task;
  config: CawpilotConfig;
  db: Database.Database;
  channels: Map<string, Channel>;
  orchestrator?: Orchestrator;
  context?: string;
};

export async function runTask({
  task,
  config,
  db,
  channels,
  orchestrator,
  context,
}: RunTaskOptions): Promise<void> {
  logger.info(`Starting task: ${task.title} (${task.id})`);
  updateTaskStatus(db, task.id, 'in-progress');

  const messages = getMessagesByTask(db, task.id);
  if (messages.length === 0) {
    logger.warn(`Task ${task.id} has no messages, marking as failed`);
    updateTaskStatus(db, task.id, 'failed', 'No messages attached to task');
    return;
  }

  const sourceMessage = messages[0];

  // If no context provided by orchestrator, build from task messages
  context ??= messages
    .map((m) => `[${m.role}] ${m.channel}/${m.sender}: ${m.content}`)
    .join('\n');

  // Collect file attachments from messages (images, voice, etc.)
  const messageAttachments = messages.flatMap((m) =>
    m.attachments.map((a) => ({ type: 'file' as const, path: a.path })),
  );

  const contextFiles = getContextFiles(config.workspacePath);
  const userPrompt = buildTaskPrompt({
    workspacePath: config.workspacePath,
    taskTitle: task.title,
    taskId: task.id,
    context,
  });

  try {
    const toolCtx: ToolContext = {
      db,
      channels,
      workspacePath: config.workspacePath,
      taskId: task.id,
      sourceChannel: sourceMessage.channel,
      sourceSender: sourceMessage.sender,
      orchestrator,
    };

    const session = await createTaskSession({
      config,
      db,
      channels,
      taskId: task.id,
      sourceChannel: sourceMessage.channel,
      sourceSender: sourceMessage.sender,
      systemPrompt: TASK_SYSTEM_PROMPT,
      tools: buildTools(toolCtx),
      orchestrator,
      onAssistantMessage(content) {
        logger.debug(`Task ${task.id} assistant: ${content.slice(0, 100)}...`);
      },
    });

    setTaskSessionId(db, task.id, session.sessionId);
    orchestrator?.registerSession(task.id, session);

    await session.send({
      prompt: userPrompt,
      attachments: [
        ...contextFiles.map((p) => ({ type: 'file' as const, path: p })),
        ...messageAttachments,
      ],
    });

    await session.disconnect();
    logger.info(`Task ${task.id} completed`);
  } catch (error) {
    // If the task was already cancelled, don't overwrite status
    const currentTask = getTaskById(db, task.id);
    if (currentTask?.status === 'cancelled') {
      logger.info(`Task ${task.id} was cancelled`);
      return;
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Task ${task.id} failed: ${errMsg}`);
    updateTaskStatus(db, task.id, 'failed', errMsg);

    // Notify user of failure
    const channel = channels.get(sourceMessage.channel);
    if (channel) {
      await channel.send(
        sourceMessage.sender,
        `⚠️ Task failed: ${task.title}\nError: ${errMsg}`,
      );
    }
  }
}
