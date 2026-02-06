/**
 * Scheduled Task System for Forgekeeper
 *
 * Allows scheduling future tasks (one-shot or recurring) with
 * smart approval that can remember approvals for similar tasks.
 *
 * Scheduling Types:
 * - one-shot: run at specific time
 * - interval: every N minutes/hours
 * - cron: cron expressions
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { rotateIfNeeded } from './jsonl-rotate.js';
import { atomicWriteFileSync } from './atomic-write.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const DATA_DIR = config.paths?.data || './data';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const MEMORY_DIR = join(PERSONALITY_PATH, 'memory');

// Paths
const SCHEDULED_TASKS_PATH = join(DATA_DIR, 'scheduled_tasks.json');
const APPROVED_SCHEDULES_PATH = join(MEMORY_DIR, 'approved_schedules.json');
const SCHEDULED_EVENTS_PATH = join(JOURNAL_DIR, 'scheduled_events.jsonl');

// Settings
const ENABLED = config.scheduler?.enabled ?? true;
const MAX_PER_HOUR = config.scheduler?.maxPerHour ?? 20;
const REMEMBER_APPROVAL = config.scheduler?.rememberApproval ?? false;
const SKIP_APPROVAL = config.scheduler?.skipApproval ?? false;

// In-memory state
let scheduledTasks = [];
let approvedTypes = new Set();
const executionHistory = []; // Track recent executions for rate limiting
const eventListeners = [];

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  for (const dir of [DATA_DIR, JOURNAL_DIR, MEMORY_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Log scheduled event
 */
function logScheduledEvent(event) {
  ensureDirectories();

  try {
    appendFileSync(SCHEDULED_EVENTS_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    }) + '\n');
    rotateIfNeeded(SCHEDULED_EVENTS_PATH);
  } catch (err) {
    console.error('[Scheduler] Failed to log event:', err.message);
  }
}

/**
 * Emit event to listeners
 */
function emitEvent(type, data) {
  for (const listener of eventListeners) {
    try {
      listener({ type, ...data });
    } catch (err) {
      console.error('[Scheduler] Listener error:', err.message);
    }
  }
}

/**
 * Load scheduled tasks from disk
 */
function loadScheduledTasks() {
  try {
    if (existsSync(SCHEDULED_TASKS_PATH)) {
      const data = readFileSync(SCHEDULED_TASKS_PATH, 'utf-8');
      scheduledTasks = JSON.parse(data);
      console.log(`[Scheduler] Loaded ${scheduledTasks.length} scheduled tasks`);
    }
  } catch (err) {
    console.error('[Scheduler] Failed to load tasks:', err.message);
    scheduledTasks = [];
  }
}

/**
 * Save scheduled tasks to disk
 */
function saveScheduledTasks() {
  ensureDirectories();

  try {
    atomicWriteFileSync(SCHEDULED_TASKS_PATH, JSON.stringify(scheduledTasks, null, 2));
  } catch (err) {
    console.error('[Scheduler] Failed to save tasks:', err.message);
  }
}

/**
 * Load approved schedule types from disk
 */
