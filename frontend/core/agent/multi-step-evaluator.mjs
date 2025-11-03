/**
 * Multi-Step Evaluator - Evaluate Entire Paths, Not Just Individual Steps
 *
 * [Phase 7.2] Path-Level Evaluation for Multi-Step Planning
 *
 * Purpose:
 *   Evaluate sequences of steps as complete paths, considering:
 *   - Total effort across all steps
 *   - Compound risk (weakest link)
 *   - Compound complexity (steps interact)
 *   - Final goal alignment
 *   - Path confidence (product of step confidences)
 *
 * Key Features:
 *   - Aggregate metrics across paths
 *   - Compound complexity calculation
 *   - Risk propagation (max, average, or weighted)
 *   - MCDM scoring for entire paths
 *
 * @module frontend/core/agent/multi-step-evaluator
 */

import { ulid } from 'ulid';

/**
 * Create a multi-step evaluator instance
 *
 * @param {Object} effortEstimator - Effort estimator from Phase 6.2
 * @param {Object} alignmentChecker - Alignment checker from Phase 6.3
 * @param {Object} config - Configuration options
 * @returns {Object} Multi-step evaluator instance
 */
export function createMultiStepEvaluator(effortEstimator, alignmentChecker, config = {}) {
  const riskAggregation = config.riskAggregation || 'max';  // 'max' | 'avg' | 'weighted'
  const compoundFactor = config.compoundFactor || 1.2;      // Complexity multiplier for multi-step
  const weights = config.weights || {
    effort: 0.35,
    risk: 0.25,
    alignment: 0.30,
    confidence: 0.10,
  };

  /**
   * Evaluate all paths from task graph
   *
   * @param {Array} paths - Paths from task graph builder
   * @param {Object} context - Execution context
   * @returns {Promise<Array>} Evaluated paths with scores
   */
  async function evaluatePaths(paths, context) {
    const evaluationId = ulid();
    const startTime = Date.now();

    console.log(`[MultiStepEvaluator] ${evaluationId}: Evaluating ${paths.length} paths...`);

    const evaluatedPaths = [];

    for (const path of paths) {
      try {
        const evaluation = await evaluatePath(path, context);
        evaluatedPaths.push(evaluation);
      } catch (err) {
        console.warn(`[MultiStepEvaluator] Failed to evaluate path ${path.id}:`, err.message);
        // Skip failed paths
      }
    }

    // Sort by path score (highest first)
    const sorted = evaluatedPaths.sort((a, b) => b.pathScore - a.pathScore);

    const elapsedMs = Date.now() - startTime;

    console.log(`[MultiStepEvaluator] ${evaluationId}: Evaluated ${sorted.length}/${paths.length} paths in ${elapsedMs}ms`);
    if (sorted.length > 0) {
      console.log(`[MultiStepEvaluator] ${evaluationId}: Best path score: ${sorted[0].pathScore.toFixed(2)}`);
    }

    return sorted;
  }

  /**
   * Evaluate a single path (sequence of alternatives)
   *
   * @param {Object} path - Path from task graph
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Evaluated path
   */
  async function evaluatePath(path, context) {
    const pathId = path.id;

    // Step 1: Estimate effort for each step
    const stepEfforts = await Promise.all(
      path.steps.map(step => effortEstimator.estimate(step, context))
    );

    // Step 2: Check alignment for each step
    const stepAlignments = await Promise.all(
      path.steps.map(step => alignmentChecker.checkAlignment(step, context))
    );

    // Step 3: Aggregate metrics
    const totalEffort = aggregateEffort(stepEfforts);
    const totalRisk = aggregateRisk(stepEfforts, riskAggregation);
    const compoundComplexity = calculateCompoundComplexity(stepEfforts, compoundFactor);

    // Step 4: Final step alignment (most important for goal achievement)
    const finalStepAlignment = stepAlignments[stepAlignments.length - 1];
    const goalAlignment = finalStepAlignment ? finalStepAlignment.alignmentScore : 0.5;

    // Step 5: Path confidence (product of step confidences)
    const pathConfidence = path.steps.reduce((prod, step) => prod * (step.confidence || 0.5), 1.0);

    // Step 6: Estimate total iterations
    const totalIterations = stepEfforts.reduce((sum, e) => sum + (e.iterations?.estimate || 1), 0);

    // Step 7: Score path using MCDM
    const pathScore = calculatePathScore({
      totalEffort,
      totalRisk,
      compoundComplexity,
      goalAlignment,
      pathConfidence,
    }, weights);

    return {
      pathId,
      path,
      totalEffort,
      totalRisk,
      compoundComplexity,
      goalAlignment,
      pathConfidence,
      totalIterations,
      pathScore,
      stepEfforts,
      stepAlignments,
    };
  }

  /**
   * Aggregate effort across all steps (simple sum)
   */
  function aggregateEffort(stepEfforts) {
    return stepEfforts.reduce((sum, effort) => {
      const complexity = effort.complexity?.complexityScore || 5.0;
      return sum + complexity;
    }, 0);
  }

  /**
   * Aggregate risk across all steps
   *
   * Strategies:
   *   - 'max': Weakest link (highest risk step determines path risk)
   *   - 'avg': Average risk across all steps
   *   - 'weighted': Weighted average with recency bias (later steps matter more)
   */
  function aggregateRisk(stepEfforts, strategy) {
    const risks = stepEfforts.map(e => e.risk?.riskScore || 5.0);

    if (strategy === 'max') {
      // Weakest link: path is as risky as its riskiest step
      return Math.max(...risks);
    } else if (strategy === 'avg') {
      // Average risk
      return risks.reduce((sum, r) => sum + r, 0) / risks.length;
    } else if (strategy === 'weighted') {
      // Weighted average with recency bias (later steps weighted higher)
      let weightedSum = 0;
      let weightSum = 0;
      for (let i = 0; i < risks.length; i++) {
        const weight = i + 1; // Later steps have higher weight
        weightedSum += risks[i] * weight;
        weightSum += weight;
      }
      return weightedSum / weightSum;
    } else {
      // Default to max
      return Math.max(...risks);
    }
  }

  /**
   * Calculate compound complexity
   *
   * Multi-step sequences are more complex than the sum of parts because:
   *   - Steps may have dependencies
   *   - State from previous steps affects later steps
   *   - Debugging multi-step failures is harder
   *
   * Formula: baseComplexity × (1 + (numSteps - 1) × compoundFactor)
   */
  function calculateCompoundComplexity(stepEfforts, compoundFactor) {
    const baseComplexity = stepEfforts.reduce((sum, e) => {
      return sum + (e.complexity?.complexityScore || 5.0);
    }, 0);

    const numSteps = stepEfforts.length;

    // Apply compound factor (more steps = more interaction complexity)
    const compoundMultiplier = 1 + ((numSteps - 1) * (compoundFactor - 1));
    const compoundComplexity = baseComplexity * compoundMultiplier;

    return compoundComplexity;
  }

  /**
   * Calculate path score using MCDM
   *
   * Overall Score = (1 - normalizedEffort) × weight_effort +
   *                 (1 - normalizedRisk) × weight_risk +
   *                 goalAlignment × weight_alignment +
   *                 pathConfidence × weight_confidence
   */
  function calculatePathScore(metrics, weights) {
    // Normalize metrics to 0-1 scale
    const normalizedEffort = Math.min(metrics.totalEffort / 20, 1.0);  // Assume max effort = 20
    const normalizedRisk = Math.min(metrics.totalRisk / 10, 1.0);      // Risk is already 0-10

    // Calculate weighted contributions
    const effortContribution = (1 - normalizedEffort) * weights.effort;
    const riskContribution = (1 - normalizedRisk) * weights.risk;
    const alignmentContribution = metrics.goalAlignment * weights.alignment;
    const confidenceContribution = metrics.pathConfidence * weights.confidence;

    const pathScore = effortContribution + riskContribution + alignmentContribution + confidenceContribution;

    return pathScore;
  }

  return {
    evaluatePaths,
    evaluatePath,
  };
}
