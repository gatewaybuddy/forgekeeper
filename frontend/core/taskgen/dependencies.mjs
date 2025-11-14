/**
 * Task Dependency Graph Module
 *
 * Manages task dependencies and relationships:
 * - Add/remove dependencies between tasks
 * - Circular dependency detection
 * - Get blocked/blocking tasks
 * - Topological sorting for execution order
 */

import { loadTasks, saveTask } from './task-store.mjs';

/**
 * Add a dependency: taskId depends on dependsOnId
 *
 * @param {string} taskId - Task that depends on another
 * @param {string} dependsOnId - Task that must be completed first
 * @returns {Promise<Object>} Updated task with dependency
 */
export async function addDependency(taskId, dependsOnId) {
  const tasks = await loadTasks();

  const task = tasks.find(t => t.id === taskId);
  const dependsOnTask = tasks.find(t => t.id === dependsOnId);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (!dependsOnTask) {
    throw new Error(`Dependency task ${dependsOnId} not found`);
  }

  // Cannot depend on self
  if (taskId === dependsOnId) {
    throw new Error('Task cannot depend on itself');
  }

  // Initialize dependencies array if needed
  if (!task.dependencies) {
    task.dependencies = [];
  }

  // Check if dependency already exists
  if (task.dependencies.includes(dependsOnId)) {
    return task;
  }

  // Check for circular dependencies
  const wouldCreateCycle = detectCircularDependency(tasks, taskId, dependsOnId);
  if (wouldCreateCycle) {
    throw new Error('Adding this dependency would create a circular dependency');
  }

  // Add dependency
  task.dependencies.push(dependsOnId);
  task.updatedAt = new Date().toISOString();

  await saveTask(task);

  return task;
}

/**
 * Remove a dependency
 *
 * @param {string} taskId - Task to remove dependency from
 * @param {string} dependsOnId - Dependency to remove
 * @returns {Promise<Object>} Updated task
 */
export async function removeDependency(taskId, dependsOnId) {
  const tasks = await loadTasks();
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (!task.dependencies) {
    return task;
  }

  task.dependencies = task.dependencies.filter(id => id !== dependsOnId);
  task.updatedAt = new Date().toISOString();

  await saveTask(task);

  return task;
}

/**
 * Detect if adding a dependency would create a circular dependency
 *
 * Uses DFS to check if there's already a path from dependsOnId to taskId
 *
 * @param {Array} tasks - All tasks
 * @param {string} taskId - Task that would depend on dependsOnId
 * @param {string} dependsOnId - Task to check
 * @returns {boolean} True if adding dependency would create cycle
 */
function detectCircularDependency(tasks, taskId, dependsOnId) {
  const visited = new Set();

  function hasCycleDFS(currentId, targetId) {
    if (currentId === targetId) {
      return true;
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);

    const currentTask = tasks.find(t => t.id === currentId);
    if (!currentTask || !currentTask.dependencies) {
      return false;
    }

    for (const depId of currentTask.dependencies) {
      if (hasCycleDFS(depId, targetId)) {
        return true;
      }
    }

    return false;
  }

  // Check if there's a path from dependsOnId back to taskId
  return hasCycleDFS(dependsOnId, taskId);
}

/**
 * Get all tasks that are blocked by incomplete dependencies
 *
 * @param {Array} tasks - All tasks
 * @returns {Array} Tasks that are blocked
 */
export function getBlockedTasks(tasks) {
  return tasks.filter(task => {
    if (!task.dependencies || task.dependencies.length === 0) {
      return false;
    }

    // Task is blocked if it has any incomplete dependencies
    return task.dependencies.some(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && depTask.status !== 'completed';
    });
  });
}

/**
 * Get tasks that a specific task depends on (direct dependencies)
 *
 * @param {string} taskId - Task ID
 * @param {Array} tasks - All tasks
 * @returns {Array} Tasks that taskId depends on
 */
export function getDependencies(taskId, tasks) {
  const task = tasks.find(t => t.id === taskId);

  if (!task || !task.dependencies) {
    return [];
  }

  return task.dependencies
    .map(depId => tasks.find(t => t.id === depId))
    .filter(Boolean);
}

/**
 * Get tasks that depend on a specific task (reverse dependencies)
 *
 * @param {string} taskId - Task ID
 * @param {Array} tasks - All tasks
 * @returns {Array} Tasks that depend on taskId
 */
