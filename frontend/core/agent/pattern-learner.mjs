/**
 * Pattern Learner
 * [T310] Learns from past recovery successes and applies patterns to new failures
 *
 * Integrates with session memory and episodic memory to:
 * - Recognize similar error patterns
 * - Boost confidence of previously successful strategies
 * - Suggest learned recovery approaches
 * - Track pattern effectiveness over time
 */

/**
 * Create pattern learner instance
 *
 * @param {Object} sessionMemory - SessionMemoryStore instance
 * @param {Object} episodicMemory - EpisodicMemoryStore instance
 * @returns {Object} Pattern learner interface
 */
export function createPatternLearner(sessionMemory, episodicMemory) {
  /**
   * Learn from past recoveries for a specific error category
   *
   * @param {string} errorCategory - Error category from error-classifier
   * @param {Object} context - Current error context
   * @returns {Promise<Object>} - Learned patterns and confidence boosts
   */
  async function learnFromPastRecoveries(errorCategory, context) {
    console.log(`[PatternLearner] Learning from past recoveries for ${errorCategory}`);

    // Query session memory for successful recoveries
    const sessionRecoveries = await sessionMemory.getSuccessfulRecoveries(errorCategory);

    // Query episodic memory for similar error patterns
    const episodeRecoveries = await episodicMemory.searchByErrorRecovery(errorCategory, {
      limit: 5,
      minConfidence: 0.7,
    });

    // Analyze and aggregate patterns
    const patterns = aggregatePatterns(sessionRecoveries, episodeRecoveries);

    // Calculate confidence boosts based on historical success
    const confidenceBoosts = calculateConfidenceBoosts(patterns, context);

    return {
      hasLearnedPatterns: patterns.length > 0,
      patterns,
      confidenceBoosts,
      historicalSuccessRate: calculateSuccessRate(patterns),
    };
  }

  /**
   * Aggregate patterns from session and episodic memory
   *
   * @param {Array} sessionRecoveries
   * @param {Array} episodeRecoveries
   * @returns {Array<Object>}
   */
  function aggregatePatterns(sessionRecoveries, episodeRecoveries) {
    const strategyMap = {};

    // Process session recoveries
    for (const recovery of sessionRecoveries) {
      const key = recovery.strategy_name;
      if (!strategyMap[key]) {
        strategyMap[key] = {
          strategy_name: key,
          success_count: 0,
          total_iterations: 0,
          tools_used: new Set(),
          contexts: [],
        };
      }

      strategyMap[key].success_count++;
      strategyMap[key].total_iterations += recovery.iterations_to_success || 1;

      if (recovery.tools_used) {
        recovery.tools_used.forEach(tool => strategyMap[key].tools_used.add(tool));
      }

      strategyMap[key].contexts.push({
        task: recovery.task_context || '',
        timestamp: recovery.timestamp,
      });
    }

    // Process episode recoveries
    for (const episode of episodeRecoveries) {
      for (const recovery of episode.recoveries) {
        const key = recovery.strategy_name;
        if (!strategyMap[key]) {
          strategyMap[key] = {
            strategy_name: key,
            success_count: 0,
            total_iterations: 0,
            tools_used: new Set(),
            contexts: [],
          };
        }

        strategyMap[key].success_count++;
        strategyMap[key].total_iterations += recovery.iterations_to_success || 1;

        if (recovery.tools_used) {
          recovery.tools_used.forEach(tool => strategyMap[key].tools_used.add(tool));
        }

        strategyMap[key].contexts.push({
          task: episode.task || '',
          timestamp: episode.timestamp,
        });
      }
    }

    // Convert to array and calculate metrics
    return Object.values(strategyMap).map(pattern => ({
      strategy_name: pattern.strategy_name,
      success_count: pattern.success_count,
      avg_iterations: pattern.total_iterations / pattern.success_count,
      tools_used: Array.from(pattern.tools_used),
      recent_contexts: pattern.contexts.slice(-3), // Last 3 contexts
      confidence_boost: calculateBoostForPattern(pattern),
    }));
  }

  /**
   * Calculate confidence boost for a pattern based on success history
   *
   * @param {Object} pattern
   * @returns {number} - Boost multiplier (1.0 = no boost, 1.5 = 50% boost, etc.)
   */
  function calculateBoostForPattern(pattern) {
    const { success_count, avg_iterations } = pattern;

    // Base boost on success count
    let boost = 1.0;

    if (success_count >= 5) {
      boost = 1.5; // 50% confidence boost for 5+ successes
    } else if (success_count >= 3) {
      boost = 1.3; // 30% boost for 3-4 successes
    } else if (success_count >= 2) {
      boost = 1.15; // 15% boost for 2 successes
    } else if (success_count === 1) {
      boost = 1.05; // 5% boost for 1 success
    }

    // Reduce boost if iterations are high (complex recovery)
    if (avg_iterations > 5) {
      boost *= 0.9;
    } else if (avg_iterations > 3) {
      boost *= 0.95;
    }

    return boost;
  }

  /**
   * Calculate confidence boosts for recovery strategies
   *
   * @param {Array} patterns - Learned patterns
   * @param {Object} context - Current error context
   * @returns {Object} - Strategy name → confidence boost multiplier
   */
  function calculateConfidenceBoosts(patterns, context) {
    const boosts = {};

    for (const pattern of patterns) {
      boosts[pattern.strategy_name] = pattern.confidence_boost;
    }

    return boosts;
  }

  /**
   * Calculate overall success rate from patterns
   *
   * @param {Array} patterns
   * @returns {number}
   */
  function calculateSuccessRate(patterns) {
    if (patterns.length === 0) return 0;

    const totalSuccesses = patterns.reduce((sum, p) => sum + p.success_count, 0);
    const totalAttempts = totalSuccesses; // We only track successes for now

    return totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;
  }

  /**
   * Apply learned patterns to recovery plan
   *
   * Boosts confidence scores of strategies that have worked historically
   *
   * @param {Object} recoveryPlan - Recovery plan from recovery-planner
   * @param {string} errorCategory - Error category
   * @param {Object} context - Error context
   * @returns {Promise<Object>} - Enhanced recovery plan with boosted confidences
   */
  async function applyLearnedPatterns(recoveryPlan, errorCategory, context) {
    if (!recoveryPlan.hasRecoveryPlan) {
      return recoveryPlan; // Nothing to enhance
    }

    // Learn from past recoveries
    const learnings = await learnFromPastRecoveries(errorCategory, context);

    if (!learnings.hasLearnedPatterns) {
      console.log('[PatternLearner] No historical patterns found for', errorCategory);
      return recoveryPlan;
    }

    console.log(
      `[PatternLearner] Found ${learnings.patterns.length} learned patterns for ${errorCategory}`
    );

    // Apply confidence boosts to primary strategy
    const primaryStrategy = recoveryPlan.primaryStrategy;
    const boost = learnings.confidenceBoosts[primaryStrategy.name] || 1.0;

    if (boost > 1.0) {
      const originalConfidence = primaryStrategy.confidence;
      primaryStrategy.confidence = Math.min(1.0, originalConfidence * boost);
      primaryStrategy.confidence_boosted = true;
      primaryStrategy.boost_reason = `Historical success rate: ${learnings.patterns.find(p => p.strategy_name === primaryStrategy.name)?.success_count || 0} successes`;

      console.log(
        `[PatternLearner] Boosted "${primaryStrategy.name}" confidence: ${originalConfidence.toFixed(2)} → ${primaryStrategy.confidence.toFixed(2)} (${boost.toFixed(2)}x)`
      );
    }

    // Apply boosts to fallback strategies
    if (recoveryPlan.fallbackStrategies) {
      for (const fallback of recoveryPlan.fallbackStrategies) {
        const fallbackBoost = learnings.confidenceBoosts[fallback.name] || 1.0;
        if (fallbackBoost > 1.0) {
          fallback.confidence = Math.min(1.0, fallback.confidence * fallbackBoost);
          fallback.confidence_boosted = true;
        }
      }
    }

    // Add learned patterns to recovery plan metadata
    recoveryPlan.learned_patterns = learnings.patterns.map(p => ({
      strategy_name: p.strategy_name,
      success_count: p.success_count,
      avg_iterations: p.avg_iterations,
    }));

    recoveryPlan.historical_success_rate = learnings.historicalSuccessRate;

    return recoveryPlan;
  }

  /**
   * Record recovery outcome for learning
   *
   * @param {Object} recoveryAttempt - Recovery attempt details
   */
  async function recordRecoveryOutcome(recoveryAttempt) {
    // This will be called by autonomous agent after recovery attempt
    // Data is already persisted through session memory, so no action needed here
    // Future: Could implement pattern confidence updates based on failures

    const { error_category, strategy_name, recovery_succeeded } = recoveryAttempt;

    if (recovery_succeeded) {
      console.log(
        `[PatternLearner] ✅ Recorded successful recovery: ${strategy_name} for ${error_category}`
      );
    } else {
      console.log(
        `[PatternLearner] ❌ Recorded failed recovery: ${strategy_name} for ${error_category}`
      );
    }
  }

  /**
   * Get pattern statistics
   *
   * @returns {Promise<Object>}
   */
  async function getPatternStatistics() {
    const sessionStats = await sessionMemory.getErrorPatternStats();
    const episodeStats = await episodicMemory.getErrorCategoryStats();
    const commonPatterns = await episodicMemory.getCommonErrorPatterns(10);

    return {
      session_stats: sessionStats,
      episode_stats: episodeStats,
      common_patterns: commonPatterns,
      total_learned_patterns: commonPatterns.length,
    };
  }

  /**
   * Suggest recovery strategy based on historical patterns
   *
   * @param {string} errorCategory
   * @param {Object} context
   * @returns {Promise<Object|null>}
   */
  async function suggestRecoveryStrategy(errorCategory, context) {
    const learnings = await learnFromPastRecoveries(errorCategory, context);

    if (!learnings.hasLearnedPatterns) {
      return null;
    }

    // Find pattern with highest success count
    const bestPattern = learnings.patterns.sort(
      (a, b) => b.success_count - a.success_count
    )[0];

    return {
      strategy_name: bestPattern.strategy_name,
      confidence: Math.min(0.95, 0.7 + bestPattern.success_count * 0.05),
      reason: `Used successfully ${bestPattern.success_count} times in past sessions`,
      avg_iterations: bestPattern.avg_iterations,
      tools_used: bestPattern.tools_used,
      recent_contexts: bestPattern.recent_contexts,
    };
  }

  return {
    learnFromPastRecoveries,
    applyLearnedPatterns,
    recordRecoveryOutcome,
    getPatternStatistics,
    suggestRecoveryStrategy,
  };
}
