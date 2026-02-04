/**
 * UX Issue Analyzer
 *
 * Detects user experience issues based on:
 * - Frequent conversation aborts (incomplete sessions)
 * - Repeated similar queries (user frustration)
 * - High error rates affecting user workflows
 * - Long response times causing user abandonment
 */

import { BaseAnalyzer } from '../analyzer.mjs';
import { TaskType, Severity } from '../taskcard.mjs';
import { filterEvents, groupBy, getSamples } from '../contextlog-helpers.mjs';

export class UXIssueAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({
      abortThreshold: 0.20,      // 20% abort rate is concerning
      criticalAbortRate: 0.35,   // 35% is critical
      minConversations: 10,      // Need at least 10 conversations
      longWaitThreshold: 8000,   // 8+ seconds is a long wait
      ...config,
    });
  }

  async analyze(context) {
    const { contextLog, timeWindow } = context;

    // Group events by conversation ID
    const byConversation = groupBy(contextLog, 'conv_id');
    const conversations = Object.entries(byConversation);

    if (conversations.length < this.config.minConversations) {
      this.log('info', `Only ${conversations.length} conversations (threshold: ${this.config.minConversations})`);
      return null;
    }

    // Analyze conversation patterns
    const analysis = this.analyzeConversations(conversations);

    // Check for high abort rate
    if (analysis.abortRate > this.config.abortThreshold) {
      return this.createAbortTask(analysis, timeWindow);
    }

    // Check for long wait times
    if (analysis.longWaits > 0 && analysis.longWaitRate > 0.15) {
      return this.createWaitTimeTask(analysis, timeWindow);
    }

    // Check for error-heavy conversations
    if (analysis.errorHeavyRate > 0.25) {
      return this.createErrorHeavyTask(analysis, timeWindow);
    }

    this.log('info', `No significant UX issues detected (abort rate: ${(analysis.abortRate * 100).toFixed(1)}%)`);
    return null;
  }

  /**
   * Analyze conversations for UX patterns
   *
   * @param {Array} conversations - Array of [convId, events]
   * @returns {Object} Analysis results
   */
  analyzeConversations(conversations) {
    let aborts = 0;
    let longWaits = 0;
    let errorHeavy = 0;
    const longWaitSamples = [];

    for (const [convId, events] of conversations) {
      const lastEvent = events[events.length - 1];
      const errors = events.filter(e => e.status === 'error');

      // Check if conversation was aborted (no successful completion)
      const hasCompletion = events.some(e =>
        e.act === 'assistant_response' &&
        e.status === 'ok' &&
        e.metadata?.finish_reason === 'stop'
      );

      if (!hasCompletion && events.length > 2) {
        aborts++;
      }

      // Check for long waits
      const longWaitEvents = events.filter(e =>
        e.elapsed_ms && e.elapsed_ms > this.config.longWaitThreshold
      );

      if (longWaitEvents.length > 0) {
        longWaits++;
        longWaitSamples.push(...longWaitEvents.slice(0, 2));
      }

      // Check if conversation had many errors (>30% error rate)
      if (errors.length / events.length > 0.30) {
        errorHeavy++;
      }
    }

    return {
      totalConversations: conversations.length,
      aborts,
      abortRate: aborts / conversations.length,
      longWaits,
      longWaitRate: longWaits / conversations.length,
      errorHeavy,
      errorHeavyRate: errorHeavy / conversations.length,
      longWaitSamples: longWaitSamples.slice(0, 5),
    };
  }

  /**
   * Create task for high abort rate
   *
   * @param {Object} analysis - Analysis results
   * @param {Object} timeWindow - Time window
   * @returns {Object} Task card
   */
  createAbortTask(analysis, timeWindow) {
    const severity = analysis.abortRate >= this.config.criticalAbortRate ? Severity.CRITICAL :
                     analysis.abortRate >= this.config.abortThreshold * 1.5 ? Severity.HIGH :
                     Severity.MEDIUM;

    return this.createTask({
      type: TaskType.UX_ISSUE,
      severity,
      title: `Investigate high conversation abort rate: ${(analysis.abortRate * 100).toFixed(1)}%`,
      description: `${analysis.aborts} of ${analysis.totalConversations} conversations (${(analysis.abortRate * 100).toFixed(1)}%) were aborted or incomplete in the last ${Math.round(timeWindow.durationMs / 60000)} minutes. This suggests users are encountering friction or not getting satisfactory responses.`,
      evidence: {
        metric: 'conversation_abort_rate',
        current: `${(analysis.abortRate * 100).toFixed(1)}%`,
        threshold: `${(this.config.abortThreshold * 100).toFixed(0)}%`,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
        details: {
          totalConversations: analysis.totalConversations,
          abortedConversations: analysis.aborts,
          completedConversations: analysis.totalConversations - analysis.aborts,
        },
      },
      suggestedFix: {
        approach: 'improve_user_experience',
        files: [
          'frontend/src/components/Chat.tsx',
          'frontend/server.orchestrator.mjs',
          'frontend/core/agent/autonomous.mjs',
        ],
        changes: [
          'Add progress indicators for long-running operations',
          'Improve error messages with actionable guidance',
          'Add retry mechanisms for failed operations',
          'Reduce initial response latency',
          'Add "still working" indicators for slow responses',
          'Investigate common abort patterns in logs',
        ],
        estimatedEffort: '2-3 hours',
      },
      acceptanceCriteria: [
        `Abort rate drops below ${(this.config.abortThreshold * 0.8 * 100).toFixed(0)}%`,
        'User feedback collected on improved experience',
        'Common abort patterns identified and mitigated',
        'Monitoring dashboard shows sustained improvement',
      ],
      confidence: Math.min(0.90, 0.65 + (analysis.abortRate - this.config.abortThreshold) * 2),
    });
  }

  /**
   * Create task for long wait times
   *
   * @param {Object} analysis - Analysis results
   * @param {Object} timeWindow - Time window
   * @returns {Object} Task card
   */
  createWaitTimeTask(analysis, timeWindow) {
    const severity = analysis.longWaitRate > 0.30 ? Severity.HIGH : Severity.MEDIUM;

    const samples = getSamples(analysis.longWaitSamples, 5);

    return this.createTask({
      type: TaskType.UX_ISSUE,
      severity,
      title: `Reduce long wait times affecting ${(analysis.longWaitRate * 100).toFixed(0)}% of users`,
      description: `${analysis.longWaits} of ${analysis.totalConversations} conversations (${(analysis.longWaitRate * 100).toFixed(1)}%) experienced wait times exceeding ${this.config.longWaitThreshold / 1000}s. Long wait times lead to user frustration and abandonment.`,
      evidence: {
        metric: 'long_wait_rate',
        current: `${(analysis.longWaitRate * 100).toFixed(1)}%`,
        threshold: `15%`,
        waitThreshold: `${this.config.longWaitThreshold / 1000}s`,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
        samples,
      },
      suggestedFix: {
        approach: 'optimize_performance',
        files: [
          'frontend/server.orchestrator.mjs',
          'frontend/core/agent/autonomous.mjs',
        ],
        changes: [
          'Add streaming responses for immediate feedback',
          'Optimize tool execution paths',
          'Add caching for common queries',
          'Implement request prioritization',
          'Add timeout warnings to UI',
        ],
        estimatedEffort: '1-2 hours',
      },
      acceptanceCriteria: [
        `<10% of conversations experience waits >${this.config.longWaitThreshold / 1000}s`,
        'p95 response time < 5s',
        'User complaints about slow responses decrease',
      ],
      confidence: 0.75,
    });
  }

  /**
   * Create task for error-heavy conversations
   *
   * @param {Object} analysis - Analysis results
   * @param {Object} timeWindow - Time window
   * @returns {Object} Task card
   */
  createErrorHeavyTask(analysis, timeWindow) {
    const severity = analysis.errorHeavyRate > 0.40 ? Severity.HIGH : Severity.MEDIUM;

    return this.createTask({
      type: TaskType.UX_ISSUE,
      severity,
      title: `Reduce error-heavy conversations: ${(analysis.errorHeavyRate * 100).toFixed(0)}% affected`,
      description: `${analysis.errorHeavy} of ${analysis.totalConversations} conversations (${(analysis.errorHeavyRate * 100).toFixed(1)}%) had error rates exceeding 30%. High error rates create frustrating user experiences.`,
      evidence: {
        metric: 'error_heavy_conversation_rate',
        current: `${(analysis.errorHeavyRate * 100).toFixed(1)}%`,
        threshold: `25%`,
        timeWindow: `${Math.round(timeWindow.durationMs / 60000)} minutes`,
      },
      suggestedFix: {
        approach: 'improve_error_handling',
        files: [
          'frontend/server.tools.mjs',
          'frontend/server.orchestrator.mjs',
          'frontend/core/agent/diagnostic-reflection.mjs',
        ],
        changes: [
          'Improve error recovery mechanisms',
          'Add better input validation',
          'Enhance diagnostic reflection recovery',
          'Add graceful degradation for failing operations',
          'Improve error messages with recovery guidance',
        ],
        estimatedEffort: '1-2 hours',
      },
      acceptanceCriteria: [
        'Error-heavy conversation rate drops below 20%',
        'Diagnostic reflection recovery success rate > 90%',
        'User error reports decrease',
      ],
      confidence: 0.70,
    });
  }
}

export default UXIssueAnalyzer;
