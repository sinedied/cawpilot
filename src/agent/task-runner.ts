import type Database from 'better-sqlite3';
import { type CawpilotConfig, getContextFiles } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import { getMessagesByTask } from '../db/messages.js';
import { updateTaskStatus, setTaskSessionId, type Task } from '../db/tasks.js';
import { logger } from '../utils/logger.js';
import { createTaskSession } from './runtime.js';
import { buildTaskSystemPrompt } from './prompts.js';

export async function runTask(
  task: Task,
  config: CawpilotConfig,
  db: Database.Database,
  channels: Map<string, Channel>,
): Promise<void> {
  logger.info(`Starting task: ${task.title} (${task.id})`);
  updateTaskStatus(db, task.id, 'in-progress');

  const messages = getMessagesByTask(db, task.id);
  if (messages.length === 0) {
    logger.warn(`Task ${task.id} has no messages, marking as failed`);
    updateTaskStatus(db, task.id, 'failed', 'No messages attached to task');
    return;
  }

  const sourceMessage = messages[0];
  const messageContext = messages
    .map((m) => `[${m.channel}/${m.sender}] ${m.content}`)
    .join('\n');

  // Collect file attachments from messages (images, voice, etc.)
  const messageAttachments = messages.flatMap((m) =>
    m.attachments.map((a) => ({ type: 'file' as const, path: a.path })),
  );

  const contextFiles = getContextFiles(config.workspacePath);
  const systemPrompt = buildTaskSystemPrompt({
    workspacePath: config.workspacePath,
    repos: config.repos,
    taskTitle: task.title,
    taskId: task.id,
    messageContext,
  });

  try {
    const session = await createTaskSession({
      config,
      db,
      channels,
      taskId: task.id,
      sourceChannel: sourceMessage.channel,
      sourceSender: sourceMessage.sender,
      systemPrompt,
      onAssistantMessage(content) {
        logger.debug(`Task ${task.id} assistant: ${content.slice(0, 100)}...`);
      },
    });

    setTaskSessionId(db, task.id, session.sessionId);

    await session.send({
      prompt: `Process this task: ${task.title}\n\nContext:\n${messageContext}`,
      attachments: [
        ...contextFiles.map((p) => ({ type: 'file' as const, path: p })),
        ...messageAttachments,
      ],
    });

    await session.disconnect();
    logger.info(`Task ${task.id} completed`);
  } catch (error) {
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
