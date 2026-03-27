import type Database from 'better-sqlite3';
import { type CawpilotConfig, getContextFiles } from '../workspace/config.js';
import { runCommand } from '../workspace/commands.js';
import { runBackup } from '../workspace/persistence.js';
import { archiveCompletedTasks } from '../workspace/cleanup.js';
import type { Channel } from '../channels/types.js';
import {
  createScheduledTask,
  getDueScheduledTasks,
  getAllScheduledTasks,
  updateScheduledTaskRun,
} from '../db/scheduled.js';
import { createTask, type Task } from '../db/tasks.js';
import { logger } from '../utils/logger.js';
import { TASK_SYSTEM_PROMPT, buildTaskPrompt } from './prompts.js';
import { buildTools, type ToolContext } from './tools.js';
import { createTaskSession } from './runtime.js';
import { notifyAutoBackup } from './notifications.js';
import type { TaskRegistry } from './task-registry.js';

const SCHEDULER_INTERVAL_MS = 60_000;

type SchedulerCallbacks = {
  onProcessedTask: () => void;
};

export class SchedulerService {
  private schedulerTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: CawpilotConfig,
    private readonly db: Database.Database,
    private readonly channels: Map<string, Channel>,
    private readonly taskRegistry: TaskRegistry,
    private readonly callbacks: SchedulerCallbacks,
  ) {}

  start(): void {
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledTasks().catch((error: unknown) => {
        logger.error(`Scheduled task check error: ${error}`);
      });
    }, SCHEDULER_INTERVAL_MS);

    this.ensureDefaultScheduledTasks();
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  runCleanup(): void {
    archiveCompletedTasks(this.db, this.config.workspacePath);
  }

  private async checkScheduledTasks(): Promise<void> {
    const dueTasks = getDueScheduledTasks(this.db);
    for (const scheduled of dueTasks) {
      logger.info(`Running scheduled task: ${scheduled.name}`);

      const intervalMinutes = Number.parseInt(scheduled.schedule, 10) || 60;
      const nextRun = new Date(
        Date.now() + intervalMinutes * 60_000,
      ).toISOString();
      updateScheduledTaskRun(this.db, scheduled.id, nextRun);

      if (scheduled.prompt.startsWith('@internal:')) {
        this.runInternalTask(scheduled.prompt);
        continue;
      }

      const task = createTask(this.db, `[Scheduled] ${scheduled.name}`);
      const taskPromise = this.runScheduledTask(task, scheduled.prompt).finally(
        () => {
          this.taskRegistry.releaseTask(task.id);
        },
      );

      this.taskRegistry.trackTask(task.id, taskPromise);
    }
  }

  private runInternalTask(prompt: string): void {
    const action = prompt.replace('@internal:', '');
    switch (action) {
      case 'cleanup': {
        this.runCleanup();
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
    const existingNames = new Set(existing.map((task) => task.name));

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

      this.taskRegistry.registerSession(task.id, session);

      const userPrompt = buildTaskPrompt({
        workspacePath: this.config.workspacePath,
        taskTitle: task.title,
        taskId: task.id,
        context: prompt,
      });

      const contextFiles = getContextFiles(this.config.workspacePath);
      await session.send({
        prompt: userPrompt,
        attachments: contextFiles.map((filePath) => ({
          type: 'file' as const,
          path: filePath,
        })),
      });
      await session.disconnect();
      this.callbacks.onProcessedTask();
    } catch (error) {
      logger.error(`Scheduled task ${task.id} failed: ${error}`);
    }
  }

  private autoBackup(): void {
    if (!this.config.persistence.enabled) return;

    try {
      const lastCommit = runCommand('git', ['log', '-1', '--format=%ci'], {
        cwd: this.config.workspacePath,
        stdio: 'pipe',
      });

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
      notifyAutoBackup(result.message);
    }
  }
}