function loadApprovedTypes() {
  try {
    if (existsSync(APPROVED_SCHEDULES_PATH)) {
      const data = readFileSync(APPROVED_SCHEDULES_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      approvedTypes = new Set(parsed.approvedTypes || []);
      console.log(`[Scheduler] Loaded ${approvedTypes.size} approved types`);
    }
  } catch (err) {
    console.error('[Scheduler] Failed to load approved types:', err.message);
    approvedTypes = new Set();
  }
}

/**
 * Save approved types to disk
 */
function saveApprovedTypes() {
  ensureDirectories();

  try {
    atomicWriteFileSync(APPROVED_SCHEDULES_PATH, JSON.stringify({
      approvedTypes: Array.from(approvedTypes),
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('[Scheduler] Failed to save approved types:', err.message);
  }
}

/**
 * Initialize scheduler (load persisted data)
 */
export function initialize() {
  loadScheduledTasks();
  loadApprovedTypes();
}

/**
 * Check if scheduler is enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Check rate limit
 */
function checkRateLimit() {
  const oneHourAgo = Date.now() - 3600000;
  const recentExecutions = executionHistory.filter(ts => ts > oneHourAgo);

  return {
    allowed: recentExecutions.length < MAX_PER_HOUR,
    count: recentExecutions.length,
    limit: MAX_PER_HOUR,
  };
}

/**
 * Extract task type for approval matching
 */
function extractTaskType(task) {
  // Simple heuristic: first word or action verb
  const words = task.toLowerCase().split(/\s+/);
  const actionVerbs = ['check', 'review', 'update', 'sync', 'clean', 'backup', 'report', 'notify', 'run'];

  for (const verb of actionVerbs) {
    if (words.includes(verb)) {
      return verb;
    }
  }

  // Default to first two words
  return words.slice(0, 2).join('_');
}

/**
 * Check if task type needs approval
 */
export function needsApproval(task) {
  if (!ENABLED) {
    return { needs: false, reason: 'Scheduler disabled' };
  }

  if (SKIP_APPROVAL) {
    return { needs: false, reason: 'Approval skipped by config' };
  }

  const taskType = extractTaskType(task);

  if (REMEMBER_APPROVAL && approvedTypes.has(taskType)) {
    return { needs: false, reason: `Task type "${taskType}" previously approved` };
  }

  return { needs: true, taskType };
}

/**
 * Approve a task type for future scheduling
 */
export function approveTaskType(taskType) {
  approvedTypes.add(taskType);

  if (REMEMBER_APPROVAL) {
    saveApprovedTypes();
  }

  logScheduledEvent({
    event: 'type_approved',
    taskType,
  });

  return { success: true, taskType };
}

/**
 * Generate task ID
 */
function generateTaskId() {
  return `sched-${randomUUID().slice(0, 8)}`;
}

/**
 * Parse interval string to milliseconds
 * Supports: "5m", "1h", "30s", "1d"
 */
function parseInterval(interval) {
  const match = interval.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    return null;
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Parse cron expression to next run time
 * Supports simple patterns: "0 * * * *" (hourly), "0 0 * * *" (daily)
 */
function parseCron(cronExpr) {
  const parts = cronExpr.split(/\s+/);

  if (parts.length !== 5) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date();

  // Simple implementation: calculate next matching time
  // For full cron support, would need a library

  // Handle simple cases
  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    // Every hour at specified minute
    const next = new Date(now);
    next.setMinutes(parseInt(minute));
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (next <= now) {
      next.setHours(next.getHours() + 1);
    }

    return next.getTime();
  }

  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    // Daily at specified time
    const next = new Date(now);
    next.setHours(parseInt(hour));
    next.setMinutes(parseInt(minute));
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  // Fallback: treat as hourly
  const next = new Date(now);
  next.setMinutes(parseInt(minute) || 0);
  next.setSeconds(0);
  next.setMilliseconds(0);

  if (next <= now) {
    next.setHours(next.getHours() + 1);
  }

  return next.getTime();
}

/**
 * Schedule a one-shot task
 *
 * @param {Object} options - Scheduling options
 * @param {string} options.at - ISO timestamp or Date for when to run
 * @param {string} options.task - Task description
 * @param {Object} options.context - Additional context for the task
 * @param {boolean} options.approved - Whether already approved
 * @returns {Object} Scheduling result
 */
export function scheduleTask(options) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Scheduler is disabled',
    };
  }

  if (!options.task) {
    return {
      success: false,
      error: 'Task description is required',
    };
  }

  if (!options.at) {
    return {
      success: false,
      error: 'Execution time (at) is required',
    };
  }

  // Check approval
  if (!options.approved) {
    const approval = needsApproval(options.task);
    if (approval.needs) {
      return {
        success: false,
        needsApproval: true,
        taskType: approval.taskType,
        message: `Task type "${approval.taskType}" requires approval first`,
      };
    }
  }

  const runAt = typeof options.at === 'string'
    ? new Date(options.at).getTime()
    : options.at.getTime();

  if (isNaN(runAt)) {
    return {
      success: false,
      error: 'Invalid execution time',
    };
  }

  if (runAt < Date.now()) {
    return {
      success: false,
      error: 'Execution time is in the past',
    };
  }

  const taskId = generateTaskId();

  const scheduledTask = {
    id: taskId,
    type: 'oneshot',
    task: options.task,
    context: options.context || null,
    runAt,
    runAtISO: new Date(runAt).toISOString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  scheduledTasks.push(scheduledTask);
  saveScheduledTasks();

  logScheduledEvent({
    event: 'scheduled',
    taskId,
    type: 'oneshot',
    task: options.task,
    runAt: scheduledTask.runAtISO,
  });

  console.log(`[Scheduler] Scheduled one-shot task ${taskId} for ${scheduledTask.runAtISO}`);

  emitEvent('task_scheduled', {
    taskId,
    taskType: 'oneshot',
    task: options.task,
    runAt: scheduledTask.runAtISO,
  });

  return {
    success: true,
    taskId,
    runAt: scheduledTask.runAtISO,
    message: `Task scheduled for ${scheduledTask.runAtISO}`,
  };
}

/**
 * Schedule a recurring task
 *
 * @param {Object} options - Scheduling options
 * @param {string} options.every - Interval string ("5m", "1h", "30s")
 * @param {string} options.cron - Cron expression (alternative to every)
 * @param {string} options.task - Task description
 * @param {Object} options.context - Additional context
 * @param {boolean} options.approved - Whether already approved
 * @returns {Object} Scheduling result
 */
export function scheduleRecurring(options) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Scheduler is disabled',
    };
  }

  if (!options.task) {
    return {
      success: false,
      error: 'Task description is required',
    };
  }

  if (!options.every && !options.cron) {
    return {
      success: false,
      error: 'Either "every" interval or "cron" expression is required',
    };
  }

  // Check approval
  if (!options.approved) {
    const approval = needsApproval(options.task);
    if (approval.needs) {
      return {
        success: false,
        needsApproval: true,
        taskType: approval.taskType,
        message: `Task type "${approval.taskType}" requires approval first`,
      };
    }
  }

  let intervalMs = null;
  let nextRun = null;

  if (options.every) {
    intervalMs = parseInterval(options.every);
    if (!intervalMs) {
      return {
        success: false,
        error: `Invalid interval format: ${options.every}. Use "5m", "1h", "30s", etc.`,
      };
    }
    nextRun = Date.now() + intervalMs;
  } else if (options.cron) {
    nextRun = parseCron(options.cron);
    if (!nextRun) {
      return {
        success: false,
        error: `Invalid cron expression: ${options.cron}`,
      };
    }
  }

  const taskId = generateTaskId();

  const scheduledTask = {
    id: taskId,
    type: 'recurring',
    task: options.task,
    context: options.context || null,
    interval: options.every || null,
    intervalMs,
    cron: options.cron || null,
    nextRun,
    nextRunISO: new Date(nextRun).toISOString(),
    createdAt: new Date().toISOString(),
    executionCount: 0,
    status: 'active',
  };

  scheduledTasks.push(scheduledTask);
  saveScheduledTasks();

  logScheduledEvent({
    event: 'scheduled',
    taskId,
    type: 'recurring',
    task: options.task,
    interval: options.every,
    cron: options.cron,
    nextRun: scheduledTask.nextRunISO,
  });

  console.log(`[Scheduler] Scheduled recurring task ${taskId}, next run: ${scheduledTask.nextRunISO}`);

  emitEvent('task_scheduled', {
    taskId,
    taskType: 'recurring',
    task: options.task,
    nextRun: scheduledTask.nextRunISO,
  });

  return {
    success: true,
    taskId,
    nextRun: scheduledTask.nextRunISO,
    message: `Recurring task scheduled, first run at ${scheduledTask.nextRunISO}`,
  };
}

