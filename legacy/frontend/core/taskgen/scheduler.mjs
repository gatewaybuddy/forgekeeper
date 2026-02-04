/**
 * Task Generation Scheduler
 *
 * Runs TGT analyzers on a schedule to proactively generate tasks
 */

import { loadContextLog } from './contextlog-helpers.mjs';
import { AnalyzerRegistry } from './analyzer.mjs';
import { filterTasks, sortTasksByPriority } from './taskcard.mjs';
import { saveTask, loadTasks } from './task-store.mjs';

// Import all analyzers
import ContinuationAnalyzer from './analyzers/continuation.mjs';
import ErrorSpikeAnalyzer from './analyzers/error-spike.mjs';
import DocsGapAnalyzer from './analyzers/docs-gap.mjs';
import PerformanceAnalyzer from './analyzers/performance.mjs';
import UXIssueAnalyzer from './analyzers/ux-issue.mjs';

// Singleton scheduler instance
let schedulerInstance = null;

/**
 * Task Generation Scheduler
 */
export class TaskScheduler {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled ?? (process.env.TASKGEN_ENABLED === '1'),
      intervalMinutes: parseInt(config.intervalMinutes || process.env.TASKGEN_INTERVAL_MIN || '15', 10),
      windowMinutes: parseInt(config.windowMinutes || process.env.TASKGEN_WINDOW_MIN || '60', 10),
      minConfidence: parseFloat(config.minConfidence || process.env.TASKGEN_MIN_CONFIDENCE || '0.7'),
      maxTasks: parseInt(config.maxTasks || process.env.TASKGEN_MAX_TASKS || '10', 10),
      maxTasksPerHour: parseInt(config.maxTasksPerHour || process.env.TASKGEN_MAX_PER_HOUR || '10', 10),
      logDir: config.logDir || process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log',
    };

    this.intervalHandle = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.stats = {
      totalRuns: 0,
      totalTasksGenerated: 0,
      totalTasksSaved: 0,
      lastRunDuration: 0,
      errors: 0,
    };

    // Rate limiting (tasks per hour)
    this.taskTimestamps = [];

    // Analyzer registry
    this.registry = new AnalyzerRegistry();
    this._initializeAnalyzers();
  }

  /**
   * Initialize analyzer registry
   * @private
   */
  _initializeAnalyzers() {
    this.registry.register(new ContinuationAnalyzer({
      threshold: parseFloat(process.env.TASKGEN_CONTINUATION_THRESHOLD || '0.15'),
    }));

    this.registry.register(new ErrorSpikeAnalyzer({
      multiplier: parseFloat(process.env.TASKGEN_ERROR_SPIKE_MULTIPLIER || '3.0'),
    }));

    this.registry.register(new DocsGapAnalyzer({
      minUsageCount: parseInt(process.env.TASKGEN_DOCS_GAP_MIN_USAGE || '20', 10),
    }));

    this.registry.register(new PerformanceAnalyzer({
      threshold: parseFloat(process.env.TASKGEN_PERFORMANCE_THRESHOLD || '1.5'),
    }));

    this.registry.register(new UXIssueAnalyzer({
      abortThreshold: parseFloat(process.env.TASKGEN_UX_ABORT_THRESHOLD || '0.20'),
    }));
  }

  /**
   * Check if we're under rate limit
   * @private
   */
  _checkRateLimit() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Clean old timestamps
    this.taskTimestamps = this.taskTimestamps.filter(ts => ts > oneHourAgo);

    return this.taskTimestamps.length < this.config.maxTasksPerHour;
  }

  /**
   * Record task generation for rate limiting
   * @private
   */
  _recordTaskGeneration(count) {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      this.taskTimestamps.push(now);
    }
  }

  /**
   * Run task generation cycle
   */
  async runAnalysis() {
    if (this.isRunning) {
      console.log('[TGT Scheduler] Analysis already running, skipping...');
      return { skipped: true, reason: 'already_running' };
    }

    if (!this.config.enabled) {
      return { skipped: true, reason: 'disabled' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[TGT Scheduler] Starting scheduled analysis...');

      // Load ContextLog events
      const windowMs = this.config.windowMinutes * 60000;
      const contextLog = await loadContextLog(this.config.logDir, { windowMs });

      if (contextLog.length === 0) {
        console.log('[TGT Scheduler] No ContextLog events in window, skipping');
        return {
          skipped: true,
          reason: 'no_events',
          windowMinutes: this.config.windowMinutes,
        };
      }

      // Create analysis context
      const now = Date.now();
      const context = {
        contextLog,
        metrics: {},
        timeWindow: {
          from: new Date(now - windowMs).toISOString(),
          to: new Date(now).toISOString(),
          durationMs: windowMs,
        },
      };

      // Run all analyzers
      const allTasks = await this.registry.runAll(context);

      // Filter and sort tasks
      const filteredTasks = filterTasks(allTasks, { minConfidence: this.config.minConfidence });
      const sortedTasks = sortTasksByPriority(filteredTasks);

      // Apply rate limit
      if (!this._checkRateLimit()) {
        console.log('[TGT Scheduler] Rate limit exceeded, skipping task save');
        this.stats.totalRuns++;
        this.lastRunAt = new Date();
        return {
          success: true,
          rateLimited: true,
          tasksGenerated: allTasks.length,
          tasksFiltered: filteredTasks.length,
          tasksSaved: 0,
          eventsAnalyzed: contextLog.length,
        };
      }

      // Calculate how many tasks we can save
      const remainingQuota = this.config.maxTasksPerHour - this.taskTimestamps.length;
      const tasksToSave = Math.min(
        sortedTasks.length,
        this.config.maxTasks,
        remainingQuota
      );

      const limitedTasks = sortedTasks.slice(0, tasksToSave);

      // Check for duplicates before saving
      const existingTasks = await loadTasks({ status: 'generated' });
      const existingTitles = new Set(existingTasks.map(t => t.title));

      let savedCount = 0;
      for (const task of limitedTasks) {
        // Skip if we already have a task with this title
        if (existingTitles.has(task.title)) {
          console.log(`[TGT Scheduler] Skipping duplicate task: ${task.title}`);
          continue;
        }

        await saveTask(task);
        savedCount++;
      }

      // Record for rate limiting
      this._recordTaskGeneration(savedCount);

      // Update stats
      this.stats.totalRuns++;
      this.stats.totalTasksGenerated += allTasks.length;
      this.stats.totalTasksSaved += savedCount;
      this.stats.lastRunDuration = Date.now() - startTime;
      this.lastRunAt = new Date();

      console.log(`[TGT Scheduler] Analysis complete: ${savedCount} tasks saved (${allTasks.length} generated, ${filteredTasks.length} filtered)`);

      return {
        success: true,
        tasksGenerated: allTasks.length,
        tasksFiltered: filteredTasks.length,
        tasksSaved: savedCount,
        tasksSkipped: limitedTasks.length - savedCount,
        eventsAnalyzed: contextLog.length,
        duration: this.stats.lastRunDuration,
      };
    } catch (err) {
      console.error('[TGT Scheduler] Error in scheduled analysis:', err);
      this.stats.errors++;
      return {
        success: false,
        error: err.message,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.intervalHandle) {
      console.log('[TGT Scheduler] Already started');
      return;
    }

    if (!this.config.enabled) {
      console.log('[TGT Scheduler] Disabled via config');
      return;
    }

    const intervalMs = this.config.intervalMinutes * 60000;

    console.log(`[TGT Scheduler] Starting scheduler (interval: ${this.config.intervalMinutes} minutes)`);

    // Run immediately on start
    this.runAnalysis().catch(err => {
      console.error('[TGT Scheduler] Error in initial run:', err);
    });

    // Schedule recurring runs
    this.intervalHandle = setInterval(() => {
      this.runAnalysis().catch(err => {
        console.error('[TGT Scheduler] Error in scheduled run:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[TGT Scheduler] Stopped');
    }
  }

  /**
   * Get scheduler stats
   */
  getStats() {
    return {
      ...this.stats,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      isRunning: this.isRunning,
      config: {
        enabled: this.config.enabled,
        intervalMinutes: this.config.intervalMinutes,
        windowMinutes: this.config.windowMinutes,
        minConfidence: this.config.minConfidence,
        maxTasks: this.config.maxTasks,
        maxTasksPerHour: this.config.maxTasksPerHour,
      },
      rateLimit: {
        tasksInLastHour: this.taskTimestamps.length,
        remainingQuota: this.config.maxTasksPerHour - this.taskTimestamps.length,
      },
    };
  }
}

/**
 * Get singleton scheduler instance
 */
export function getScheduler(config = {}) {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler(config);
  }
  return schedulerInstance;
}

/**
 * Initialize and start scheduler (called from server.mjs)
 */
export function initScheduler(config = {}) {
  const scheduler = getScheduler(config);
  scheduler.start();
  return scheduler;
}

export default {
  TaskScheduler,
  getScheduler,
  initScheduler,
};
