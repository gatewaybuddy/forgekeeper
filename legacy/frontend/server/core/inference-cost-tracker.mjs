/**
 * Inference Cost Tracker
 *
 * Tracks API vs local inference usage and calculates cost savings.
 * Stores metrics in JSONL format for analysis.
 *
 * @module server/core/inference-cost-tracker
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

/**
 * Cost estimates (relative units, API cost normalized to 100)
 */
const COST_ESTIMATES = {
  local: 1,        // Nearly free (electricity only)
  api_openai: 100, // Expensive (GPT-4 range)
  api_anthropic: 100, // Expensive (Claude range)
  api_generic: 80, // Generic API cost
};

/**
 * Cost tracker class
 */
export class InferenceCostTracker {
  constructor(options = {}) {
    this.statsFile = options.statsFile || '.forgekeeper/inference-routing-stats.jsonl';
    this.sessionStats = {
      totalRequests: 0,
      localRequests: 0,
      apiRequests: 0,
      localCost: 0,
      apiCost: 0,
      savings: 0,
    };
  }

  /**
   * Record an inference request
   *
   * @param {Object} record - Request record
   * @param {string} record.route - Route taken ('local' or 'api')
   * @param {string} record.provider - Provider name
   * @param {number} [record.inputTokens] - Input tokens
   * @param {number} [record.outputTokens] - Output tokens
   * @param {string} [record.complexity] - Complexity level
   * @param {number} [record.confidence] - Classification confidence
   * @param {boolean} [record.success] - Whether request succeeded
   * @param {number} [record.elapsedMs] - Time taken
   * @returns {Promise<void>}
   */
  async recordRequest(record) {
    const timestamp = new Date().toISOString();
    const id = ulid();

    // Calculate cost
    const cost = this.calculateCost(record);

    // Update session stats
    this.sessionStats.totalRequests++;
    if (record.route === 'local') {
      this.sessionStats.localRequests++;
      this.sessionStats.localCost += cost;
    } else {
      this.sessionStats.apiRequests++;
      this.sessionStats.apiCost += cost;
    }

    // Calculate savings (what we would have paid if all were API)
    const apiEquivalentCost = COST_ESTIMATES.api_generic;
    this.sessionStats.savings = (this.sessionStats.totalRequests * apiEquivalentCost) -
                                 (this.sessionStats.localCost + this.sessionStats.apiCost);

    // Persist to file
    const logEntry = {
      id,
      timestamp,
      route: record.route,
      provider: record.provider || 'unknown',
      complexity: record.complexity,
      confidence: record.confidence,
      inputTokens: record.inputTokens || 0,
      outputTokens: record.outputTokens || 0,
      cost,
      success: record.success !== false,
      elapsedMs: record.elapsedMs || 0,
    };

    await this.appendToLog(logEntry);
  }

  /**
   * Calculate cost for a request
   *
   * @param {Object} record - Request record
   * @returns {number} Estimated cost (relative units)
   */
  calculateCost(record) {
    if (record.route === 'local') {
      return COST_ESTIMATES.local;
    }

    // API cost based on provider
    const provider = record.provider?.toLowerCase() || 'generic';
    if (provider.includes('openai') || provider.includes('gpt')) {
      return COST_ESTIMATES.api_openai;
    }
    if (provider.includes('anthropic') || provider.includes('claude')) {
      return COST_ESTIMATES.api_anthropic;
    }

    return COST_ESTIMATES.api_generic;
  }

  /**
   * Get current session statistics
   *
   * @returns {Object} Session stats
   */
  getSessionStats() {
    const savingsPercent = this.sessionStats.totalRequests > 0
      ? (this.sessionStats.savings / (this.sessionStats.totalRequests * COST_ESTIMATES.api_generic)) * 100
      : 0;

    const localPercent = this.sessionStats.totalRequests > 0
      ? (this.sessionStats.localRequests / this.sessionStats.totalRequests) * 100
      : 0;

    return {
      ...this.sessionStats,
      savingsPercent,
      localPercent,
      apiPercent: 100 - localPercent,
    };
  }

