import type Database from 'better-sqlite3';
import { type CawpilotConfig } from '../workspace/config.js';
import type { Channel } from '../channels/types.js';
import {
  getRecentHistory,
  getMessagesByTask,
  getMessagesByIds,
} from '../db/messages.js';
import { type Task } from '../db/tasks.js';
import { logger } from '../utils/logger.js';
import type { AgentSession } from '../providers/provider.js';
import { runTask } from './task-runner.js';
import { buildConversationContext } from './context-builder.js';
import {
  notifyTaskCompleted,
  notifyTaskFailed,
  notifyTaskStarted,
} from './notifications.js';
import { TaskRegistry } from './task-registry.js';
import { MessageIntakeService } from './message-intake-service.js';
import { SchedulerService } from './scheduler-service.js';

export class Orchestrator {
  private readonly taskRegistry: TaskRegistry;
  private readonly messageIntake: MessageIntakeService;
  private readonly scheduler: SchedulerService;
  private _processedCount = 0;

  constructor(
    private readonly config: CawpilotConfig,
    private readonly db: Database.Database,
    private readonly channels: Map<string, Channel>,
  ) {
    this.taskRegistry = new TaskRegistry(db);
    this.messageIntake = new MessageIntakeService(
      config,
      db,
      channels,
      () => this.taskRegistry.reconcileActiveTasks(),
      (task, contextMessageIds) => {
        this.dispatchTask(task, contextMessageIds);
      },
    );
    this.scheduler = new SchedulerService(
      config,
      db,
      channels,
      this.taskRegistry,
      {
        onProcessedTask: () => {
          this._processedCount++;
        },
      },
    );
  }

  get processedCount(): number {
    return this._processedCount;
  }

  get activeTaskCount(): number {
    return this.taskRegistry.activeTaskCount;
  }

  registerSession(taskId: string, session: AgentSession): void {
    this.taskRegistry.registerSession(taskId, session);
  }

  async cancelTask(taskId: string): Promise<boolean> {
    return this.taskRegistry.cancelTask(taskId);
  }

  start(): void {
    logger.info('Orchestrator started');
    this.messageIntake.start();
    this.scheduler.start();
  }

  stop(): void {
    this.messageIntake.stop();
    this.scheduler.stop();
    logger.info('Orchestrator stopped');
  }

  private dispatchTask(task: Task, contextMessageIds?: string[]): void {
    notifyTaskStarted(task.title);

    const history = getRecentHistory(this.db, this.config.contextMessagesCount);
    const taskMessages = getMessagesByTask(this.db, task.id);
    const extraMessages = contextMessageIds
      ? getMessagesByIds(this.db, contextMessageIds)
      : [];
    const context = buildConversationContext(
      history,
      taskMessages,
      extraMessages,
    );
    const taskPromise = runTask({
      task,
      config: this.config,
      db: this.db,
      channels: this.channels,
      orchestrator: this,
      context,
    })
      .then(() => {
        this._processedCount++;
        notifyTaskCompleted(task.title);
      })
      .catch(() => {
        notifyTaskFailed(task.title);
      })
      .finally(() => {
        this.taskRegistry.releaseTask(task.id);
      });

    this.taskRegistry.trackTask(task.id, taskPromise);
  }

  archiveCompletedTasks(): void {
    this.scheduler.runCleanup();
  }
}