/**
 * Cancel a scheduled task
 *
 * @param {string} taskId - Task ID to cancel
 * @returns {Object} Cancellation result
 */
export function cancelTask(taskId) {
  const index = scheduledTasks.findIndex(t => t.id === taskId);

  if (index === -1) {
    return {
      success: false,
      error: 'Task not found',
    };
  }

  const task = scheduledTasks[index];
  scheduledTasks.splice(index, 1);
  saveScheduledTasks();

  logScheduledEvent({
    event: 'cancelled',
    taskId,
    task: task.task,
  });

  console.log(`[Scheduler] Cancelled task ${taskId}`);

  emitEvent('task_cancelled', {
    taskId,
    task: task.task,
  });

  return {
    success: true,
    taskId,
    message: 'Task cancelled',
  };
}

/**
 * List all scheduled tasks
 *
 * @returns {Array} List of scheduled tasks
 */
export function listScheduled() {
  // Update next run times for recurring tasks
  const now = Date.now();

  return scheduledTasks
    .filter(t => t.status === 'pending' || t.status === 'active')
    .map(t => ({
      id: t.id,
      type: t.type,
      task: t.task,
      runAt: t.type === 'oneshot' ? t.runAtISO : t.nextRunISO,
      interval: t.interval,
      cron: t.cron,
      status: t.status,
      executionCount: t.executionCount || 0,
      createdAt: t.createdAt,
      isOverdue: (t.runAt || t.nextRun) < now,
    }))
    .sort((a, b) => new Date(a.runAt) - new Date(b.runAt));
}

