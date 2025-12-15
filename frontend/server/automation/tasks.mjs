/**
 * Task Generator API Endpoints
 *
 * Provides REST API for TGT (Telemetry-Driven Task Generator)
 */

import express from 'express';
import chokidar from 'chokidar';
import path from 'path';
import { AnalyzerRegistry } from '../../core/taskgen/analyzer.mjs';
import { loadContextLog } from '../../core/taskgen/contextlog-helpers.mjs';
import { filterTasks, sortTasksByPriority } from '../../core/taskgen/taskcard.mjs';
import {
  saveTask,
  loadTasks,
  getTask,
  dismissTask,
  approveTask,
  getTaskStats,
  cleanupOldTasks,
} from '../../core/taskgen/task-store.mjs';
import { getScheduler } from '../../core/taskgen/scheduler.mjs';
import { getAnalyticsDashboard } from '../../core/taskgen/task-analytics.mjs';
import { calculateFunnel } from '../../core/taskgen/task-lifecycle.mjs';
import { tryAutoApprove, getAutoApprovalStats } from '../../core/taskgen/auto-approval.mjs';
import {
  loadTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createTaskFromTemplate,
} from '../../core/taskgen/templates.mjs';
import {
  reprioritizeAllTasks,
  getPriorityDistribution,
  sortByPriorityScore,
} from '../../core/taskgen/prioritization.mjs';
import {
  addDependency,
  removeDependency,
  getDependencyStats,
  buildDependencyGraph,
  getBlockedTasks,
  isTaskReady,
} from '../../core/taskgen/dependencies.mjs';

// Import all analyzers
import ContinuationAnalyzer from '../../core/taskgen/analyzers/continuation.mjs';
import ErrorSpikeAnalyzer from '../../core/taskgen/analyzers/error-spike.mjs';
import DocsGapAnalyzer from '../../core/taskgen/analyzers/docs-gap.mjs';
import PerformanceAnalyzer from '../../core/taskgen/analyzers/performance.mjs';
import UXIssueAnalyzer from '../../core/taskgen/analyzers/ux-issue.mjs';

const router = express.Router();

// Environment configuration
const TASKGEN_ENABLED = process.env.TASKGEN_ENABLED === '1';
const TASKGEN_WINDOW_MIN = parseInt(process.env.TASKGEN_WINDOW_MIN || '60');
const TASKGEN_MIN_CONFIDENCE = parseFloat(process.env.TASKGEN_MIN_CONFIDENCE || '0.7');
const TASKGEN_MAX_TASKS = parseInt(process.env.TASKGEN_MAX_TASKS || '10');

// Analyzer registry (singleton)
let analyzerRegistry = null;

// SSE Client Manager (for event-driven push)
const sseClients = new Set();
let taskFileWatcher = null;
let lastTaskCount = 0;

/**
 * Broadcast task updates to all connected SSE clients
 */
async function broadcastTaskUpdate() {
  if (sseClients.size === 0) return;

  try {
    const rawTasks = await loadTasks({ status: 'generated', limit: 50 });

    // Calculate priority scores for all tasks
    const { calculateAllPriorityScores } = await import('./core/taskgen/prioritization.mjs');
    const tasks = calculateAllPriorityScores(rawTasks);

    const currentCount = tasks.length;
    const newTasksCount = currentCount - lastTaskCount;

    if (currentCount !== lastTaskCount) {
      const updateMessage = JSON.stringify({
        type: 'update',
        tasks,
        count: currentCount,
        newTasksCount: newTasksCount > 0 ? newTasksCount : 0,
        timestamp: Date.now()
      });

      const notificationMessage = newTasksCount > 0 ? JSON.stringify({
        type: 'notification',
        message: `${newTasksCount} new task${newTasksCount > 1 ? 's' : ''} generated`,
        severity: 'info',
        timestamp: Date.now()
      }) : null;

      // Broadcast to all clients
      sseClients.forEach(client => {
        try {
          client.write(`data: ${updateMessage}\n\n`);
          if (notificationMessage) {
            client.write(`data: ${notificationMessage}\n\n`);
          }
        } catch (err) {
          console.error('[TGT SSE] Error writing to client:', err);
          sseClients.delete(client);
        }
      });

      lastTaskCount = currentCount;
      console.log(`[TGT SSE] Broadcasted update to ${sseClients.size} client(s): ${newTasksCount} new task(s)`);
    }
  } catch (err) {
    console.error('[TGT SSE] Error broadcasting update:', err);
  }
}

