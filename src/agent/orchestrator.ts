import { execSync } from 'node:child_process';
import type Database from 'better-sqlite3';
import chalk from 'chalk';
import { type CawpilotConfig, getContextFiles } from '../workspace/config.js';
import { runBackup } from '../workspace/persistence.js';
import type { Channel } from '../channels/types.js';
import {
  getUnprocessedMessages,
  markMessagesProcessing,
  getRecentHistory,
  getMessagesByTask,
  getMessagesByIds,
} from '../db/messages.js';
import {
  createTask,
  getActiveTasks,
  getNeedInfoTaskBySender,
  getTaskById,
  updateTaskStatus,
  type Task,
} from '../db/tasks.js';
import {
  createScheduledTask,
  getDueScheduledTasks,
  getAllScheduledTasks,
  updateScheduledTaskRun,
} from '../db/scheduled.js';
import { setNotification } from '../cli/dashboard.js';
import { logger } from '../utils/logger.js';
import { archiveCompletedTasks } from '../workspace/cleanup.js';
import { TRIAGE_SYSTEM_PROMPT, TASK_SYSTEM_PROMPT, buildTaskPrompt } from './prompts.js';
import { buildTools, type ToolContext } from './tools.js';
import { createTaskSession } from './runtime.js';
import { runTask } from './task-runner.js';
import type { AgentSession } from '../providers/provider.js';

const POLL_INTERVAL_MS = 5000;
const SCHEDULER_INTERVAL_MS = 60_000;

export class Orchestrator {
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private schedulerTimer: ReturnType<typeof setInterval> | undefined;
  private readonly runningTasks = new Map<string, Promise<void>>();
  private readonly activeSessions = new Map<string, AgentSession>();
  private _processedCount = 0;

  constructor(
    private readonly config: CawpilotConfig,
    private readonly db: Database.Database,
    private readonly channels: Map<string, Channel>,
  ) {}

  get processedCount(): number {
    return this._processedCount;
  }

  get activeTaskCount(): number {
    return this.runningTasks.size;
  }

  registerSession(taskId: string, session: AgentSession): void {
    this.activeSessions.set(taskId, session);
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = getTaskById(this.db, taskId);
    if (!task || (task.status !== 'in-progress' && task.status !== 'pending')) {
      return false;
    }

    const session = this.activeSessions.get(taskId);
    if (session) {
      try {
        await session.abort();
        await session.disconnect();
      } catch (error) {
        logger.warn(`Error aborting session for task ${taskId}: ${error}`);
      }

      this.activeSessions.delete(taskId);
    }

    updateTaskStatus(this.db, taskId, 'cancelled', 'Cancelled by user');
    this.runningTasks.delete(taskId);
    logger.info(`Task ${taskId} cancelled`);
    setNotification(chalk.yellow(`🚫 Task cancelled: ${task.title.slice(0, 40)}`));
    return true;
  }