export function getDependents(taskId, tasks) {
  return tasks.filter(task =>
    task.dependencies && task.dependencies.includes(taskId)
  );
}

/**
 * Check if a task is ready to be worked on (all dependencies completed)
 *
 * @param {string} taskId - Task ID
 * @param {Array} tasks - All tasks
 * @returns {boolean} True if task is ready
 */
export function isTaskReady(taskId, tasks) {
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    return false;
  }

  if (!task.dependencies || task.dependencies.length === 0) {
    return true;
  }

  // All dependencies must be completed
  return task.dependencies.every(depId => {
    const depTask = tasks.find(t => t.id === depId);
    return depTask && depTask.status === 'completed';
  });
}

/**
 * Get dependency chain for a task (all transitive dependencies)
 *
 * @param {string} taskId - Task ID
 * @param {Array} tasks - All tasks
 * @returns {Array} All tasks in dependency chain
 */
export function getDependencyChain(taskId, tasks) {
  const chain = [];
  const visited = new Set();

  function traverseDFS(currentId) {
    if (visited.has(currentId)) {
      return;
    }

    visited.add(currentId);

    const task = tasks.find(t => t.id === currentId);
    if (!task) {
      return;
    }

    chain.push(task);

    if (task.dependencies) {
      for (const depId of task.dependencies) {
        traverseDFS(depId);
      }
    }
  }

  traverseDFS(taskId);

  // Remove the task itself from the chain
  return chain.filter(t => t.id !== taskId);
}

/**
 * Topological sort of tasks (execution order respecting dependencies)
 *
 * @param {Array} tasks - All tasks
 * @returns {Array} Tasks sorted in execution order, or null if cycle detected
 */
export function topologicalSort(tasks) {
  const sorted = [];
  const visited = new Set();
  const tempMarked = new Set();

  function visit(taskId) {
    if (tempMarked.has(taskId)) {
      // Cycle detected
      return false;
    }

    if (visited.has(taskId)) {
      return true;
    }

    tempMarked.add(taskId);

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return true;
    }

    if (task.dependencies) {
      for (const depId of task.dependencies) {
        if (!visit(depId)) {
          return false;
        }
      }
    }

    tempMarked.delete(taskId);
    visited.add(taskId);
    sorted.push(task);

    return true;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (!visit(task.id)) {
        return null; // Cycle detected
      }
    }
  }

  return sorted;
}

/**
 * Build dependency graph data structure for visualization (OPTIMIZED)
 *
 * Pre-calculates ready status for all tasks to avoid redundant checks
 *
 * @param {Array} tasks - All tasks
 * @returns {Object} Graph data with nodes and edges
 */
export function buildDependencyGraph(tasks) {
  // Pre-calculate ready status for all tasks (O(n) instead of O(n²))
  const readyStatusMap = new Map();
  for (const task of tasks) {
    readyStatusMap.set(task.id, isTaskReady(task.id, tasks));
  }

  const nodes = tasks.map(task => ({
    id: task.id,
    label: task.title,
    status: task.status,
    severity: task.severity,
    blocked: !readyStatusMap.get(task.id) && task.status !== 'completed',
  }));

  const edges = [];

  for (const task of tasks) {
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        edges.push({
          from: depId,
          to: task.id,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Get dependency statistics (OPTIMIZED)
 *
 * Avoids redundant isTaskReady() calls by reusing blocked tasks calculation
 *
 * @param {Array} tasks - All tasks
 * @returns {Object} Dependency stats
 */
export function getDependencyStats(tasks) {
  const blockedTasks = getBlockedTasks(tasks);
  const tasksWithDeps = tasks.filter(t => t.dependencies && t.dependencies.length > 0);

  const sorted = topologicalSort(tasks);
  const hasCycles = sorted === null;

  // Calculate ready tasks efficiently: tasks with deps that aren't blocked and aren't completed
  const blockedTaskIds = new Set(blockedTasks.map(t => t.id));
  const readyTasks = tasksWithDeps.filter(
    t => !blockedTaskIds.has(t.id) && t.status !== 'completed'
  ).length;

  return {
    totalTasks: tasks.length,
    tasksWithDependencies: tasksWithDeps.length,
    blockedTasks: blockedTasks.length,
    readyTasks,
    hasCycles,
  };
}

export default {
  addDependency,
  removeDependency,
  getBlockedTasks,
  getDependencies,
  getDependents,
  isTaskReady,
  getDependencyChain,
  topologicalSort,
  buildDependencyGraph,
  getDependencyStats,
};