/**
 * Initialize file watcher for task storage
 */
function initTaskFileWatcher() {
  if (taskFileWatcher) return; // Already initialized

  const taskStorageDir = '.forgekeeper/tasks';
  const taskFilePath = path.join(taskStorageDir, 'generated_tasks.jsonl');

  console.log(`[TGT] Initializing file watcher for ${taskFilePath}`);

  taskFileWatcher = chokidar.watch(taskFilePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  taskFileWatcher.on('change', () => {
    console.log('[TGT] Task file changed, broadcasting update...');
    broadcastTaskUpdate();
  });

  taskFileWatcher.on('add', () => {
    console.log('[TGT] Task file created, broadcasting update...');
    broadcastTaskUpdate();
  });

  taskFileWatcher.on('error', (err) => {
    console.error('[TGT] File watcher error:', err);
  });

  console.log('[TGT] File watcher initialized');
}

/**
 * Get or create analyzer registry
 */
function getAnalyzerRegistry() {
  if (!analyzerRegistry) {
    analyzerRegistry = new AnalyzerRegistry();

    // Register all analyzers with default config
    analyzerRegistry.register(new ContinuationAnalyzer({
      threshold: parseFloat(process.env.TASKGEN_CONTINUATION_THRESHOLD || '0.15'),
    }));

    analyzerRegistry.register(new ErrorSpikeAnalyzer({
      multiplier: parseFloat(process.env.TASKGEN_ERROR_SPIKE_MULTIPLIER || '3.0'),
    }));

    analyzerRegistry.register(new DocsGapAnalyzer({
      minUsageCount: parseInt(process.env.TASKGEN_DOCS_GAP_MIN_USAGE || '20'),
    }));

    analyzerRegistry.register(new PerformanceAnalyzer({
      threshold: parseFloat(process.env.TASKGEN_PERFORMANCE_THRESHOLD || '1.5'),
    }));

    analyzerRegistry.register(new UXIssueAnalyzer({
      abortThreshold: parseFloat(process.env.TASKGEN_UX_ABORT_THRESHOLD || '0.20'),
    }));
  }

  return analyzerRegistry;
}

/**
 * POST /api/tasks/suggest
 *
 * Run analyzers and return suggested tasks
 */
router.post('/suggest', async (req, res) => {
  if (!TASKGEN_ENABLED) {
    return res.status(403).json({
      error: 'Task generation is disabled',
      hint: 'Set TASKGEN_ENABLED=1 to enable',
    });
  }

  try {
    const {
      windowMinutes = TASKGEN_WINDOW_MIN,
      minConfidence = TASKGEN_MIN_CONFIDENCE,
      maxTasks = TASKGEN_MAX_TASKS,
    } = req.body;

    const logDir = process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log';
    const windowMs = windowMinutes * 60000;

    // Load ContextLog events
    const contextLog = await loadContextLog(logDir, { windowMs });

    if (contextLog.length === 0) {
      return res.json({
        tasks: [],
        message: 'No ContextLog events found in time window',
        windowMinutes,
        minConfidence,
      });
    }

    // Create analysis context
    const now = Date.now();
    const context = {
      contextLog,
      metrics: {}, // TODO: Load from /metrics endpoint
      timeWindow: {
        from: new Date(now - windowMs).toISOString(),
        to: new Date(now).toISOString(),
        durationMs: windowMs,
      },
    };

    // Run all analyzers
    const registry = getAnalyzerRegistry();
    const allTasks = await registry.runAll(context);

    // Filter and sort tasks
    const filteredTasks = filterTasks(allTasks, { minConfidence });
    const sortedTasks = sortTasksByPriority(filteredTasks);
    const limitedTasks = sortedTasks.slice(0, maxTasks);

    // Save tasks to storage and try auto-approval
    const autoApprovedTasks = [];
    for (const task of limitedTasks) {
      await saveTask(task);

      // Try auto-approval
      const autoApprovalResult = await tryAutoApprove(task, approveTask);
      if (autoApprovalResult.approved) {
        autoApprovedTasks.push({
          taskId: task.id,
          taskTitle: task.title,
          analyzer: task.analyzer,
          confidence: task.confidence,
        });
      }
    }

    // Return results
    res.json({
      tasks: limitedTasks,
      stats: {
        totalGenerated: allTasks.length,
        afterConfidenceFilter: filteredTasks.length,
        returned: limitedTasks.length,
        eventsAnalyzed: contextLog.length,
        autoApproved: autoApprovedTasks.length,
      },
      autoApproval: {
        approved: autoApprovedTasks,
        quota: getAutoApprovalStats(),
      },
      config: {
        windowMinutes,
        minConfidence,
        maxTasks,
      },
    });
  } catch (err) {
    console.error('[TGT API] Error in /suggest:', err);
    res.status(500).json({
      error: 'Failed to generate tasks',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks
 *
 * List all tasks with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      type,
      limit = 50,
    } = req.query;

    const rawTasks = await loadTasks({
      status,
      type,
      limit: parseInt(limit),
    });

    // Calculate priority scores for all tasks
    const { calculateAllPriorityScores } = await import('./core/taskgen/prioritization.mjs');
    const tasks = calculateAllPriorityScores(rawTasks);

    res.json({
      tasks,
      count: tasks.length,
    });
  } catch (err) {
    console.error('[TGT API] Error in GET /:', err);
    res.status(500).json({
      error: 'Failed to load tasks',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/stats
 *
 * Get task statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getTaskStats();

    res.json({
      stats,
      config: {
        enabled: TASKGEN_ENABLED,
        windowMinutes: TASKGEN_WINDOW_MIN,
        minConfidence: TASKGEN_MIN_CONFIDENCE,
        maxTasks: TASKGEN_MAX_TASKS,
      },
    });
  } catch (err) {
    console.error('[TGT API] Error in /stats:', err);
    res.status(500).json({
      error: 'Failed to get stats',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/analytics
 *
 * Get analytics dashboard data
 */
router.get('/analytics', async (req, res) => {
  try {
    const { daysBack = 7 } = req.query;

    const analytics = await getAnalyticsDashboard({
      daysBack: parseInt(daysBack),
    });

    res.json({
      analytics,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[TGT API] Error in /analytics:', err);
    res.status(500).json({
      error: 'Failed to get analytics',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/funnel
 *
 * Get task lifecycle funnel data
 */
router.get('/funnel', async (req, res) => {
  try {
    const { daysBack = 7 } = req.query;

    const funnel = await calculateFunnel({
      daysBack: parseInt(daysBack),
    });

    res.json({
      funnel,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[TGT API] Error in /funnel:', err);
    res.status(500).json({
      error: 'Failed to calculate funnel',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/:id
 *
 * Get a single task by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await getTask(id);

    if (!task) {
      return res.status(404).json({
        error: 'Task not found',
        taskId: id,
      });
    }

    res.json({ task });
  } catch (err) {
    console.error('[TGT API] Error in GET /:id:', err);
    res.status(500).json({
      error: 'Failed to get task',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/:id/dismiss
 *
 * Dismiss a task
 */
router.post('/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const dismissedTask = await dismissTask(id, reason);

    if (!dismissedTask) {
      return res.status(404).json({
        error: 'Task not found',
        taskId: id,
      });
    }

    res.json({
      task: dismissedTask,
      message: 'Task dismissed successfully',
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /:id/dismiss:', err);
    res.status(500).json({
      error: 'Failed to dismiss task',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/:id/approve
 *
 * Approve a task
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const approvedTask = await approveTask(id);

    if (!approvedTask) {
      return res.status(404).json({
        error: 'Task not found',
        taskId: id,
      });
    }

    res.json({
      task: approvedTask,
      message: 'Task approved successfully',
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /:id/approve:', err);
    res.status(500).json({
      error: 'Failed to approve task',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/cleanup
 *
 * Clean up old dismissed tasks
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;

    const removed = await cleanupOldTasks(daysOld);

    res.json({
      removed,
      message: `Cleaned up ${removed} old dismissed tasks`,
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /cleanup:', err);
    res.status(500).json({
      error: 'Failed to cleanup tasks',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/scheduler/stats
 *
 * Get scheduler statistics
 */
router.get('/scheduler/stats', async (req, res) => {
  try {
    const scheduler = getScheduler();
    const stats = scheduler.getStats();

    res.json({ stats });
  } catch (err) {
    console.error('[TGT API] Error in GET /scheduler/stats:', err);
    res.status(500).json({
      error: 'Failed to get scheduler stats',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/scheduler/run
 *
 * Manually trigger a scheduler run
 */
router.post('/scheduler/run', async (req, res) => {
  try {
    const scheduler = getScheduler();
    const result = await scheduler.runAnalysis();

    res.json({
      result,
      message: result.success
        ? `Analysis complete: ${result.tasksSaved || 0} tasks saved`
        : `Analysis failed: ${result.error || 'unknown error'}`,
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /scheduler/run:', err);
    res.status(500).json({
      error: 'Failed to run scheduler',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/templates
 *
 * List all task templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await loadTemplates();

    res.json({
      templates,
      count: templates.length,
    });
  } catch (err) {
    console.error('[TGT API] Error in GET /templates:', err);
    res.status(500).json({
      error: 'Failed to load templates',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/templates/:id
 *
 * Get a specific template by ID
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const template = await getTemplate(id);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        templateId: id,
      });
    }

    res.json({ template });
  } catch (err) {
    console.error('[TGT API] Error in GET /templates/:id:', err);
    res.status(500).json({
      error: 'Failed to get template',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/templates
 *
 * Create a new template
 */
router.post('/templates', async (req, res) => {
  try {
    const template = await createTemplate(req.body);

    res.status(201).json({
      template,
      message: 'Template created successfully',
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /templates:', err);
    res.status(500).json({
      error: 'Failed to create template',
      message: err.message,
    });
  }
});

/**
 * PUT /api/tasks/templates/:id
 *
 * Update an existing template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const template = await updateTemplate(id, req.body);

    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        templateId: id,
      });
    }

    res.json({
      template,
      message: 'Template updated successfully',
    });
  } catch (err) {
    console.error('[TGT API] Error in PUT /templates/:id:', err);
    res.status(400).json({
      error: 'Failed to update template',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/tasks/templates/:id
 *
 * Delete a template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await deleteTemplate(id);

    if (!deleted) {
      return res.status(404).json({
        error: 'Template not found',
        templateId: id,
      });
    }

    res.json({
      message: 'Template deleted successfully',
      templateId: id,
    });
  } catch (err) {
    console.error('[TGT API] Error in DELETE /templates/:id:', err);
    res.status(400).json({
      error: 'Failed to delete template',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/from-template/:id
 *
 * Create a task from a template
 */
router.post('/from-template/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {} } = req.body;

    // Create task from template
    const task = await createTaskFromTemplate(id, variables);

    // Save task to storage
    await saveTask(task);

    res.status(201).json({
      task,
      message: 'Task created from template successfully',
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /from-template/:id:', err);
    res.status(500).json({
      error: 'Failed to create task from template',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/batch/approve
 *
 * Bulk approve multiple tasks at once
 * Body: { taskIds: string[] }
 */
router.post('/batch/approve', async (req, res) => {
  try {
    const { taskIds } = req.body;

    // Validation
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'taskIds must be a non-empty array',
      });
    }

    // Limit batch size for safety
    if (taskIds.length > 100) {
      return res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 tasks can be approved at once',
      });
    }

    const results = {
      succeeded: [],
      failed: [],
      notFound: [],
    };

    // Process each task
    for (const taskId of taskIds) {
      try {
        const task = await getTask(taskId);

        if (!task) {
          results.notFound.push(taskId);
          continue;
        }

        // Approve the task
        const updated = await approveTask(taskId);
        if (updated) {
          results.succeeded.push({
            taskId,
            title: task.title,
          });
        } else {
          results.failed.push({
            taskId,
            reason: 'Update failed',
          });
        }
      } catch (err) {
        results.failed.push({
          taskId,
          reason: err.message,
        });
      }
    }

    console.log(`[TGT API] Batch approve: ${results.succeeded.length} succeeded, ${results.failed.length} failed, ${results.notFound.length} not found`);

    res.json({
      message: 'Batch approval completed',
      results,
      summary: {
        total: taskIds.length,
        succeeded: results.succeeded.length,
        failed: results.failed.length,
        notFound: results.notFound.length,
      },
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /batch/approve:', err);
    res.status(500).json({
      error: 'Batch approval failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/batch/dismiss
 *
 * Bulk dismiss multiple tasks at once
 * Body: { taskIds: string[], reason?: string }
 */
router.post('/batch/dismiss', async (req, res) => {
  try {
    const { taskIds, reason } = req.body;

    // Validation
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'taskIds must be a non-empty array',
      });
    }

    // Limit batch size for safety
    if (taskIds.length > 100) {
      return res.status(400).json({
        error: 'Batch too large',
        message: 'Maximum 100 tasks can be dismissed at once',
      });
    }

    const results = {
      succeeded: [],
      failed: [],
      notFound: [],
    };

    const dismissReason = reason || 'Batch dismissed';

    // Process each task
    for (const taskId of taskIds) {
      try {
        const task = await getTask(taskId);

        if (!task) {
          results.notFound.push(taskId);
          continue;
        }

        // Dismiss the task
        const updated = await dismissTask(taskId, dismissReason);
        if (updated) {
          results.succeeded.push({
            taskId,
            title: task.title,
          });
        } else {
          results.failed.push({
            taskId,
            reason: 'Update failed',
          });
        }
      } catch (err) {
        results.failed.push({
          taskId,
          reason: err.message,
        });
      }
    }

    console.log(`[TGT API] Batch dismiss: ${results.succeeded.length} succeeded, ${results.failed.length} failed, ${results.notFound.length} not found`);

    res.json({
      message: 'Batch dismissal completed',
      results,
      summary: {
        total: taskIds.length,
        succeeded: results.succeeded.length,
        failed: results.failed.length,
        notFound: results.notFound.length,
      },
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /batch/dismiss:', err);
    res.status(500).json({
      error: 'Batch dismissal failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/reprioritize
 *
 * Recalculate priority scores for all active tasks
 */
router.post('/reprioritize', async (req, res) => {
  try {
    const result = await reprioritizeAllTasks();

    console.log(`[TGT API] Reprioritized ${result.recalculated} tasks, ${result.significantChanges} significant changes`);

    res.json({
      message: 'Tasks reprioritized successfully',
      ...result,
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /reprioritize:', err);
    res.status(500).json({
      error: 'Reprioritization failed',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/priority/distribution
 *
 * Get priority distribution statistics
 */
router.get('/priority/distribution', async (req, res) => {
  try {
    const tasks = await loadTasks();
    const distribution = getPriorityDistribution(tasks);

    res.json(distribution);
  } catch (err) {
    console.error('[TGT API] Error in GET /priority/distribution:', err);
    res.status(500).json({
      error: 'Failed to get priority distribution',
      message: err.message,
    });
  }
});

/**
 * POST /api/tasks/:id/dependencies
 *
 * Add a dependency to a task
 */
router.post('/:id/dependencies', async (req, res) => {
  try {
    const { id } = req.params;
    const { dependsOnId } = req.body;

    if (!dependsOnId) {
      return res.status(400).json({
        error: 'Missing dependsOnId',
        message: 'Request body must include dependsOnId field',
      });
    }

    const updatedTask = await addDependency(id, dependsOnId);

    res.json({
      message: 'Dependency added successfully',
      task: updatedTask,
    });
  } catch (err) {
    console.error('[TGT API] Error in POST /:id/dependencies:', err);
    res.status(500).json({
      error: 'Failed to add dependency',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/tasks/:id/dependencies/:depId
 *
 * Remove a dependency from a task
 */
router.delete('/:id/dependencies/:depId', async (req, res) => {
  try {
    const { id, depId } = req.params;

    const updatedTask = await removeDependency(id, depId);

    res.json({
      message: 'Dependency removed successfully',
      task: updatedTask,
    });
  } catch (err) {
    console.error('[TGT API] Error in DELETE /:id/dependencies/:depId:', err);
    res.status(500).json({
      error: 'Failed to remove dependency',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/dependencies/graph
 *
 * Get dependency graph data for visualization
 */
router.get('/dependencies/graph', async (req, res) => {
  try {
    const tasks = await loadTasks();
    const graph = buildDependencyGraph(tasks);

    res.json(graph);
  } catch (err) {
    console.error('[TGT API] Error in GET /dependencies/graph:', err);
    res.status(500).json({
      error: 'Failed to build dependency graph',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/dependencies/stats
 *
 * Get dependency statistics
 */
router.get('/dependencies/stats', async (req, res) => {
  try {
    const tasks = await loadTasks();
    const stats = getDependencyStats(tasks);

    res.json(stats);
  } catch (err) {
    console.error('[TGT API] Error in GET /dependencies/stats:', err);
    res.status(500).json({
      error: 'Failed to get dependency stats',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/dependencies/blocked
 *
 * Get all blocked tasks
 */
router.get('/dependencies/blocked', async (req, res) => {
  try {
    const tasks = await loadTasks();
    const blockedTasks = getBlockedTasks(tasks);

    res.json({
      blockedTasks,
      count: blockedTasks.length,
    });
  } catch (err) {
    console.error('[TGT API] Error in GET /dependencies/blocked:', err);
    res.status(500).json({
      error: 'Failed to get blocked tasks',
      message: err.message,
    });
  }
});

/**
 * GET /api/tasks/stream
 *
 * Server-Sent Events stream for real-time task updates (event-driven)
 */
router.get('/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Initialize file watcher on first client connection
  initTaskFileWatcher();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  // Load and send initial tasks
  try {
    const initialTasks = await loadTasks({ status: 'generated', limit: 50 });
    res.write(`data: ${JSON.stringify({
      type: 'init',
      tasks: initialTasks,
      count: initialTasks.length,
      timestamp: Date.now()
    })}\n\n`);

    // Initialize lastTaskCount if this is the first client
    if (sseClients.size === 0) {
      lastTaskCount = initialTasks.length;
    }
  } catch (err) {
    console.error('[TGT SSE] Error loading initial tasks:', err);
  }

  // Add client to the set
  sseClients.add(res);
  console.log(`[TGT SSE] Client connected (${sseClients.size} total)`);

  // Heartbeat interval (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch (err) {
      console.error('[TGT SSE] Heartbeat error:', err);
      clearInterval(heartbeatInterval);
      sseClients.delete(res);
    }
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(res);
    console.log(`[TGT SSE] Client disconnected (${sseClients.size} remaining)`);
  });

  req.on('error', (err) => {
    clearInterval(heartbeatInterval);
    sseClients.delete(res);
    console.error('[TGT SSE] Connection error:', err);
  });
});

export default router;
