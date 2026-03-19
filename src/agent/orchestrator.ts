import type Database from 'better-sqlite3';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CawpilotConfig } from '../workspace/config.js';
import { getContextFiles } from '../workspace/config.js';
import { runBackup } from '../workspace/persistence.js';
import type { Channel } from '../channels/types.js';
import { getUnprocessedMessages, markMessagesProcessing, getRecentHistory } from '../db/messages.js';
import { createTask, getActiveTasks, getAllTasks, type Task } from '../db/tasks.js';
import { createScheduledTask, getDueScheduledTasks, getAllScheduledTasks, updateScheduledTaskRun } from '../db/scheduled.js';
import { createTaskSession } from './runtime.js';
import { TRIAGE_SYSTEM_PROMPT, buildTaskSystemPrompt } from './prompts.js';
import { archiveCompletedTasks } from './cleanup.js';
import { runTask } from './task-runner.js';
import { setNotification } from '../cli/dashboard.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 5_000;
const SCHEDULER_INTERVAL_MS = 60_000;

export class Orchestrator {
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private schedulerTimer: ReturnType<typeof setInterval> | undefined;
  private runningTasks = new Map<string, Promise<void>>();
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

  start(): void {
    logger.info('Orchestrator started');
    this.pollTimer = setInterval(() => this.processMessages(), POLL_INTERVAL_MS);
    this.schedulerTimer = setInterval(() => this.checkScheduledTasks(), SCHEDULER_INTERVAL_MS);

    // Ensure default scheduled tasks exist
    this.ensureDefaultScheduledTasks();

    // Run immediately on start
    this.processMessages();
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
      const taskPlan = await this.triageMessages(messages);

      for (const plan of taskPlan.slice(0, availableSlots)) {
        const task = createTask(this.db, plan.title);
        markMessagesProcessing(this.db, plan.messageIds, task.id);
        setNotification(chalk.yellow(`⟳ Working on: ${task.title.slice(0, 40)}`));

        const taskPromise = runTask(task, this.config, this.db, this.channels)
          .then(() => {
            this._processedCount++;
            setNotification(chalk.green(`✅ Task done: ${task.title.slice(0, 40)}`));
          })
          .catch(() => {
            setNotification(chalk.red(`❌ Task failed: ${task.title.slice(0, 40)}`));
          })
          .finally(() => {
            this.runningTasks.delete(task.id);
            this.updateTodoFile();
          });

        this.runningTasks.set(task.id, taskPromise);
      }

      this.updateTodoFile();
    } catch (error) {
      logger.error(`Failed to process messages: ${error}`);
    }
  }

  private async triageMessages(
    messages: ReturnType<typeof getUnprocessedMessages>,
  ): Promise<{ title: string; messageIds: string[] }[]> {
    // Fetch recent history for context
    const history = getRecentHistory(this.db, this.config.contextMessagesCount);
    const historyContext = history.length > 0
      ? `Recent conversation history (for context):\n${history.map((m) => `[${m.role}] ${m.channel}/${m.sender}: ${m.content}`).join('\n')}\n\n`
      : '';

    // For a single message, create a task directly without LLM triage
    if (messages.length === 1) {
      return [{
        title: messages[0].content.slice(0, 100),
        messageIds: [messages[0].id],
      }];
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
      });

      const messageList = messages
        .map((m) => `ID: ${m.id} | Channel: ${m.channel} | Sender: ${m.sender} | Content: ${m.content}`)
        .join('\n');

      const response = await session.sendAndWait({
        prompt: `${historyContext}Group these new messages into tasks:\n${messageList}`,
      }, 120_000);
      await session.disconnect();

      if (response?.data?.content) {
        const jsonMatch = response.data.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as { title: string; messageIds: string[] }[];
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
      const intervalMinutes = parseInt(scheduled.schedule, 10) || 60;
      const nextRun = new Date(Date.now() + intervalMinutes * 60_000).toISOString();
      updateScheduledTaskRun(this.db, scheduled.id, nextRun);

      // Handle internal tasks directly
      if (scheduled.prompt.startsWith('@internal:')) {
        this.runInternalTask(scheduled.prompt);
        continue;
      }

      const task = createTask(this.db, `[Scheduled] ${scheduled.name}`);

      const taskPromise = this.runScheduledTask(task, scheduled.prompt)
        .finally(() => {
          this.runningTasks.delete(task.id);
          this.updateTodoFile();
        });

      this.runningTasks.set(task.id, taskPromise);
    }
  }

  private runInternalTask(prompt: string): void {
    const action = prompt.replace('@internal:', '');
    switch (action) {
      case 'cleanup':
        this.autoCleanup();
        break;
      case 'backup':
        this.autoBackup();
        break;
      default:
        logger.warn(`Unknown internal task: ${action}`);
    }
  }

  private ensureDefaultScheduledTasks(): void {
    const existing = getAllScheduledTasks(this.db);
    const existingNames = new Set(existing.map((t) => t.name));

    // Cleanup task: run based on cleanupIntervalDays
    if (!existingNames.has('cleanup')) {
      const intervalMinutes = this.config.cleanupIntervalDays * 24 * 60;
      createScheduledTask(this.db, 'cleanup', String(intervalMinutes), '@internal:cleanup');
      logger.info(`Created default scheduled task: cleanup (every ${this.config.cleanupIntervalDays} day(s))`);
    }

    // Backup task: only if persistence is enabled
    if (this.config.persistence.enabled && !existingNames.has('backup')) {
      const intervalMinutes = this.config.persistence.backupIntervalDays * 24 * 60;
      createScheduledTask(this.db, 'backup', String(intervalMinutes), '@internal:backup');
      logger.info(`Created default scheduled task: backup (every ${this.config.persistence.backupIntervalDays} day(s))`);
    }
  }

  private async runScheduledTask(task: Task, prompt: string): Promise<void> {
    try {
      const session = await createTaskSession({
        config: this.config,
        db: this.db,
        channels: this.channels,
        taskId: task.id,
        sourceChannel: 'cli',
        sourceSender: 'scheduler',
        systemPrompt: buildTaskSystemPrompt({
          workspacePath: this.config.workspacePath,
          repos: this.config.repos,
          taskTitle: task.title,
          taskId: task.id,
        }),
      });

      const contextFiles = getContextFiles(this.config.workspacePath);
      await session.send({
        prompt,
        attachments: contextFiles.map((p) => ({ type: 'file' as const, path: p })),
      });
      await session.disconnect();
      this._processedCount++;
    } catch (error) {
      logger.error(`Scheduled task ${task.id} failed: ${error}`);
    }
  }

  private updateTodoFile(): void {
    const tasks = getAllTasks(this.db);
    const statusIcons: Record<string, string> = {
      'pending': '⏳',
      'in-progress': '🔄',
      'completed': '✅',
      'failed': '❌',
      'need-info': '❓',
    };

    const lines = ['# CawPilot Tasks\n'];
    const active = tasks.filter((t) => t.status !== 'completed' && t.status !== 'failed');
    const done = tasks.filter((t) => t.status === 'completed' || t.status === 'failed');

    if (active.length > 0) {
      lines.push('## Active\n');
      for (const t of active) {
        lines.push(`- ${statusIcons[t.status] || '•'} **${t.title}** (${t.status})`);
      }
      lines.push('');
    }

    if (done.length > 0) {
      lines.push('## Completed\n');
      for (const t of done.slice(0, 20)) {
        lines.push(`- ${statusIcons[t.status] || '•'} ${t.title}${t.result ? ` — ${t.result}` : ''}`);
      }
      lines.push('');
    }

    const todoPath = join(this.config.workspacePath, 'TODO.md');
    writeFileSync(todoPath, lines.join('\n'), 'utf-8');
  }

  archiveCompletedTasks(): void {
    const count = archiveCompletedTasks(this.db, this.config.workspacePath);
    if (count > 0) {
      this.updateTodoFile();
    }
  }

  private autoCleanup(): void {
    this.archiveCompletedTasks();
  }

  private autoBackup(): void {
    if (!this.config.persistence.enabled) return;

    // Check last backup by looking at git log
    try {
      const lastCommit = execSync('git log -1 --format=%ci', { cwd: this.config.workspacePath, stdio: 'pipe' })
        .toString().trim();

      if (lastCommit) {
        const daysSince = (Date.now() - new Date(lastCommit).getTime()) / (1000 * 60 * 60 * 24);
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
