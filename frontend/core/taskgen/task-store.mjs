/**
 * Task Store - JSONL-based persistence for generated tasks
 *
 * Stores tasks to .forgekeeper/tasks/generated_tasks.jsonl
 * Supports append-only writes and full reads
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default task storage directory
const TASKS_DIR = process.env.FGK_TASKS_DIR || '.forgekeeper/tasks';
const TASKS_FILE = path.join(TASKS_DIR, 'generated_tasks.jsonl');

/**
 * Ensure tasks directory exists
 */
async function ensureTasksDir() {
  try {
    await fs.access(TASKS_DIR);
  } catch {
    await fs.mkdir(TASKS_DIR, { recursive: true });
  }
}

/**
 * Save a task to JSONL storage
 *
 * @param {Object} task - Task card to save
 * @returns {Promise<void>}
 */
export async function saveTask(task) {
  await ensureTasksDir();

  // Ensure task has required fields
  if (!task.id || !task.type || !task.status) {
    throw new Error('Task must have id, type, and status fields');
  }

  // Add saved timestamp
  const taskWithTimestamp = {
    ...task,
    savedAt: new Date().toISOString(),
  };

  // Append to JSONL file
  const line = JSON.stringify(taskWithTimestamp) + '\n';
  await fs.appendFile(TASKS_FILE, line, 'utf-8');
}

/**
 * Load all tasks from JSONL storage
 *
 * @param {Object} options - Query options
 * @param {string} options.status - Filter by status
 * @param {string} options.type - Filter by type
 * @param {number} options.limit - Max tasks to return
 * @returns {Promise<Array>} Array of tasks
 */
export async function loadTasks(options = {}) {
  const { status, type, limit } = options;

  try {
    await fs.access(TASKS_FILE);
  } catch {
    // File doesn't exist yet
    return [];
  }

  const content = await fs.readFile(TASKS_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.length > 0);

  let tasks = [];
  for (const line of lines) {
    try {
      const task = JSON.parse(line);
      tasks.push(task);
    } catch (err) {
      console.warn('[TaskStore] Skipping malformed line:', err.message);
    }
  }

  // Build task index (latest version of each task by ID)
  const taskIndex = new Map();
  for (const task of tasks) {
    taskIndex.set(task.id, task);
  }

  // Convert to array
  let result = Array.from(taskIndex.values());

  // Apply filters
  if (status) {
    result = result.filter(t => t.status === status);
  }

  if (type) {
    result = result.filter(t => t.type === type);
  }

  // Sort by priority (descending) and generatedAt (newest first)
  result.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return new Date(b.generatedAt) - new Date(a.generatedAt);
  });

  // Apply limit
  if (limit) {
    result = result.slice(0, limit);
  }

  return result;
}

/**
 * Get a single task by ID
 *
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Task or null if not found
 */
export async function getTask(taskId) {
  const tasks = await loadTasks();
  return tasks.find(t => t.id === taskId) || null;
}

/**
 * Update a task's status
 *
 * @param {string} taskId - Task ID
 * @param {string} newStatus - New status (generated, approved, dismissed, completed)
 * @returns {Promise<Object|null>} Updated task or null if not found
 */
export async function updateTaskStatus(taskId, newStatus) {
  const task = await getTask(taskId);

  if (!task) {
    return null;
  }

  // Update status and timestamp
  const updatedTask = {
    ...task,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  // Append updated version to JSONL (append-only)
  await saveTask(updatedTask);

  return updatedTask;
}

/**
 * Dismiss a task
 *
 * @param {string} taskId - Task ID
 * @param {string} reason - Optional dismissal reason
 * @returns {Promise<Object|null>} Dismissed task or null if not found
 */
export async function dismissTask(taskId, reason = null) {
  const task = await getTask(taskId);

  if (!task) {
    return null;
  }

  const dismissedTask = {
    ...task,
    status: 'dismissed',
    dismissedAt: new Date().toISOString(),
    dismissalReason: reason,
  };

  await saveTask(dismissedTask);
  return dismissedTask;
}

/**
 * Approve a task
 *
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Approved task or null if not found
 */
export async function approveTask(taskId) {
  const task = await getTask(taskId);

  if (!task) {
    return null;
  }

  const approvedTask = {
    ...task,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  };

  await saveTask(approvedTask);
  return approvedTask;
}

/**
 * Get task statistics
 *
 * @returns {Promise<Object>} Statistics
 */
export async function getTaskStats() {
  const tasks = await loadTasks();

  const stats = {
    total: tasks.length,
    byStatus: {},
    bySeverity: {},
    byType: {},
    avgPriority: 0,
    avgConfidence: 0,
  };

  // Count by status
  for (const task of tasks) {
    stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
    stats.bySeverity[task.severity] = (stats.bySeverity[task.severity] || 0) + 1;
    stats.byType[task.type] = (stats.byType[task.type] || 0) + 1;
    stats.avgPriority += task.priority || 0;
    stats.avgConfidence += task.confidence || 0;
  }

  if (tasks.length > 0) {
    stats.avgPriority /= tasks.length;
    stats.avgConfidence /= tasks.length;
  }

  return stats;
}

/**
 * Clean up old dismissed tasks (older than N days)
 *
 * @param {number} daysOld - Days threshold (default: 30)
 * @returns {Promise<number>} Number of tasks cleaned up
 */
export async function cleanupOldTasks(daysOld = 30) {
  const tasks = await loadTasks();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  let kept = 0;
  let removed = 0;

  // Rebuild file with only non-dismissed or recent dismissed tasks
  const keptTasks = tasks.filter(task => {
    if (task.status !== 'dismissed') {
      kept++;
      return true;
    }

    const dismissedDate = new Date(task.dismissedAt || task.updatedAt);
    if (dismissedDate > cutoffDate) {
      kept++;
      return true;
    }

    removed++;
    return false;
  });

  // Write cleaned tasks
  if (removed > 0) {
    await ensureTasksDir();
    const content = keptTasks.map(t => JSON.stringify(t)).join('\n') + '\n';
    await fs.writeFile(TASKS_FILE, content, 'utf-8');
  }

  return removed;
}

export default {
  saveTask,
  loadTasks,
  getTask,
  updateTaskStatus,
  dismissTask,
  approveTask,
  getTaskStats,
  cleanupOldTasks,
};
