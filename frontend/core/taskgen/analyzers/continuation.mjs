/**
 * Continuation Analyzer
 *
 * Detects when LLM responses are frequently incomplete (finish_reason='length'
 * or continuation triggered) and suggests increasing max_tokens.
 */

import { BaseAnalyzer } from '../analyzer.mjs';
import { TaskType, Severity } from '../taskcard.mjs';
import { getAssistantResponses, getSamples } from '../contextlog-helpers.mjs';

export class ContinuationAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({
      threshold: 0.15, // 15% continuation rate triggers task
      ...config,
    });
  }

  async analyze(context) {
    const { contextLog } = context;

    // Get all assistant responses
    const responses = getAssistantResponses(contextLog);

    if (responses.length === 0) {
      this.log('info', 'No assistant responses found in time window');
      return null;
    }

    // Count continuations
    const continuations = responses.filter(
      r => r.continuation || r.finishReason === 'length'
    );

    const ratio = continuations.length / responses.length;

    // Check if ratio exceeds threshold
    if (ratio <= this.config.threshold) {
      this.log('info', `Continuation ratio ${this.formatRatio(continuations.length, responses.length)} below threshold`);
      return null;
    }

    // Determine severity
    const severity = ratio > 0.30 ? Severity.CRITICAL :
                     ratio > 0.20 ? Severity.HIGH :
                     Severity.MEDIUM;

    // Get current max_tokens (from env or default)
    const currentMaxTokens = process.env.FRONTEND_MAX_TOKENS || 8192;
    const suggestedMaxTokens = parseInt(currentMaxTokens) * 2;

    // Get samples for evidence
    const samples = getSamples(continuations, 3);

    // Create task card
    return this.createTask({
      type: TaskType.CONTINUATION_ISSUE,
      severity,
      title: `Reduce continuation rate from ${this.formatRatio(continuations.length, responses.length)} to <10%`,
      description: `${continuations.length} of ${responses.length} assistant responses triggered continuations in the last ${context.timeWindow.durationMs / 60000} minutes. This indicates responses are being truncated before completion.`,
      evidence: {
        metric: 'continuation_ratio',
        current: this.formatRatio(continuations.length, responses.length),
        threshold: this.formatRatio(this.config.threshold, 1),
        baseline: '7.2%', // TODO: Calculate from historical data
        timeWindow: `${context.timeWindow.durationMs / 60000} minutes`,
        samples: samples.map(s => ({
          timestamp: s.ts,
          finishReason: s.preview,
        })),
        details: {
          totalResponses: responses.length,
          continuations: continuations.length,
          mostCommon: this.getMostCommonPattern(continuations),
        },
      },
      suggestedFix: {
        approach: 'increase_max_tokens',
        files: ['.env'],
        changes: [
          `FRONTEND_MAX_TOKENS=${suggestedMaxTokens} (currently ${currentMaxTokens})`,
          'Monitor latency impact (expect +0.5-1.0s avg)',
          'Rollback if p95 latency exceeds 8s',
        ],
        estimatedEffort: '10 minutes',
      },
      acceptanceCriteria: [
        'Continuation ratio drops below 10% over 24h window',
        'p95 latency remains < 5s',
        'Zero user complaints about truncated responses',
      ],
      confidence: Math.min(0.95, 0.7 + (ratio - this.config.threshold) * 2),
    });
  }

  /**
   * Get most common pattern in continuations
   *
   * @param {Array} continuations - Continuation events
   * @returns {string} Most common pattern
   */
  getMostCommonPattern(continuations) {
    // Group by conversation context if available
    const patterns = {};

    for (const cont of continuations) {
      // Try to extract context from metadata
      const context = cont.metadata?.context || 'unknown';
      patterns[context] = (patterns[context] || 0) + 1;
    }

    // Find most common
    const sorted = Object.entries(patterns).sort(([, a], [, b]) => b - a);
    if (sorted.length > 0) {
      return `${sorted[0][0]} (${sorted[0][1]} occurrences)`;
    }

    return 'code generation tasks';
  }
}

export default ContinuationAnalyzer;
