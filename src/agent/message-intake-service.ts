import type Database from 'better-sqlite3';
import type { CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import {
  getUnprocessedMessages,
  markMessagesProcessing,
  getRecentHistory,
} from '../db/messages.js';
import {
  createTask,
  getActiveTasks,
  getNeedInfoTaskBySender,
  updateTaskStatus,
  updateTaskTitle,
  type Task,
} from '../db/tasks.js';
import { logger } from '../utils/logger.js';
import { TRIAGE_SYSTEM_PROMPT } from './prompts.js';
import { createTaskSession } from './runtime.js';

const POLL_INTERVAL_MS = 5000;

type TaskPlan = {
  title: string;
  messageIds: string[];
  contextMessageIds?: string[];
};

type TaskReadyHandler = (task: Task, contextMessageIds?: string[]) => void;

export class MessageIntakeService {
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: CawpilotConfig,
    private readonly db: Database.Database,
    private readonly channels: Map<string, Channel>,
    private readonly onTaskReady: TaskReadyHandler,
  ) {}

  start(): void {
    this.pollTimer = setInterval(() => {
      this.processMessages().catch((error: unknown) => {
        logger.error(`Message processing error: ${error}`);
      });
    }, POLL_INTERVAL_MS);

    this.processMessages().catch((error: unknown) => {
      logger.error(`Initial message processing error: ${error}`);
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async processMessages(): Promise<void> {
    const messages = getUnprocessedMessages(this.db);
    if (messages.length === 0) return;

    const activeTasks = getActiveTasks(this.db);
    const inProgress = activeTasks.filter(
      (task) => task.status === 'in-progress',
    );
    const availableSlots = this.config.maxConcurrency - inProgress.length;

    if (availableSlots <= 0) {
      logger.debug('All task slots full, deferring message processing');
      return;
    }

    logger.info(`Processing ${messages.length} unprocessed message(s)`);

    try {
      const remainingMessages = this.resumeNeedInfoTasks(messages);
      if (remainingMessages.length === 0) return;

      const taskPlan = await this.triageMessages(remainingMessages);
      for (const plan of taskPlan.slice(0, availableSlots)) {
        const task = createTask(this.db, plan.title);
        markMessagesProcessing(this.db, plan.messageIds, task.id);
        this.onTaskReady(task, plan.contextMessageIds);
      }
    } catch (error) {
      logger.error(`Failed to process messages: ${error}`);
    }
  }

  private resumeNeedInfoTasks(
    messages: ReturnType<typeof getUnprocessedMessages>,
  ): ReturnType<typeof getUnprocessedMessages> {
    const remaining: typeof messages = [];

    for (const message of messages) {
      const needInfoTask = getNeedInfoTaskBySender(
        this.db,
        message.channel,
        message.sender,
      );

      if (!needInfoTask) {
        remaining.push(message);
        continue;
      }

      markMessagesProcessing(this.db, [message.id], needInfoTask.id);
      const newTitle = message.content.slice(0, 100);
      updateTaskTitle(this.db, needInfoTask.id, newTitle);
      needInfoTask.title = newTitle;
      updateTaskStatus(this.db, needInfoTask.id, 'in-progress');
      logger.info(
        `Resuming need-info task "${needInfoTask.title}" with reply from ${message.channel}/${message.sender}`,
      );
      this.onTaskReady(needInfoTask);
    }

    return remaining;
  }

  private async triageMessages(
    messages: ReturnType<typeof getUnprocessedMessages>,
  ): Promise<TaskPlan[]> {
    const history = getRecentHistory(this.db, this.config.contextMessagesCount);
    const historyContext =
      history.length > 0
        ? `Recent conversation history (for context):\n${history.map((message) => `ID: ${message.id} | [${message.role}] ${message.channel}/${message.sender}: ${message.content}`).join('\n')}\n\n`
        : '';

    let fetchedCount = this.config.contextMessagesCount;

    const fetchHistoryTool = {
      description:
        'Fetch older conversation messages beyond what was initially provided. Returns messages ordered chronologically.',
      parameters: {
        type: 'object' as const,
        properties: {
          count: {
            type: 'number',
            description: 'How many additional older messages to fetch',
          },
        },
        required: ['count'],
      },
      handler: async (args: unknown) => {
        const { count } = args as { count: number };
        const limit = Math.min(count, 100);
        const allHistory = getRecentHistory(this.db, fetchedCount + limit);
        const olderMessages = allHistory.slice(
          0,
          allHistory.length - fetchedCount,
        );
        fetchedCount += olderMessages.length;
        return {
          messages: olderMessages.map((message) => ({
            id: message.id,
            role: message.role,
            channel: message.channel,
            sender: message.sender,
            content: message.content,
            createdAt: message.createdAt,
          })),
        };
      },
    };

    if (messages.length === 1) {
      return [
        {
          title: messages[0].content.slice(0, 100),
          messageIds: [messages[0].id],
        },
      ];
    }

    try {
      const session = await createTaskSession({
        config: this.config,
        db: this.db,
        channels: this.channels,
        taskId: 'triage',
        sourceChannel: messages[0].channel,
        sourceSender: messages[0].sender,
        systemPrompt: TRIAGE_SYSTEM_PROMPT,
        tools: { fetch_history: fetchHistoryTool },
      });

      const messageList = messages
        .map(
          (message) =>
            `ID: ${message.id} | Channel: ${message.channel} | Sender: ${message.sender} | Content: ${message.content}`,
        )
        .join('\n');

      const response = await session.sendAndWait(
        {
          prompt: `${historyContext}Group these new messages into tasks:\n${messageList}`,
        },
        120_000,
      );
      await session.disconnect();

      if (response?.data?.content) {
        const jsonMatch = /\[[\s\S]*\]/v.exec(response.data.content);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as TaskPlan[];
        }
      }
    } catch (error) {
      logger.warn(`Triage via LLM failed, creating individual tasks: ${error}`);
    }

    return messages.map((message) => ({
      title: message.content.slice(0, 100),
      messageIds: [message.id],
    }));
  }
}
