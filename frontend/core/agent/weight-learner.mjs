/**
 * Weight Learner - Learn Optimal MCDM Weights from Outcomes
 *
 * [Phase 7.4] Adaptive Weight Learning
 *
 * Purpose:
 *   Learn optimal weights for different task categories based on
 *   historical success/failure patterns. Adapt weights to maximize
 *   success rate for similar future tasks.
 *
 * Key Features:
 *   - Learn from success/failure patterns
 *   - Task-specific weights (install, test, build, etc.)
 *   - Blend with defaults when low data
 *   - Normalize weights to sum to 1.0
 *
 * @module frontend/core/agent/weight-learner
 */

/**
 * Create a weight learner instance
 *
 * @param {Object} outcomeTracker - Outcome tracker from Phase 7.3
 * @param {Object} config - Configuration options
 * @returns {Object} Weight learner instance
 */
export function createWeightLearner(outcomeTracker, config = {}) {
  const learningRate = config.learningRate || 0.1;          // How quickly to adapt (0.0-1.0)
  const minOutcomes = config.minOutcomes || 10;              // Min outcomes before learning
  const blendThreshold = config.blendThreshold || 50;        // Outcomes for 100% learned weights

  const defaultWeights = {
    effort: 0.35,
    risk: 0.25,
    alignment: 0.30,
    confidence: 0.10,
  };

  /**
   * Learn optimal weights for a task category
   *
   * @param {string} taskCategory - Task category (install, test, build, etc.)
   * @returns {Promise<Object>} Learned weights
   */
  async function learnWeights(taskCategory) {
    console.log(`[WeightLearner] Learning weights for category: "${taskCategory}"`);

    // Query outcomes for this category
    const outcomes = await outcomeTracker.queryOutcomes({ taskCategory });

    // Not enough data? Use defaults
    if (outcomes.length < minOutcomes) {
      console.log(`[WeightLearner] Not enough data for "${taskCategory}" (${outcomes.length} < ${minOutcomes}). Using defaults.`);
      return {
        weights: defaultWeights,
        confidence: 0,
        dataPoints: outcomes.length,
        method: 'default',
      };
    }

    // Split successes and failures
    const successes = outcomes.filter(o => o.outcome === 'success');
    const failures = outcomes.filter(o => o.outcome === 'failure');

    console.log(`[WeightLearner] Category "${taskCategory}": ${outcomes.length} outcomes (${successes.length} successes, ${failures.length} failures)`);

    // Not enough successes? Use defaults
    if (successes.length === 0) {
      console.log(`[WeightLearner] No successful outcomes for "${taskCategory}". Using defaults.`);
      return {
        weights: defaultWeights,
        confidence: 0,
        dataPoints: outcomes.length,
        method: 'default',
      };
    }

    // Calculate average weights for successes
    const avgSuccessWeights = averageWeights(successes.map(o => o.weights).filter(w => w));

    // Calculate average weights for failures (if any)
    const avgFailureWeights = failures.length > 0
      ? averageWeights(failures.map(o => o.weights).filter(w => w))
      : null;

    // Learn: Move toward success, away from failure
    let learnedWeights;
    if (avgFailureWeights) {
      learnedWeights = {
        effort: avgSuccessWeights.effort + (avgSuccessWeights.effort - avgFailureWeights.effort) * learningRate,
        risk: avgSuccessWeights.risk + (avgSuccessWeights.risk - avgFailureWeights.risk) * learningRate,
        alignment: avgSuccessWeights.alignment + (avgSuccessWeights.alignment - avgFailureWeights.alignment) * learningRate,
        confidence: avgSuccessWeights.confidence + (avgSuccessWeights.confidence - avgFailureWeights.confidence) * learningRate,
      };
    } else {
      // No failures: use success pattern directly
      learnedWeights = avgSuccessWeights;
    }

    // Normalize (must sum to 1.0)
    const normalized = normalizeWeights(learnedWeights);

    // Blend with defaults based on data quantity
    const blendRatio = Math.min(outcomes.length / blendThreshold, 1.0);
    const blended = blendWeights(normalized, defaultWeights, blendRatio);

    console.log(`[WeightLearner] Learned weights for "${taskCategory}" (${outcomes.length} outcomes, blend ratio: ${(blendRatio * 100).toFixed(0)}%):`);
    console.log(`  Effort: ${blended.effort.toFixed(2)} (default: ${defaultWeights.effort.toFixed(2)})`);
    console.log(`  Risk: ${blended.risk.toFixed(2)} (default: ${defaultWeights.risk.toFixed(2)})`);
    console.log(`  Alignment: ${blended.alignment.toFixed(2)} (default: ${defaultWeights.alignment.toFixed(2)})`);
    console.log(`  Confidence: ${blended.confidence.toFixed(2)} (default: ${defaultWeights.confidence.toFixed(2)})`);

    return {
      weights: blended,
      confidence: blendRatio,
      dataPoints: outcomes.length,
      method: blendRatio >= 1.0 ? 'learned' : 'blended',
      successRate: successes.length / outcomes.length,
    };
  }

  /**
   * Calculate average weights from array of weight objects
   */
  function averageWeights(weightsArray) {
    if (weightsArray.length === 0) {
      return defaultWeights;
    }

    const sum = weightsArray.reduce((acc, w) => ({
      effort: acc.effort + (w.effort || 0),
      risk: acc.risk + (w.risk || 0),
      alignment: acc.alignment + (w.alignment || 0),
      confidence: acc.confidence + (w.confidence || 0),
    }), { effort: 0, risk: 0, alignment: 0, confidence: 0 });

    return {
      effort: sum.effort / weightsArray.length,
      risk: sum.risk / weightsArray.length,
      alignment: sum.alignment / weightsArray.length,
      confidence: sum.confidence / weightsArray.length,
    };
  }

  /**
   * Normalize weights to sum to 1.0
   */
  function normalizeWeights(weights) {
    const sum = weights.effort + weights.risk + weights.alignment + weights.confidence;

    if (sum === 0) {
      return defaultWeights;
    }

    return {
      effort: weights.effort / sum,
      risk: weights.risk / sum,
      alignment: weights.alignment / sum,
      confidence: weights.confidence / sum,
    };
  }

  /**
   * Blend learned weights with defaults
   *
   * @param {Object} learned - Learned weights
   * @param {Object} defaults - Default weights
   * @param {number} ratio - Blend ratio (0 = all default, 1 = all learned)
   */
  function blendWeights(learned, defaults, ratio) {
    return {
      effort: learned.effort * ratio + defaults.effort * (1 - ratio),
      risk: learned.risk * ratio + defaults.risk * (1 - ratio),
      alignment: learned.alignment * ratio + defaults.alignment * (1 - ratio),
      confidence: learned.confidence * ratio + defaults.confidence * (1 - ratio),
    };
  }

  return {
    learnWeights,
  };
}
