/**
 * Tool Effectiveness Tracker
 * [Phase 3] Cross-Session Learning
 *
 * Tracks tool success rates by task type across multiple sessions.
 * Enables the agent to learn which tools work best for specific tasks
 * based on historical data rather than exploration.
 *
 * Storage Format: JSONL append-only log
 * Each line: { task_type, tool, success, iterations, timestamp, session_id }
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {Object} ToolStats
 * @property {number} totalAttempts - Total times tool was used for this task
 * @property {number} successes - Number of successful uses
 * @property {number} failures - Number of failures
 * @property {number} successRate - Success rate (0.0-1.0)
 * @property {number} avgIterations - Average iterations to success
 * @property {string} lastUsed - ISO timestamp of last use
 */

/**
 * @typedef {Object} ToolRecommendation
 * @property {string} tool - Tool name
 * @property {number} successRate - Success rate for this task type
 * @property {number} confidence - Confidence in recommendation (0.0-1.0)
 * @property {number} sampleSize - Number of historical attempts
 * @property {string} reason - Why this tool is recommended
 */

/**
 * Create tool effectiveness tracker
 *
 * @param {string} baseDir - Base directory for storage
 * @returns {Object} Tool effectiveness tracker interface
 */
export function createToolEffectivenessTracker(baseDir = '.forgekeeper/playground') {
  const effectivenessFile = path.join(baseDir, '.tool_effectiveness.jsonl');

  // In-memory cache of aggregated stats
  let statsCache = null;
  let lastCacheUpdate = 0;
  const CACHE_TTL = 5000; // 5 seconds

  /**
   * Ensure storage file exists
   */
  async function ensureStorage() {
    try {
      await fs.mkdir(path.dirname(effectivenessFile), { recursive: true });
      try {
        await fs.access(effectivenessFile);
      } catch {
        // File doesn't exist, create empty file
        await fs.writeFile(effectivenessFile, '', 'utf-8');
      }
    } catch (error) {
      console.warn('[ToolEffectiveness] Failed to ensure storage:', error);
    }
  }

  /**
   * Record tool usage outcome
   *
   * @param {Object} usage - Tool usage data
   * @returns {Promise<void>}
   */
  async function recordUsage(usage) {
    await ensureStorage();

    const record = {
      task_type: usage.taskType,
      tool: usage.tool,
      success: usage.success,
      iterations: usage.iterations || 1,
      timestamp: new Date().toISOString(),
      session_id: usage.sessionId || 'unknown',
    };

    try {
      await fs.appendFile(effectivenessFile, JSON.stringify(record) + '\n', 'utf-8');

      // Invalidate cache
      statsCache = null;

      console.log(`[ToolEffectiveness] Recorded: ${usage.tool} for ${usage.taskType} - ${usage.success ? 'SUCCESS' : 'FAILURE'}`);
    } catch (error) {
      console.warn('[ToolEffectiveness] Failed to record usage:', error);
    }
  }

  /**
   * Load and aggregate tool effectiveness stats
   *
   * @returns {Promise<Object>} Aggregated stats by task type and tool
   */
  async function loadStats() {
    // Check cache
    const now = Date.now();
    if (statsCache && (now - lastCacheUpdate) < CACHE_TTL) {
      return statsCache;
    }

    await ensureStorage();

    const stats = {};

    try {
      const content = await fs.readFile(effectivenessFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line);

          // Initialize task type if needed
          if (!stats[record.task_type]) {
            stats[record.task_type] = {};
          }

          // Initialize tool stats if needed
          if (!stats[record.task_type][record.tool]) {
            stats[record.task_type][record.tool] = {
              totalAttempts: 0,
              successes: 0,
              failures: 0,
              successRate: 0,
              totalIterations: 0,
              avgIterations: 0,
              lastUsed: record.timestamp,
            };
          }

          const toolStats = stats[record.task_type][record.tool];

          // Update stats
          toolStats.totalAttempts++;
          if (record.success) {
            toolStats.successes++;
            toolStats.totalIterations += record.iterations;
          } else {
            toolStats.failures++;
          }

          toolStats.lastUsed = record.timestamp; // Keep updating to latest

          // Calculate derived stats
          toolStats.successRate = toolStats.successes / toolStats.totalAttempts;
          toolStats.avgIterations = toolStats.successes > 0
            ? toolStats.totalIterations / toolStats.successes
            : 0;

        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }

      // Update cache
      statsCache = stats;
      lastCacheUpdate = now;

      return stats;

    } catch (error) {
      console.warn('[ToolEffectiveness] Failed to load stats:', error);
      return {};
    }
  }

  /**
   * Get tool recommendations for a task type
   *
   * @param {string} taskType - Task type (e.g., 'clone_repository')
   * @param {Object} [options] - Options
   * @returns {Promise<Array<ToolRecommendation>>} Recommended tools, sorted by success rate
   */
  async function getRecommendations(taskType, options = {}) {
    const minSampleSize = options.minSampleSize || 3;
    const maxRecommendations = options.maxRecommendations || 5;

    const stats = await loadStats();
    const taskStats = stats[taskType];

    if (!taskStats) {
      return []; // No historical data for this task type
    }

    const recommendations = [];

    for (const [tool, toolStats] of Object.entries(taskStats)) {
      // Skip tools with insufficient data
      if (toolStats.totalAttempts < minSampleSize) {
        continue;
      }

      // Calculate confidence based on sample size
      // More samples = higher confidence
      const sampleConfidence = Math.min(1.0, toolStats.totalAttempts / 10);

      // Success rate contributes to confidence
      const successConfidence = toolStats.successRate;

      // Combined confidence (geometric mean)
      const confidence = Math.sqrt(sampleConfidence * successConfidence);

      // Generate reason
      let reason = '';
      if (toolStats.successRate >= 0.8) {
        reason = `Strong historical evidence: ${toolStats.successes}/${toolStats.totalAttempts} successes (${(toolStats.successRate * 100).toFixed(0)}%)`;
      } else if (toolStats.successRate >= 0.5) {
        reason = `Moderate success: ${toolStats.successes}/${toolStats.totalAttempts} attempts (${(toolStats.successRate * 100).toFixed(0)}%)`;
      } else {
        reason = `Low success rate: ${toolStats.successes}/${toolStats.totalAttempts} attempts (${(toolStats.successRate * 100).toFixed(0)}%) - avoid if possible`;
      }

      if (toolStats.avgIterations > 0) {
        reason += `, avg ${toolStats.avgIterations.toFixed(1)} iterations to success`;
      }

      recommendations.push({
        tool,
        successRate: toolStats.successRate,
        confidence,
        sampleSize: toolStats.totalAttempts,
        reason,
        avgIterations: toolStats.avgIterations,
      });
    }

    // Sort by success rate (descending), then confidence
    recommendations.sort((a, b) => {
      if (Math.abs(a.successRate - b.successRate) > 0.1) {
        return b.successRate - a.successRate;
      }
      return b.confidence - a.confidence;
    });

    return recommendations.slice(0, maxRecommendations);
  }

  /**
   * Get summary stats for a task type
   *
   * @param {string} taskType - Task type
   * @returns {Promise<Object>} Summary statistics
   */
  async function getTaskSummary(taskType) {
    const stats = await loadStats();
    const taskStats = stats[taskType];

    if (!taskStats) {
      return {
        totalTools: 0,
        totalAttempts: 0,
        bestTool: null,
        worstTool: null,
      };
    }

    const tools = Object.entries(taskStats);
    const totalAttempts = tools.reduce((sum, [_, ts]) => sum + ts.totalAttempts, 0);

    // Find best and worst tools (by success rate, min 3 samples)
    const qualifiedTools = tools.filter(([_, ts]) => ts.totalAttempts >= 3);

    let bestTool = null;
    let worstTool = null;

    if (qualifiedTools.length > 0) {
      qualifiedTools.sort((a, b) => b[1].successRate - a[1].successRate);
      bestTool = {
        name: qualifiedTools[0][0],
        successRate: qualifiedTools[0][1].successRate,
        attempts: qualifiedTools[0][1].totalAttempts,
      };

      if (qualifiedTools.length > 1) {
        worstTool = {
          name: qualifiedTools[qualifiedTools.length - 1][0],
          successRate: qualifiedTools[qualifiedTools.length - 1][1].successRate,
          attempts: qualifiedTools[qualifiedTools.length - 1][1].totalAttempts,
        };
      }
    }

    return {
      totalTools: tools.length,
      totalAttempts,
      bestTool,
      worstTool,
    };
  }

  /**
   * Clear all data (for testing)
   *
   * @returns {Promise<void>}
   */
  async function clear() {
    try {
      await fs.writeFile(effectivenessFile, '', 'utf-8');
      statsCache = null;
      console.log('[ToolEffectiveness] Cleared all data');
    } catch (error) {
      console.warn('[ToolEffectiveness] Failed to clear data:', error);
    }
  }

  return {
    recordUsage,
    getRecommendations,
    getTaskSummary,
    loadStats,
    clear,
  };
}
