// Agent Pool - Parallel task execution with multiple Claude workers
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Agent Pool - Manages multiple worker threads for parallel task execution
 */
export class AgentPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.poolSize = options.poolSize || 3; // Default 3 parallel agents
    this.workers = new Map();
    this.taskQueue = [];
    this.activeTaskCount = 0;
    this.running = false;
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
    };
  }

  /**
   * Initialize the agent pool with workers
   */
  async initialize() {
    console.log(`[AgentPool] Initializing with ${this.poolSize} workers...`);

    for (let i = 0; i < this.poolSize; i++) {
      const agentId = `agent-${i}`;
      await this.spawnWorker(agentId);
    }

    this.running = true;
    console.log(`[AgentPool] Ready with ${this.workers.size} workers`);
    return this;
  }

  /**
   * Spawn a new worker thread
   */
  async spawnWorker(agentId) {
    const workerPath = join(__dirname, 'agent-worker.js');

    const worker = new Worker(workerPath, {
      workerData: { agentId },
    });

    const workerState = {
      worker,
      agentId,
      busy: false,
      currentTask: null,
      tasksCompleted: 0,
    };

    worker.on('message', (message) => this.handleWorkerMessage(agentId, message));
    worker.on('error', (error) => this.handleWorkerError(agentId, error));
    worker.on('exit', (code) => this.handleWorkerExit(agentId, code));

    this.workers.set(agentId, workerState);
    console.log(`[AgentPool] Worker ${agentId} spawned`);
  }

  /**
   * Handle messages from workers
   */
  handleWorkerMessage(agentId, message) {
    const workerState = this.workers.get(agentId);
    if (!workerState) return;

    switch (message.type) {
      case 'task_started':
        this.emit('task:started', { agentId, taskId: message.taskId });
        break;

      case 'task_completed':
        this.handleTaskComplete(agentId, message);
        break;

      case 'task_failed':
        this.handleTaskFailed(agentId, message);
        break;

      case 'task_progress':
        this.emit('task:progress', { agentId, taskId: message.taskId, progress: message.progress });
        break;

      case 'ready':
        console.log(`[AgentPool] Worker ${agentId} ready`);
        break;

      default:
        console.log(`[AgentPool] Unknown message from ${agentId}:`, message);
    }
  }

  /**
   * Handle task completion
   */
  handleTaskComplete(agentId, message) {
    const workerState = this.workers.get(agentId);
    if (!workerState) return;

    workerState.busy = false;
    workerState.tasksCompleted++;
    workerState.currentTask = null;
    this.activeTaskCount--;
    this.stats.tasksCompleted++;
    this.stats.totalExecutionTime += message.elapsed || 0;

    this.emit('task:completed', {
      agentId,
      taskId: message.taskId,
      result: message.result,
      elapsed: message.elapsed,
    });

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Handle task failure
   */
  handleTaskFailed(agentId, message) {
    const workerState = this.workers.get(agentId);
    if (!workerState) return;

    workerState.busy = false;
    workerState.currentTask = null;
    this.activeTaskCount--;
    this.stats.tasksFailed++;

    this.emit('task:failed', {
      agentId,
      taskId: message.taskId,
      error: message.error,
    });

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Handle worker errors
   */
  handleWorkerError(agentId, error) {
    console.error(`[AgentPool] Worker ${agentId} error:`, error);
    this.emit('worker:error', { agentId, error });

    // Respawn the worker
    const workerState = this.workers.get(agentId);
    if (workerState?.currentTask) {
      // Re-queue the failed task
      this.taskQueue.unshift(workerState.currentTask);
      this.activeTaskCount--;
    }

    this.workers.delete(agentId);
    this.spawnWorker(agentId);
  }

  /**
   * Handle worker exit
   */
  handleWorkerExit(agentId, code) {
    console.log(`[AgentPool] Worker ${agentId} exited with code ${code}`);

    if (this.running && code !== 0) {
      // Unexpected exit, respawn
      setTimeout(() => this.spawnWorker(agentId), 1000);
    }
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task) {
    const taskWrapper = {
      id: task.id || randomUUID(),
      task,
      submittedAt: Date.now(),
    };

    // Find available worker
    const available = this.findAvailableWorker();

    if (available) {
      this.assignTask(available.agentId, taskWrapper);
    } else {
      // Queue the task
      this.taskQueue.push(taskWrapper);
      this.emit('task:queued', { taskId: taskWrapper.id, position: this.taskQueue.length });
    }

    return taskWrapper.id;
  }

  /**
   * Find an available worker
   */
  findAvailableWorker() {
    for (const [agentId, state] of this.workers) {
      if (!state.busy) {
        return state;
      }
    }
    return null;
  }

  /**
   * Assign a task to a worker
   */
  assignTask(agentId, taskWrapper) {
    const workerState = this.workers.get(agentId);
    if (!workerState) return;

    workerState.busy = true;
    workerState.currentTask = taskWrapper;
    this.activeTaskCount++;

    workerState.worker.postMessage({
      type: 'execute_task',
      taskId: taskWrapper.id,
      task: taskWrapper.task,
    });
  }

  /**
   * Process the task queue
   */
  processQueue() {
    while (this.taskQueue.length > 0) {
      const available = this.findAvailableWorker();
      if (!available) break;

      const taskWrapper = this.taskQueue.shift();
      this.assignTask(available.agentId, taskWrapper);
    }
  }

  /**
   * Get pool status
   */
  getStatus() {
    const workers = [];
    for (const [agentId, state] of this.workers) {
      workers.push({
        agentId,
        busy: state.busy,
        currentTask: state.currentTask?.id || null,
        tasksCompleted: state.tasksCompleted,
      });
    }

    return {
      poolSize: this.poolSize,
      activeWorkers: this.workers.size,
      busyWorkers: Array.from(this.workers.values()).filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      activeTaskCount: this.activeTaskCount,
      stats: this.stats,
      workers,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown() {
    console.log('[AgentPool] Shutting down...');
    this.running = false;

    const shutdownPromises = [];
    for (const [agentId, state] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          state.worker.postMessage({ type: 'shutdown' });
          state.worker.once('exit', resolve);

          // Force terminate after 5 seconds
          setTimeout(() => {
            state.worker.terminate();
            resolve();
          }, 5000);
        })
      );
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
    console.log('[AgentPool] Shutdown complete');
  }
}

/**
 * Create a configured agent pool
 */
export function createAgentPool(options = {}) {
  return new AgentPool(options);
}

export default AgentPool;
