// Main task loop - the heart of Forgekeeper v3
import { config } from '../config.js';
import { tasks, goals, learnings, approvals } from './memory.js';
import { execute, decomposeGoal, shouldContinue } from './claude.js';
import { requiresApproval } from './guardrails.js';
import { getSkill, listSkills } from '../skills/registry.js';

// Event emitter for UI notifications
const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(callback);
}

function emit(event, data) {
  const callbacks = listeners.get(event) || [];
  for (const cb of callbacks) {
    try {
      cb(data);
    } catch (e) {
      console.error(`Event listener error (${event}):`, e);
    }
  }
}

// State
let running = false;
let currentTask = null;
let loopInterval = null;

// Start the main loop
export function start() {
  if (running) return;
  running = true;
  console.log(`[Loop] Starting with ${config.loop.intervalMs}ms interval`);
  emit('loop:started', {});
  tick(); // Initial tick
  loopInterval = setInterval(tick, config.loop.intervalMs);
}

// Stop the loop
export function stop() {
  running = false;
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  console.log('[Loop] Stopped');
  emit('loop:stopped', {});
}

// Main tick - runs every interval
async function tick() {
  if (!running) return;
  if (currentTask) return; // Already working on something

  try {
    // 1. Check for pending approvals that might unblock tasks
    await checkApprovals();

    // 2. Check triggers (time-based, condition-based)
    await checkTriggers();

    // 3. Process next pending task
    await processNextTask();

  } catch (error) {
    console.error('[Loop] Tick error:', error);
    emit('loop:error', { error: error.message });
  }
}

// Check pending approvals
async function checkApprovals() {
  const pending = approvals.pending();
  // Just track them - UI will show them to user
  if (pending.length > 0) {
    emit('approvals:pending', { count: pending.length, approvals: pending });
  }
}

// Check and execute triggers
async function checkTriggers() {
  if (!config.triggers.enabled) return;

  const now = new Date();
  const activeGoals = goals.active();

  // Check for stale goals
  for (const goal of activeGoals) {
    const daysSinceUpdate = (now - new Date(goal.updated)) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > config.triggers.checkStaleGoalsDays) {
      emit('trigger:stale_goal', { goal });
    }
  }

  // Check for blocked tasks
  const allTasks = tasks.list({ status: 'blocked' });
  for (const task of allTasks) {
    const hoursSinceUpdate = (now - new Date(task.updated)) / (1000 * 60 * 60);
    if (hoursSinceUpdate > config.triggers.checkBlockedTasksHours) {
      emit('trigger:blocked_task', { task });
    }
  }
}

// Process the next pending task
async function processNextTask() {
  const pendingTasks = tasks.pending();
  if (pendingTasks.length === 0) return;

  // Sort by priority and creation date
  const sorted = pendingTasks.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aPriority = priorityOrder[a.priority] ?? 2;
    const bPriority = priorityOrder[b.priority] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(a.created) - new Date(b.created);
  });

  const task = sorted[0];

  // Check if task requires approval
  const approval = requiresApproval(task);
  if (approval.required && !task.approved) {
    const existing = approvals.pending().find(a => a.taskId === task.id);
    if (!existing) {
      approvals.request({
        type: 'task_execution',
        taskId: task.id,
        description: task.description,
        reason: approval.reason,
        level: approval.level,
      });
      emit('task:needs_approval', { task, reason: approval.reason });
    }
    return;
  }

  // Execute the task
  await executeTask(task);
}

// Execute a single task
async function executeTask(task) {
  currentTask = task;
  const startTime = Date.now();

  console.log(`[Loop] Executing task: ${task.id} - ${task.description}`);
  emit('task:started', { task });

  tasks.update(task.id, { status: 'active' });

  try {
    // Check if there's a specific skill for this task
    const skill = findMatchingSkill(task);

    let result;
    if (skill) {
      console.log(`[Loop] Using skill: ${skill.name}`);
      result = await skill.execute(task);
    } else {
      // Default: use Claude Code directly
      const goalContext = task.goal_id ? goals.get(task.goal_id) : null;
      result = await execute({ ...task, goal: goalContext });
    }

    const elapsed = Date.now() - startTime;

    // Record the attempt
    tasks.addAttempt(task.id, {
      success: result.success,
      elapsed,
      output: result.output?.slice(0, 1000), // Truncate for storage
      error: result.error,
    });

    if (result.success) {
      tasks.update(task.id, { status: 'completed' });
      emit('task:completed', { task, result, elapsed });

      // Record learning
      if (config.learning.enabled) {
        learnings.add({
          type: 'outcome',
          context: task.description,
          observation: `Task completed successfully in ${elapsed}ms`,
          confidence: 0.7,
          applies_to: task.tags || [],
        });
      }
    } else {
      // Check if we should retry
      if (task.attempts.length < 3) {
        tasks.update(task.id, { status: 'pending' }); // Will retry
        emit('task:retry', { task, result, attempt: task.attempts.length });
      } else {
        tasks.update(task.id, { status: 'failed' });
        emit('task:failed', { task, result });
      }
    }

  } catch (error) {
    console.error(`[Loop] Task execution error:`, error);
    tasks.update(task.id, { status: 'failed' });
    tasks.addAttempt(task.id, { success: false, error: error.message });
    emit('task:error', { task, error: error.message });
  } finally {
    currentTask = null;
  }
}

// Find a skill that matches the task
function findMatchingSkill(task) {
  const skills = listSkills();
  const text = task.description.toLowerCase();

  for (const skill of skills) {
    if (skill.triggers?.some(t => text.includes(t.toLowerCase()))) {
      return skill;
    }
  }
  return null;
}

// Manual task execution (from user command)
export async function runTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (currentTask) throw new Error(`Already executing task: ${currentTask.id}`);
  await executeTask(task);
  return task;
}

// Create and optionally execute a task immediately
export async function createAndRun(description, options = {}) {
  const task = tasks.create({
    description,
    origin: 'user',
    priority: options.priority || 'medium',
    tags: options.tags || [],
    ...options,
  });

  if (options.immediate) {
    await executeTask(task);
  }

  return task;
}

// Activate a goal and decompose into tasks
export async function activateGoal(goalId) {
  const goal = goals.get(goalId);
  if (!goal) throw new Error(`Goal not found: ${goalId}`);

  emit('goal:decomposing', { goal });

  // Use Claude to decompose
  const taskList = await decomposeGoal(goal);

  // Create tasks
  const createdTasks = [];
  for (const t of taskList) {
    const task = tasks.create({
      description: t.description,
      goal_id: goalId,
      origin: 'decomposition',
      estimated_complexity: t.estimated_complexity,
      dependencies: t.dependencies.map(i => createdTasks[i]?.id).filter(Boolean),
    });
    createdTasks.push(task);
    goals.addTask(goalId, task.id);
  }

  goals.update(goalId, { status: 'active' });
  emit('goal:activated', { goal, tasks: createdTasks });

  return { goal, tasks: createdTasks };
}

// Get current status
export function status() {
  return {
    running,
    currentTask,
    pendingTasks: tasks.pending().length,
    activeGoals: goals.active().length,
    pendingApprovals: approvals.pending().length,
  };
}

export default { start, stop, on, status, runTask, createAndRun, activateGoal };
