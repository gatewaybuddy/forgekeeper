/**
 * Performance Degradation Analyzer
 *
 * Detects performance degradation by comparing current latencies to historical baselines.
 * Triggers when p95 latency exceeds baseline by 50% or more.
 */

import { BaseAnalyzer } from '../analyzer.mjs';
import { TaskType, Severity } from '../taskcard.mjs';
import { filterEvents, calculatePercentile, calculateBaseline, getSamples } from '../contextlog-helpers.mjs';

export class PerformanceAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({
      threshold: 1.5,           // 1.5x baseline triggers task
      criticalThreshold: 2.0,   // 2.0x is critical
      minEvents: 20,            // Need at least 20 events to analyze
      baselineWindow: '7d',     // Compare to 7-day average
      percentile: 95,           // Use p95 latency
      ...config,
    });
  }

  async analyze(context) {
    const { contextLog, timeWindow } = context;
    const logDir = process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log';

    // Filter events with elapsed_ms field (latency data)
    const eventsWithLatency = filterEvents(contextLog, {}).filter(
      e => e.elapsed_ms !== undefined && e.elapsed_ms > 0
    );

    if (eventsWithLatency.length < this.config.minEvents) {
      this.log('info', `Only ${eventsWithLatency.length} events with latency (threshold: ${this.config.minEvents})`);
      return null;
    }

    // Calculate current p95 latency
    const currentP95 = calculatePercentile(eventsWithLatency, 'elapsed_ms', this.config.percentile);

    if (!currentP95) {
      this.log('warn', 'Could not calculate current p95 latency');
      return null;
    }

    // Get historical baseline
    let baseline;
    try {
      baseline = await calculateBaseline(logDir, 'avg_latency_ms', {
        window: this.config.baselineWindow,
      });
    } catch (err) {
      this.log('warn', 'Could not calculate baseline, using default', { error: err.message });
      baseline = 1500; // Default baseline: 1.5s
    }

    // Ensure baseline is not zero
    if (baseline === 0) baseline = 1000;

    // Calculate degradation ratio
    const ratio = currentP95 / baseline;

    // Check if ratio exceeds threshold
    if (ratio <= this.config.threshold) {
      this.log('info', `p95 latency ${currentP95}ms is ${ratio.toFixed(2)}x baseline (threshold: ${this.config.threshold}x)`);
      return null;
    }

    // Determine severity
    const severity = ratio >= this.config.criticalThreshold ? Severity.CRITICAL :
                     ratio >= this.config.threshold * 1.3 ? Severity.HIGH :
                     Severity.MEDIUM;

    // Get slowest events for evidence
    const sortedByLatency = [...eventsWithLatency].sort((a, b) => b.elapsed_ms - a.elapsed_ms);
    const slowestSamples = getSamples(sortedByLatency, 5);

    // Calculate additional statistics
    const avgLatency = this.average(eventsWithLatency, 'elapsed_ms');
    const p50 = calculatePercentile(eventsWithLatency, 'elapsed_ms', 50);
    const p99 = calculatePercentile(eventsWithLatency, 'elapsed_ms', 99);

    // Determine likely bottleneck
    const bottleneck = this.identifyBottleneck(sortedByLatency);

    // Determine affected files
    const affectedFiles = this.determineAffectedFiles(bottleneck);

    // Create task card
    return this.createTask({
      type: TaskType.PERFORMANCE_DEGRADATION,
      severity,
      title: `Investigate ${ratio.toFixed(1)}x performance degradation: p95 latency ${currentP95}ms`,
      description: `Performance has degraded significantly. Current p95 latency is ${currentP95}ms, which is ${ratio.toFixed(1)}x the 7-day baseline of ${baseline.toFixed(0)}ms. This affects user experience and may indicate resource constraints or inefficient code paths.`,
      evidence: {
        metric: 'p95_latency_ms',
        current: `${currentP95}ms`,
        baseline: `${baseline.toFixed(0)}ms`,
        ratio: `${ratio.toFixed(1)}x`,
        threshold: `${this.config.threshold}x`,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
        samples: slowestSamples,
        details: {
          avgLatency: `${avgLatency.toFixed(0)}ms`,
          p50: `${p50}ms`,
          p95: `${currentP95}ms`,
          p99: `${p99}ms`,
          totalEvents: eventsWithLatency.length,
          bottleneck: bottleneck.type,
          bottleneckCount: bottleneck.count,
        },
      },
      suggestedFix: {
        approach: 'investigate_and_optimize',
        files: affectedFiles,
        changes: [
          `Profile ${bottleneck.type} operations to identify bottlenecks`,
          'Check for database query inefficiencies or N+1 queries',
          'Review recent code changes for performance regressions',
          'Add caching for frequently accessed data',
          'Consider async operations or background processing',
          'Monitor resource usage (CPU, memory, I/O)',
        ],
        estimatedEffort: '1-2 hours',
      },
      acceptanceCriteria: [
        `p95 latency drops below ${(baseline * 1.2).toFixed(0)}ms (baseline + 20%)`,
        'Root cause identified and documented',
        'Performance optimization deployed and verified',
        'Monitoring in place to detect future degradation',
      ],
      confidence: Math.min(0.95, 0.6 + (ratio - this.config.threshold) * 0.15),
      metadata: {
        relatedEvents: sortedByLatency.slice(0, 10).map(e => e.id),
      },
    });
  }

  /**
   * Identify likely bottleneck from slow events
   *
   * @param {Array} sortedEvents - Events sorted by latency (descending)
   * @returns {Object} Bottleneck { type, count }
   */
  identifyBottleneck(sortedEvents) {
    // Take top 10% slowest events
    const topSlowest = sortedEvents.slice(0, Math.ceil(sortedEvents.length * 0.1));

    // Count by act type
    const counts = {};
    for (const event of topSlowest) {
      const type = event.act || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    }

    // Find most common
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);

    if (sorted.length > 0) {
      return { type: sorted[0][0], count: sorted[0][1] };
    }

    return { type: 'unknown', count: 0 };
  }

  /**
   * Determine affected files based on bottleneck
   *
   * @param {Object} bottleneck - Bottleneck info
   * @returns {Array<string>} Likely affected files
   */
  determineAffectedFiles(bottleneck) {
    const files = [];

    // Map bottleneck types to likely files
    if (bottleneck.type.includes('tool_call') || bottleneck.type.includes('tool')) {
      files.push('frontend/server.tools.mjs');
      files.push('frontend/server.orchestrator.mjs');
    }

    if (bottleneck.type.includes('assistant') || bottleneck.type.includes('llm')) {
      files.push('frontend/server.orchestrator.mjs');
      files.push('frontend/core/agent/autonomous.mjs');
    }

    if (bottleneck.type.includes('database') || bottleneck.type.includes('db')) {
      files.push('forgekeeper/memory/episodic.py');
      files.push('frontend/server.mjs');
    }

    if (bottleneck.type.includes('network') || bottleneck.type.includes('http')) {
      files.push('frontend/server.orchestrator.mjs');
      files.push('forgekeeper/llm/service.py');
    }

    // Generic fallback
    if (files.length === 0) {
      files.push('frontend/server.orchestrator.mjs');
      files.push('frontend/server.mjs');
    }

    return files;
  }
}

export default PerformanceAnalyzer;