/**
 * Get tasks that are due for execution
 *
 * @returns {Array} Tasks ready to execute
 */
export function getDueTasks() {
  const now = Date.now();

  return scheduledTasks.filter(t => {
    if (t.status !== 'pending' && t.status !== 'active') {
      return false;
    }

    if (t.type === 'oneshot') {
      return t.runAt <= now;
    }

    if (t.type === 'recurring') {
      return t.nextRun <= now;
    }

    return false;
  });
}

/**
 * Execute a scheduled task
 *
 * @param {string} taskId - Task ID to execute
 * @param {Function} executor - Function to execute the task
 * @returns {Promise<Object>} Execution result
 */
export async function executeScheduled(taskId, executor) {
  const rateCheck = checkRateLimit();

  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded: ${rateCheck.count}/${rateCheck.limit} executions this hour`,
    };
  }

  const task = scheduledTasks.find(t => t.id === taskId);

  if (!task) {
    return {
      success: false,
      error: 'Task not found',
    };
  }

  logScheduledEvent({
    event: 'execute_start',
    taskId,
    task: task.task,
  });

  try {
    const result = await executor(task.task, task.context);

    // Track execution for rate limiting
    executionHistory.push(Date.now());

    if (task.type === 'oneshot') {
      // Mark as completed
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    } else if (task.type === 'recurring') {
      // Update next run time
      task.executionCount = (task.executionCount || 0) + 1;
      task.lastRun = Date.now();
      task.lastRunISO = new Date().toISOString();

      if (task.intervalMs) {
        task.nextRun = Date.now() + task.intervalMs;
      } else if (task.cron) {
        task.nextRun = parseCron(task.cron);
      }

      task.nextRunISO = new Date(task.nextRun).toISOString();
    }

    saveScheduledTasks();

    logScheduledEvent({
      event: 'execute_success',
      taskId,
      task: task.task,
      type: task.type,
      executionCount: task.executionCount,
    });

    console.log(`[Scheduler] Executed task ${taskId}`);

    emitEvent('task_executed', {
      taskId,
      task: task.task,
      success: true,
    });

    return {
      success: true,
      taskId,
      result,
    };

  } catch (err) {
    logScheduledEvent({
      event: 'execute_failed',
      taskId,
      task: task.task,
      error: err.message,
    });

    console.error(`[Scheduler] Task ${taskId} failed:`, err.message);

    emitEvent('task_executed', {
      taskId,
      task: task.task,
      success: false,
      error: err.message,
    });

    return {
      success: false,
      taskId,
      error: err.message,
    };
  }
}

/**
 * Register an event listener
 */
export function onSchedulerEvent(callback) {
  eventListeners.push(callback);
}

/**
 * Remove an event listener
 */
export function offSchedulerEvent(callback) {
  const index = eventListeners.indexOf(callback);
  if (index >= 0) {
    eventListeners.splice(index, 1);
  }
}

/**
 * Get scheduler statistics
 */
export function getStats() {
  const rateCheck = checkRateLimit();

  return {
    enabled: ENABLED,
    maxPerHour: MAX_PER_HOUR,
    rememberApproval: REMEMBER_APPROVAL,
    skipApproval: SKIP_APPROVAL,
    pendingCount: scheduledTasks.filter(t => t.status === 'pending').length,
    activeCount: scheduledTasks.filter(t => t.status === 'active').length,
    completedCount: scheduledTasks.filter(t => t.status === 'completed').length,
    approvedTypesCount: approvedTypes.size,
    executionsThisHour: rateCheck.count,
    listenerCount: eventListeners.length,
  };
}

/**
 * Clean up completed tasks
 */
export function cleanup(maxAge = 86400000) { // 24 hours
  const now = Date.now();
  let cleaned = 0;

  scheduledTasks = scheduledTasks.filter(t => {
    if (t.status === 'completed') {
      const completedAt = new Date(t.completedAt).getTime();
      if ((now - completedAt) > maxAge) {
        cleaned++;
        return false;
      }
    }
    return true;
  });

  if (cleaned > 0) {
    saveScheduledTasks();
  }

  return cleaned;
}

// Initialize on module load
initialize();

export default {
  isEnabled,
  needsApproval,
  approveTaskType,
  scheduleTask,
  scheduleRecurring,
  cancelTask,
  listScheduled,
  getDueTasks,
  executeScheduled,
  onSchedulerEvent,
  offSchedulerEvent,
  getStats,
  cleanup,
  initialize,
};
