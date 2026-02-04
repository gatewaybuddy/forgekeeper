/**
 * Error Spike Analyzer
 *
 * Detects sudden increases in tool or upstream errors compared to baseline.
 * Triggers when error count exceeds baseline by 3x or more.
 */

import { BaseAnalyzer } from '../analyzer.mjs';
import { TaskType, Severity } from '../taskcard.mjs';
import { getErrors, groupBy, getSamples, calculateBaseline } from '../contextlog-helpers.mjs';

export class ErrorSpikeAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({
      multiplier: 3.0, // 3x baseline triggers task
      criticalMultiplier: 5.0, // 5x baseline is critical
      minErrors: 5, // Need at least 5 errors to trigger
      baselineWindow: '7d', // Compare to 7-day average
      ...config,
    });
  }

  async analyze(context) {
    const { contextLog, timeWindow } = context;
    const logDir = process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log';

    // Get all errors in current window
    const errors = getErrors(contextLog);

    if (errors.length < this.config.minErrors) {
      this.log('info', `Only ${errors.length} errors (threshold: ${this.config.minErrors})`);
      return null;
    }

    // Calculate current error rate (errors per hour)
    const hours = timeWindow.durationMs / 3600000;
    const currentRate = errors.length / hours;

    // Get historical baseline
    let baseline;
    try {
      baseline = await calculateBaseline(logDir, 'errors_per_hour', {
        window: this.config.baselineWindow,
      });
    } catch (err) {
      this.log('warn', 'Could not calculate baseline, using default', { error: err.message });
      baseline = 10; // Default baseline
    }

    // Ensure baseline is not zero
    if (baseline === 0) baseline = 5;

    // Calculate multiplier
    const multiplier = currentRate / baseline;

    // Check if multiplier exceeds threshold
    if (multiplier <= this.config.multiplier) {
      this.log('info', `Error rate ${currentRate.toFixed(1)}/hr is ${multiplier.toFixed(1)}x baseline (threshold: ${this.config.multiplier}x)`);
      return null;
    }

    // Determine severity
    const severity = multiplier >= this.config.criticalMultiplier ? Severity.CRITICAL :
                     multiplier >= this.config.multiplier * 1.5 ? Severity.HIGH :
                     Severity.MEDIUM;

    // Group errors by type/name to find most common
    const errorsByName = groupBy(errors, 'name');
    const topError = this.getTopError(errorsByName);

    // Get sample errors
    const samples = getSamples(errors.filter(e => e.name === topError.name), 3);

    // Determine likely files affected
    const affectedFiles = this.determineAffectedFiles(topError.name, samples);

    // Create task card
    return this.createTask({
      type: TaskType.ERROR_SPIKE,
      severity,
      title: `Investigate ${multiplier.toFixed(1)}x error spike: '${topError.name}' failures`,
      description: `${errors.length} errors detected in the last ${Math.round(timeWindow.durationMs / 60000)} minutes (baseline: ${baseline.toFixed(1)}/hour). The error rate has increased ${multiplier.toFixed(1)}x, primarily due to '${topError.name}' errors.`,
      evidence: {
        metric: 'errors_per_hour',
        current: `${errors.length} errors`,
        baseline: `${baseline.toFixed(1)}/hour`,
        ratio: `${multiplier.toFixed(1)}x`,
        threshold: `${this.config.multiplier}x`,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
        samples: samples.map(s => ({
          timestamp: s.ts,
          error: s.name,
          preview: s.preview,
        })),
        details: {
          topError: topError.name,
          topErrorCount: topError.count,
          totalErrors: errors.length,
          errorTypes: Object.keys(errorsByName).length,
        },
      },
      suggestedFix: {
        approach: 'investigate_and_mitigate',
        files: affectedFiles,
        changes: [
          'Check recent changes to affected components',
          'Add error handling or validation',
          'Improve error messages with actionable guidance',
          'Add retry logic if transient',
          'Monitor error rate after fix',
        ],
        estimatedEffort: '30-60 minutes',
      },
      acceptanceCriteria: [
        `${topError.name} error rate drops below ${(baseline * 1.2).toFixed(1)}/hour (baseline + 20%)`,
        'Root cause identified and documented in ContextLog',
        'Mitigation deployed or follow-up task created',
      ],
      confidence: Math.min(0.95, 0.65 + (multiplier - this.config.multiplier) * 0.1),
      metadata: {
        relatedEvents: errors.slice(0, 10).map(e => e.id),
      },
    });
  }

  /**
   * Get top error by frequency
   *
   * @param {Object} errorsByName - Errors grouped by name
   * @returns {Object} Top error { name, count }
   */
  getTopError(errorsByName) {
    const sorted = Object.entries(errorsByName)
      .map(([name, errors]) => ({ name, count: errors.length }))
      .sort((a, b) => b.count - a.count);

    return sorted.length > 0 ? sorted[0] : { name: 'unknown', count: 0 };
  }

  /**
   * Determine affected files based on error type
   *
   * @param {string} errorName - Error name/type
   * @param {Array} samples - Sample error events
   * @returns {Array<string>} Likely affected files
   */
  determineAffectedFiles(errorName, samples) {
    const files = [];

    // Tool errors -> check tool implementation
    if (errorName.includes('_file') || errorName.includes('_dir')) {
      files.push('frontend/tools/filesystem.mjs');
      files.push('frontend/server.tools.mjs');
    }

    if (errorName.includes('bash') || errorName.includes('shell')) {
      files.push('frontend/tools/shell.mjs');
      files.push('frontend/server.tools.mjs');
    }

    if (errorName.includes('http') || errorName.includes('fetch')) {
      files.push('frontend/server.orchestrator.mjs');
      files.push('frontend/core/agent/autonomous.mjs');
    }

    // API errors -> check server
    if (errorName.includes('api') || errorName.includes('endpoint')) {
      files.push('frontend/server.mjs');
    }

    // Generic fallback
    if (files.length === 0) {
      files.push('frontend/server.mjs');
      files.push('frontend/server.orchestrator.mjs');
    }

    return files;
  }
}

export default ErrorSpikeAnalyzer;
