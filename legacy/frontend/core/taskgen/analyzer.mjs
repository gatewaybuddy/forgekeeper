/**
 * Base Analyzer Class
 *
 * All heuristic analyzers extend this class to provide consistent
 * interface for task generation from telemetry data.
 */

import { createTaskCard, calculatePriority } from './taskcard.mjs';

/**
 * Base Analyzer
 *
 * Subclasses must implement:
 * - analyze(context): Returns array of task cards or null
 */
export class BaseAnalyzer {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      minConfidence: 0.7,
      ...config,
    };
  }

  /**
   * Get analyzer name
   * @returns {string} Analyzer name
   */
  get name() {
    return this.constructor.name;
  }

  /**
   * Check if analyzer is enabled
   * @returns {boolean} Enabled status
   */
  isEnabled() {
    return this.config.enabled;
  }

  /**
   * Analyze telemetry data and generate task cards
   *
   * @param {Object} context - Analysis context
   * @param {Array} context.contextLog - ContextLog events
   * @param {Object} context.metrics - System metrics
   * @param {Object} context.timeWindow - Time window { from, to, durationMs }
   * @returns {Promise<Array<Object>|null>} Array of task cards or null
   */
  async analyze(context) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /**
   * Create a task card with automatic priority calculation
   *
   * @param {Object} params - Task card parameters
   * @returns {Object} Task card with calculated priority
   */
  createTask(params) {
    const taskCard = createTaskCard(params);

    // Calculate priority if not provided
    if (params.priority === undefined) {
      taskCard.priority = calculatePriority(taskCard);
    }

    // Add analyzer metadata
    taskCard.metadata = {
      ...taskCard.metadata,
      analyzer: this.name,
      analyzerConfig: this.config,
    };

    return taskCard;
  }

  /**
   * Filter context log events
   *
   * @param {Array} contextLog - ContextLog events
   * @param {Function} predicate - Filter function
   * @returns {Array} Filtered events
   */
  filterEvents(contextLog, predicate) {
    return contextLog.filter(predicate);
  }

  /**
   * Group events by field
   *
   * @param {Array} events - Events to group
   * @param {string} field - Field to group by
   * @returns {Object} Grouped events { value: [events] }
   */
  groupBy(events, field) {
    const grouped = {};
    for (const event of events) {
      const key = event[field];
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    }
    return grouped;
  }

  /**
   * Calculate ratio
   *
   * @param {number} numerator
   * @param {number} denominator
   * @returns {number} Ratio (0.0-1.0) or 0 if denominator is 0
   */
  ratio(numerator, denominator) {
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Format ratio as percentage string
   *
   * @param {number} numerator
   * @param {number} denominator
   * @param {number} decimals - Decimal places (default: 1)
   * @returns {string} Percentage string (e.g., "18.0%")
   */
  formatRatio(numerator, denominator, decimals = 1) {
    const r = this.ratio(numerator, denominator);
    return (r * 100).toFixed(decimals) + '%';
  }

  /**
   * Calculate percentile
   *
   * @param {Array<number>} values - Numeric values
   * @param {number} percentile - Percentile (0-100)
   * @returns {number|null} Percentile value or null if empty
   */
  percentile(values, percentile) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate average
   *
   * @param {Array<number>} values - Numeric values
   * @returns {number|null} Average or null if empty
   */
  average(values) {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Log analyzer activity
   *
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    const prefix = `[TGT:${this.name}]`;
    const logFn = console[level] || console.log;
    logFn(prefix, message, data);
  }
}

/**
 * Analyzer Registry
 *
 * Manages collection of analyzers
 */
export class AnalyzerRegistry {
  constructor() {
    this.analyzers = [];
  }

  /**
   * Register an analyzer
   *
   * @param {BaseAnalyzer} analyzer - Analyzer instance
   */
  register(analyzer) {
    if (!(analyzer instanceof BaseAnalyzer)) {
      throw new Error('Analyzer must extend BaseAnalyzer');
    }
    this.analyzers.push(analyzer);
    console.log(`[TGT] Registered analyzer: ${analyzer.name}`);
  }

  /**
   * Get all enabled analyzers
   *
   * @returns {Array<BaseAnalyzer>} Enabled analyzers
   */
  getEnabled() {
    return this.analyzers.filter(a => a.isEnabled());
  }

  /**
   * Run all enabled analyzers
   *
   * @param {Object} context - Analysis context
   * @returns {Promise<Array<Object>>} All generated task cards
   */
  async runAll(context) {
    const enabled = this.getEnabled();
    console.log(`[TGT] Running ${enabled.length} analyzers...`);

    const results = await Promise.allSettled(
      enabled.map(analyzer => analyzer.analyze(context))
    );

    const tasks = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const analyzer = enabled[i];

      if (result.status === 'fulfilled' && result.value) {
        const analyzerTasks = Array.isArray(result.value) ? result.value : [result.value];
        tasks.push(...analyzerTasks);
        console.log(`[TGT] ${analyzer.name}: Generated ${analyzerTasks.length} tasks`);
      } else if (result.status === 'rejected') {
        console.error(`[TGT] ${analyzer.name}: Error -`, result.reason);
      } else {
        console.log(`[TGT] ${analyzer.name}: No tasks generated`);
      }
    }

    return tasks;
  }
}

export default {
  BaseAnalyzer,
  AnalyzerRegistry,
};
