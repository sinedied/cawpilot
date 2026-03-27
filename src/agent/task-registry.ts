import type Database from 'better-sqlite3';
import { getTaskById, updateTaskStatus } from '../db/tasks.js';
import type { AgentSession } from '../providers/provider.js';
import { logger } from '../utils/logger.js';
import { notifyTaskCancelled } from './notifications.js';

export class TaskRegistry {
  private readonly runningTasks = new Map<string, Promise<void>>();
  private readonly activeSessions = new Map<string, AgentSession>();

  constructor(private readonly db: Database.Database) {}

  get activeTaskCount(): number {
    return this.runningTasks.size;
  }

  registerSession(taskId: string, session: AgentSession): void {
    this.activeSessions.set(taskId, session);
  }

  trackTask(taskId: string, taskPromise: Promise<void>): void {
    this.runningTasks.set(taskId, taskPromise);
  }

  releaseTask(taskId: string): void {
    this.runningTasks.delete(taskId);
    this.activeSessions.delete(taskId);
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
    notifyTaskCancelled(task.title);
    return true;
  }
}
