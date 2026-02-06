/**
 * Autonomous Feedback Module for Forgekeeper
 *
 * Ensures autonomous tasks get executed and their outcomes
 * are fed back into subsequent reflections for learning.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const ACTION_OUTCOMES_PATH = join(JOURNAL_DIR, 'action_outcomes.jsonl');

// Settings
const STUCK_THRESHOLD_MS = config.autonomousFeedback?.stuckThresholdMs ?? 30 * 60 * 1000; // 30 minutes

// State for tracking
let lastOutcome = null;
let autonomousStats = {
  totalCreated: 0,
  totalCompleted: 0,
  totalFailed: 0,
  lastCompletedAt: null,
};

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Check if a task is autonomous (created by reflection)
 */
export function isAutonomousTask(task) {
  return task?.origin === 'autonomous' ||
         task?.origin === 'reflection' ||
         task?.metadata?.fromReflection === true;
}

/**
 * Prioritize tasks - autonomous tasks get priority when no user tasks pending
 *
 * @param {Array} tasks - List of pending tasks
 * @returns {Array} Sorted tasks with autonomous priority applied
 */
export function prioritizeTasks(tasks) {
  if (!tasks || tasks.length === 0) return [];

  // Separate user and autonomous tasks
  const userTasks = tasks.filter(t => !isAutonomousTask(t));
  const autonomousTasks = tasks.filter(t => isAutonomousTask(t));

  // If no user tasks, prioritize autonomous
  if (userTasks.length === 0) {
    return sortByPriorityAndAge(autonomousTasks);
  }

  // Otherwise, user tasks first, then autonomous
  return [
    ...sortByPriorityAndAge(userTasks),
    ...sortByPriorityAndAge(autonomousTasks),
  ];
}

/**
 * Sort tasks by priority and creation date
 */
function sortByPriorityAndAge(tasks) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  return tasks.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 2;
    const bPriority = priorityOrder[b.priority] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(a.created) - new Date(b.created);
  });
}

/**
 * Record an action outcome for learning
 *
 * @param {Object} task - The completed/failed task
 * @param {Object} result - Execution result
 * @returns {Object} The recorded outcome
 */
export function recordOutcome(task, result) {
  ensureJournalDir();

  const outcome = {
    id: `outcome-${Date.now()}`,
    ts: new Date().toISOString(),
    taskId: task.id,
    taskDescription: task.description,
    origin: task.origin,
    isAutonomous: isAutonomousTask(task),
    success: result.success,
    output: result.output?.slice(0, 500),
    error: result.error,
    elapsed: result.elapsed,
    attempts: task.attempts?.length || 1,
  };

  try {
    appendFileSync(ACTION_OUTCOMES_PATH, JSON.stringify(outcome) + '\n');
    rotateIfNeeded(ACTION_OUTCOMES_PATH);
    console.log(`[AutonomousFeedback] Recorded outcome: ${task.id} (${result.success ? 'success' : 'failed'})`);
  } catch (err) {
    console.error('[AutonomousFeedback] Failed to record outcome:', err.message);
  }

  // Update stats if autonomous
  if (outcome.isAutonomous) {
    if (result.success) {
      autonomousStats.totalCompleted++;
      autonomousStats.lastCompletedAt = outcome.ts;
    } else {
      autonomousStats.totalFailed++;
    }
  }

  // Store as last outcome for reflection context
  lastOutcome = outcome;

  return outcome;
}

/**
 * Get the last action outcome for reflection context
 */
export function getLastOutcome() {
  return lastOutcome;
}

/**
 * Get recent outcomes from journal
 */
export function getRecentOutcomes(limit = 5) {
  if (!existsSync(ACTION_OUTCOMES_PATH)) return [];

  try {
    const lines = readFileSync(ACTION_OUTCOMES_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Find stuck autonomous tasks (pending for too long)
 *
 * @param {Array} pendingTasks - List of pending tasks
 * @returns {Array} Stuck autonomous tasks
 */
export function findStuckTasks(pendingTasks) {
  const now = Date.now();

  return pendingTasks
    .filter(t => isAutonomousTask(t))
    .filter(t => {
      const created = new Date(t.created).getTime();
      return (now - created) > STUCK_THRESHOLD_MS;
    })
    .map(t => ({
      ...t,
      stuckDuration: now - new Date(t.created).getTime(),
      stuckMinutes: Math.round((now - new Date(t.created).getTime()) / 60000),
    }));
}

/**
 * Format last outcome for reflection prompt
 */
export function formatOutcomeForReflection() {
  if (!lastOutcome) return null;

  const age = Date.now() - new Date(lastOutcome.ts).getTime();
  const ageMinutes = Math.round(age / 60000);

  // Only include recent outcomes (last hour)
  if (ageMinutes > 60) return null;

  const status = lastOutcome.success ? 'succeeded' : 'failed';
  const summary = lastOutcome.output?.slice(0, 100) || lastOutcome.error || 'No details';

  return `Last action (${ageMinutes}m ago): "${lastOutcome.taskDescription}" - ${status}: ${summary}`;
}

/**
 * Format stuck tasks for reflection prompt
 */
export function formatStuckTasksForReflection(stuckTasks) {
  if (!stuckTasks || stuckTasks.length === 0) return null;

  const items = stuckTasks.slice(0, 3).map(t =>
    `- "${t.description}" (stuck for ${t.stuckMinutes} minutes)`
  );

  return `Stuck autonomous tasks that need reassessment:\n${items.join('\n')}`;
}

/**
 * Build proactive notification for completed autonomous task
 */
export function buildCompletionNotification(task, result) {
  if (!isAutonomousTask(task)) return null;

  if (result.success) {
    return `I noticed an opportunity and took action: "${task.description}"\n\nResult: ${result.output?.slice(0, 300) || 'Completed successfully'}`;
  } else {
    return `I tried to handle something autonomously: "${task.description}"\n\nBut it didn't work out: ${result.error || 'Unknown error'}`;
  }
}

/**
 * Track that an autonomous task was created
 */
export function trackTaskCreated(task) {
  if (isAutonomousTask(task)) {
    autonomousStats.totalCreated++;
    console.log(`[AutonomousFeedback] Tracked autonomous task created: ${task.id}`);
  }
}

/**
 * Get autonomous task statistics
 */
export function getStats() {
  const outcomes = getRecentOutcomes(100);
  const autonomousOutcomes = outcomes.filter(o => o.isAutonomous);

  return {
    ...autonomousStats,
    recentOutcomes: outcomes.length,
    recentAutonomousOutcomes: autonomousOutcomes.length,
    successRate: autonomousStats.totalCompleted > 0
      ? (autonomousStats.totalCompleted / (autonomousStats.totalCompleted + autonomousStats.totalFailed) * 100).toFixed(1) + '%'
      : 'N/A',
    stuckThresholdMinutes: STUCK_THRESHOLD_MS / 60000,
  };
}

/**
 * Clear last outcome (for testing)
 */
export function clearLastOutcome() {
  lastOutcome = null;
}

export default {
  isAutonomousTask,
  prioritizeTasks,
  recordOutcome,
  getLastOutcome,
  getRecentOutcomes,
  findStuckTasks,
  formatOutcomeForReflection,
  formatStuckTasksForReflection,
  buildCompletionNotification,
  trackTaskCreated,
  getStats,
  clearLastOutcome,
};
