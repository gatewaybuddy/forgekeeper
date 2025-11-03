/**
 * Outcome Tracker - Record and Query Alternative Outcomes
 *
 * [Phase 7.3] Track which alternatives succeeded/failed for learning
 *
 * Purpose:
 *   Record outcomes of chosen alternatives to learn optimal weights
 *   over time. Track task category, weights used, and success/failure.
 *
 * Key Features:
 *   - Append outcomes to JSONL file (.forgekeeper/learning/outcomes.jsonl)
 *   - Query outcomes by category, outcome type, score
 *   - Lightweight persistence (no database needed)
 *
 * @module frontend/core/agent/outcome-tracker
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

/**
 * Create an outcome tracker instance
 *
 * @param {Object} config - Configuration options
 * @returns {Object} Outcome tracker instance
 */
export function createOutcomeTracker(config = {}) {
  const outcomesDir = config.outcomesDir || '.forgekeeper/learning';
  const outcomesFile = path.join(outcomesDir, 'outcomes.jsonl');

  /**
   * Record an outcome
   *
   * @param {Object} outcome - Outcome record
   * @returns {Promise<void>}
   */
  async function recordOutcome(outcome) {
    try {
      // Ensure directory exists
      await fs.mkdir(outcomesDir, { recursive: true });

      // Add ID and timestamp if not present
      const record = {
        id: outcome.id || ulid(),
        ts: outcome.ts || new Date().toISOString(),
        ...outcome,
      };

      // Append to JSONL
      const line = JSON.stringify(record) + '\n';
      await fs.appendFile(outcomesFile, line);

      console.log(`[OutcomeTracker] Recorded outcome: ${record.outcome} for "${record.alternativeName}" (category: ${record.taskCategory || 'unknown'})`);
    } catch (err) {
      console.error(`[OutcomeTracker] Failed to record outcome:`, err.message);
      throw err;
    }
  }

  /**
   * Query outcomes with filters
   *
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Matching outcomes
   */
  async function queryOutcomes(filters = {}) {
    try {
      // Check if file exists
      try {
        await fs.access(outcomesFile);
      } catch {
        // File doesn't exist, return empty array
        console.log(`[OutcomeTracker] No outcomes file found at ${outcomesFile}`);
        return [];
      }

      // Read JSONL
      const content = await fs.readFile(outcomesFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      const outcomes = lines.map(line => JSON.parse(line));

      // Apply filters
      const filtered = outcomes.filter(o => {
        if (filters.taskCategory && o.taskCategory !== filters.taskCategory) return false;
        if (filters.outcome && o.outcome !== filters.outcome) return false;
        if (filters.minScore !== undefined && o.overallScore < filters.minScore) return false;
        if (filters.maxScore !== undefined && o.overallScore > filters.maxScore) return false;
        if (filters.sessionId && o.sessionId !== filters.sessionId) return false;
        return true;
      });

      console.log(`[OutcomeTracker] Queried ${filtered.length}/${outcomes.length} outcomes (filters: ${JSON.stringify(filters)})`);

      return filtered;
    } catch (err) {
      console.error(`[OutcomeTracker] Failed to query outcomes:`, err.message);
      throw err;
    }
  }

  /**
   * Get outcome statistics by category
   *
   * @param {string} taskCategory - Task category to analyze
   * @returns {Promise<Object>} Statistics
   */
  async function getStats(taskCategory = null) {
    const outcomes = await queryOutcomes(taskCategory ? { taskCategory } : {});

    const total = outcomes.length;
    const successes = outcomes.filter(o => o.outcome === 'success').length;
    const failures = outcomes.filter(o => o.outcome === 'failure').length;
    const partials = outcomes.filter(o => o.outcome === 'partial').length;

    const successRate = total > 0 ? successes / total : 0;

    const avgScore = total > 0
      ? outcomes.reduce((sum, o) => sum + (o.overallScore || 0), 0) / total
      : 0;

    const avgIterations = total > 0
      ? outcomes.reduce((sum, o) => sum + (o.actualIterations || 0), 0) / total
      : 0;

    return {
      taskCategory,
      total,
      successes,
      failures,
      partials,
      successRate,
      avgScore,
      avgIterations,
    };
  }

  /**
   * Categorize task into category for learning
   *
   * Simple heuristic-based categorization:
   *   - install, setup, configure → 'install'
   *   - test, verify, check → 'test'
   *   - build, compile, package → 'build'
   *   - deploy, release, publish → 'deploy'
   *   - fix, repair, debug → 'debug'
   *   - read, list, show → 'query'
   *   - write, create, update → 'modify'
   *   - default → 'general'
   */
  function categorizeTask(taskGoal) {
    const lowerGoal = taskGoal.toLowerCase();

    if (/install|setup|configure/.test(lowerGoal)) return 'install';
    if (/test|verify|check/.test(lowerGoal)) return 'test';
    if (/build|compile|package/.test(lowerGoal)) return 'build';
    if (/deploy|release|publish/.test(lowerGoal)) return 'deploy';
    if (/fix|repair|debug|resolve/.test(lowerGoal)) return 'debug';
    if (/read|list|show|get|fetch/.test(lowerGoal)) return 'query';
    if (/write|create|update|modify|delete/.test(lowerGoal)) return 'modify';

    return 'general';
  }

  return {
    recordOutcome,
    queryOutcomes,
    getStats,
    categorizeTask,
  };
}