  start(): void {
    logger.info('Orchestrator started');
    this.pollTimer = setInterval(() => {
      this.processMessages().catch((error: unknown) => {
        logger.error(`Message processing error: ${error}`);
      });
    }, POLL_INTERVAL_MS);
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledTasks().catch((error: unknown) => {
        logger.error(`Scheduled task check error: ${error}`);
      });
    }, SCHEDULER_INTERVAL_MS);

    // Ensure default scheduled tasks exist
    this.ensureDefaultScheduledTasks();

    // Run immediately on start
    this.processMessages().catch((error: unknown) => {
      logger.error(`Initial message processing error: ${error}`);
    });
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.pollTimer = undefined;
    this.schedulerTimer = undefined;
    logger.info('Orchestrator stopped');
  }

  private async processMessages(): Promise<void> {
    const messages = getUnprocessedMessages(this.db);
    if (messages.length === 0) return;

    // Check capacity
    const activeTasks = getActiveTasks(this.db);
    const inProgress = activeTasks.filter((t) => t.status === 'in-progress');
    const availableSlots = this.config.maxConcurrency - inProgress.length;

    if (availableSlots <= 0) {
      logger.debug('All task slots full, deferring message processing');
      return;
    }

    logger.info(`Processing ${messages.length} unprocessed message(s)`);

    try {
      // Check if any messages are replies to need-info tasks
      const remainingMessages = this.resumeNeedInfoTasks(messages);
      if (remainingMessages.length === 0) return;

      const taskPlan = await this.triageMessages(remainingMessages);

      for (const plan of taskPlan.slice(0, availableSlots)) {
        const task = createTask(this.db, plan.title);
        markMessagesProcessing(this.db, plan.messageIds, task.id);
        this.dispatchTask(task, plan.contextMessageIds);
      }
    } catch (error) {
      logger.error(`Failed to process messages: ${error}`);
    }
  }

  /**
   * Check if incoming messages are answers to tasks waiting for info.
   * Attaches matching messages to their need-info task and re-runs them.
   * Returns messages that were NOT matched to any need-info task.
   */
  private resumeNeedInfoTasks(
    messages: ReturnType<typeof getUnprocessedMessages>,
  ): ReturnType<typeof getUnprocessedMessages> {
    const remaining: typeof messages = [];

    for (const msg of messages) {
      const needInfoTask = getNeedInfoTaskBySender(
        this.db,
        msg.channel,
        msg.sender,
      );

      if (needInfoTask) {
        // Attach message to the existing task and resume it
        markMessagesProcessing(this.db, [msg.id], needInfoTask.id);
        updateTaskStatus(this.db, needInfoTask.id, 'in-progress');
        logger.info(
          `Resuming need-info task "${needInfoTask.title}" with reply from ${msg.channel}/${msg.sender}`,
        );
        this.dispatchTask(needInfoTask);
      } else {
        remaining.push(msg);
      }
    }

    return remaining;
  }

  /**
   * Build a unified conversation context for a task.
   * Includes recent history (user + bot messages across tasks),
   * the task's own messages, and any explicitly referenced messages.
   */
  private buildConversationContext(taskId: string, extraMessageIds?: string[]): string {
    const history = getRecentHistory(this.db, this.config.contextMessagesCount);
    const taskMessages = getMessagesByTask(this.db, taskId);
    const extraMessages = extraMessageIds ? getMessagesByIds(this.db, extraMessageIds) : [];

    // Merge all sources, deduplicating by ID, preserving chronological order
    const seen = new Set<string>();
    const allMessages = [...extraMessages, ...history, ...taskMessages].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort chronologically
    allMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return allMessages
      .map((m) => `[${m.role}] ${m.channel}/${m.sender}: ${m.content}`)
      .join('\n');
  }

  private dispatchTask(task: Task, contextMessageIds?: string[]): void {
    setNotification(chalk.yellow(`⟳ Working on: ${task.title.slice(0, 40)}`));

    const context = this.buildConversationContext(task.id, contextMessageIds);
    const taskPromise = runTask(task, this.config, this.db, this.channels, this, context)
      .then(() => {
        this._processedCount++;
        setNotification(
          chalk.green(`✅ Task done: ${task.title.slice(0, 40)}`),
        );
      })
      .catch(() => {
        setNotification(
          chalk.red(`❌ Task failed: ${task.title.slice(0, 40)}`),
        );
      })
      .finally(() => {
        this.runningTasks.delete(task.id);
        this.activeSessions.delete(task.id);
      });

    this.runningTasks.set(task.id, taskPromise);
  }

  private async triageMessages(
    messages: ReturnType<typeof getUnprocessedMessages>,
  ): Promise<Array<{ title: string; messageIds: string[]; contextMessageIds?: string[] }>> {
    // Fetch recent history for context
    const history = getRecentHistory(this.db, this.config.contextMessagesCount);
    const historyContext =
      history.length > 0
        ? `Recent conversation history (for context):\n${history.map((m) => `ID: ${m.id} | [${m.role}] ${m.channel}/${m.sender}: ${m.content}`).join('\n')}\n\n`
        : '';

    // Track how many messages the triage has already seen
    let fetchedCount = this.config.contextMessagesCount;

    // Tool to let the triage LLM fetch more history
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
        // Return only the older messages not already provided
        const olderMessages = allHistory.slice(0, allHistory.length - fetchedCount);
        fetchedCount += olderMessages.length;
        return {
          messages: olderMessages.map((m) => ({
            id: m.id,
            role: m.role,
            channel: m.channel,
            sender: m.sender,
            content: m.content,
            createdAt: m.createdAt,
          })),
        };
      },
    };

    // For a single message, create a task directly without LLM triage
    if (messages.length === 1) {
      return [
        {
          title: messages[0].content.slice(0, 100),
          messageIds: [messages[0].id],
        },
      ];
    }

    // For multiple messages, use the LLM to group them into tasks
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
          (m) =>
            `ID: ${m.id} | Channel: ${m.channel} | Sender: ${m.sender} | Content: ${m.content}`,
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
          return JSON.parse(jsonMatch[0]) as Array<{
            title: string;
            messageIds: string[];
            contextMessageIds?: string[];
          }>;
        }
      }
    } catch (error) {
      logger.warn(`Triage via LLM failed, creating individual tasks: ${error}`);
    }

    // Fallback: one task per message
    return messages.map((m) => ({
      title: m.content.slice(0, 100),
      messageIds: [m.id],
    }));
  }

  private async checkScheduledTasks(): Promise<void> {
    const dueTasks = getDueScheduledTasks(this.db);
    for (const scheduled of dueTasks) {
      logger.info(`Running scheduled task: ${scheduled.name}`);

      // Calculate next run (simple interval in minutes parsed from schedule)
      const intervalMinutes = Number.parseInt(scheduled.schedule, 10) || 60;
      const nextRun = new Date(
        Date.now() + intervalMinutes * 60_000,
      ).toISOString();
      updateScheduledTaskRun(this.db, scheduled.id, nextRun);

      // Handle internal tasks directly
      if (scheduled.prompt.startsWith('@internal:')) {
        this.runInternalTask(scheduled.prompt);
        continue;
      }

      const task = createTask(this.db, `[Scheduled] ${scheduled.name}`);

      const taskPromise = this.runScheduledTask(task, scheduled.prompt).finally(
        () => {
          this.runningTasks.delete(task.id);
        },
      );

      this.runningTasks.set(task.id, taskPromise);
    }
  }

  private runInternalTask(prompt: string): void {
    const action = prompt.replace('@internal:', '');
    switch (action) {
      case 'cleanup': {
        this.autoCleanup();
        break;
      }

      case 'backup': {
        this.autoBackup();
        break;
      }

      default: {
        logger.warn(`Unknown internal task: ${action}`);
      }
    }
  }

  private ensureDefaultScheduledTasks(): void {
    const existing = getAllScheduledTasks(this.db);
    const existingNames = new Set(existing.map((t) => t.name));

    // Cleanup task: run based on cleanupIntervalDays
    if (!existingNames.has('cleanup')) {
      const intervalMinutes = this.config.cleanupIntervalDays * 24 * 60;
      createScheduledTask(
        this.db,
        'cleanup',
        String(intervalMinutes),
        '@internal:cleanup',
      );
      logger.info(
        `Created default scheduled task: cleanup (every ${this.config.cleanupIntervalDays} day(s))`,
      );
    }

    // Backup task: only if persistence is enabled
    if (this.config.persistence.enabled && !existingNames.has('backup')) {
      const intervalMinutes =
        this.config.persistence.backupIntervalDays * 24 * 60;
      createScheduledTask(
        this.db,
        'backup',
        String(intervalMinutes),
        '@internal:backup',
      );
      logger.info(
        `Created default scheduled task: backup (every ${this.config.persistence.backupIntervalDays} day(s))`,
      );
    }
  }

  private async runScheduledTask(task: Task, prompt: string): Promise<void> {
    try {
      const toolCtx: ToolContext = {
        db: this.db,
        channels: this.channels,
        workspacePath: this.config.workspacePath,
        taskId: task.id,
        sourceChannel: 'cli',
        sourceSender: 'scheduler',
      };

      const session = await createTaskSession({
        config: this.config,
        db: this.db,
        channels: this.channels,
        taskId: task.id,
        sourceChannel: 'cli',
        sourceSender: 'scheduler',
        systemPrompt: TASK_SYSTEM_PROMPT,
        tools: buildTools(toolCtx),
      });

      this.activeSessions.set(task.id, session);

      const userPrompt = buildTaskPrompt({
        workspacePath: this.config.workspacePath,
        taskTitle: task.title,
        taskId: task.id,
        context: prompt,
      });

      const contextFiles = getContextFiles(this.config.workspacePath);
      await session.send({
        prompt: userPrompt,
        attachments: contextFiles.map((p) => ({
          type: 'file' as const,
          path: p,
        })),
      });
      await session.disconnect();
      this._processedCount++;
    } catch (error) {
      logger.error(`Scheduled task ${task.id} failed: ${error}`);
    } finally {
      this.activeSessions.delete(task.id);
    }
  }

  archiveCompletedTasks(): void {
    archiveCompletedTasks(this.db, this.config.workspacePath);
  }

  private autoCleanup(): void {
    this.archiveCompletedTasks();
  }

  private autoBackup(): void {
    if (!this.config.persistence.enabled) return;

    // Check last backup by looking at git log
    try {
      const lastCommit = execSync('git log -1 --format=%ci', {
        cwd: this.config.workspacePath,
        stdio: 'pipe',
      })
        .toString()
        .trim();

      if (lastCommit) {
        const daysSince =
          (Date.now() - new Date(lastCommit).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < this.config.persistence.backupIntervalDays) {
          return;
        }
      }
    } catch {
      // No git history, proceed with backup
    }

    const result = runBackup(this.config);
    if (result.success) {
      setNotification(chalk.green(`💾 Auto-backup: ${result.message}`));
    }
  }
}