  /**
   * Get statistics for a time period
   *
   * @param {Object} options - Options
   * @param {string} [options.fromDate] - Start date (ISO)
   * @param {string} [options.toDate] - End date (ISO)
   * @param {number} [options.limit] - Max records to analyze
   * @returns {Promise<Object>} Statistics
   */
  async getStats(options = {}) {
    try {
      const content = await fs.readFile(this.statsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      let records = lines.map(line => JSON.parse(line));

      // Apply filters
      if (options.fromDate) {
        records = records.filter(r => r.timestamp >= options.fromDate);
      }
      if (options.toDate) {
        records = records.filter(r => r.timestamp <= options.toDate);
      }
      if (options.limit) {
        records = records.slice(-options.limit);
      }

      // Calculate aggregates
      const stats = {
        totalRequests: records.length,
        localRequests: records.filter(r => r.route === 'local').length,
        apiRequests: records.filter(r => r.route === 'api').length,
        localCost: records.filter(r => r.route === 'local').reduce((sum, r) => sum + r.cost, 0),
        apiCost: records.filter(r => r.route === 'api').reduce((sum, r) => sum + r.cost, 0),
        avgConfidence: records.reduce((sum, r) => sum + (r.confidence || 0), 0) / records.length,
        successRate: records.filter(r => r.success).length / records.length,
        complexityBreakdown: {
          simple: records.filter(r => r.complexity === 'simple').length,
          medium: records.filter(r => r.complexity === 'medium').length,
          complex: records.filter(r => r.complexity === 'complex').length,
        },
      };

      // Calculate savings
      const apiEquivalentCost = stats.totalRequests * COST_ESTIMATES.api_generic;
      stats.savings = apiEquivalentCost - (stats.localCost + stats.apiCost);
      stats.savingsPercent = (stats.savings / apiEquivalentCost) * 100;

      return stats;
    } catch (err) {
      // File doesn't exist or is empty
      return {
        totalRequests: 0,
        localRequests: 0,
        apiRequests: 0,
        localCost: 0,
        apiCost: 0,
        savings: 0,
        savingsPercent: 0,
        avgConfidence: 0,
        successRate: 0,
        complexityBreakdown: { simple: 0, medium: 0, complex: 0 },
      };
    }
  }

  /**
   * Append entry to log file
   *
   * @param {Object} entry - Log entry
   * @returns {Promise<void>}
   */
  async appendToLog(entry) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.statsFile);
      await fs.mkdir(dir, { recursive: true });

      // Append to file
      await fs.appendFile(this.statsFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[CostTracker] Failed to write to log:', err.message);
    }
  }

  /**
   * Reset session statistics
   */
  resetSessionStats() {
    this.sessionStats = {
      totalRequests: 0,
      localRequests: 0,
      apiRequests: 0,
      localCost: 0,
      apiCost: 0,
      savings: 0,
    };
  }
}

/**
 * Create cost tracker instance
 *
 * @param {Object} [options] - Tracker options
 * @returns {InferenceCostTracker} Tracker instance
 */
export function createCostTracker(options) {
  return new InferenceCostTracker(options);
}

/**
 * Global cost tracker instance
 */
let globalTracker = null;

/**
 * Get global cost tracker
 *
 * @returns {InferenceCostTracker} Global tracker
 */
export function getGlobalTracker() {
  if (!globalTracker) {
    globalTracker = createCostTracker();
  }
  return globalTracker;
}

/**
 * Record request using global tracker
 *
 * @param {Object} record - Request record
 * @returns {Promise<void>}
 */
export async function recordGlobalRequest(record) {
  const tracker = getGlobalTracker();
  await tracker.recordRequest(record);
}

/**
 * Get global statistics
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Statistics
 */
export async function getGlobalStats(options) {
  const tracker = getGlobalTracker();
  return await tracker.getStats(options);
}
