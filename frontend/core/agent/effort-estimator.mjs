/**
 * Effort Estimator - Estimate Cost and Complexity of Alternatives
 *
 * [Phase 6.2] Proactive Effort Estimation
 *
 * Purpose:
 *   Estimate the effort, risk, and time required for each alternative
 *   approach. Uses historical data and multi-factor analysis to provide
 *   realistic estimates for decision-making.
 *
 * Key Features:
 *   - Complexity scoring (0-10): step count, tool diversity, assumptions
 *   - Risk assessment (0-10): likelihood × impact for multiple factors
 *   - Iteration estimation: based on similar past tasks
 *   - Historical learning: uses episodic memory for estimates
 *
 * @module frontend/core/agent/effort-estimator
 */

import { ulid } from 'ulid';

/**
 * Create an effort estimator instance
 *
 * @param {Object} episodicMemory - Episodic memory for historical data
 * @param {Object} config - Configuration options
 * @returns {Object} Effort estimator instance
 */
export function createEffortEstimator(episodicMemory = null, config = {}) {
  const baseIterationEstimate = config.baseIterationEstimate || 2;
  const maxIterationEstimate = config.maxIterationEstimate || 20;
  const riskThresholds = config.riskThresholds || {
    low: 3.0,
    medium: 6.0,
    high: 10.0,
  };

  /**
   * Estimate effort for a single alternative
   *
   * @param {Object} alternative - Alternative from generator
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Effort estimate
   */
  async function estimateEffort(alternative, context) {
    const estimateId = ulid();
    const startTime = Date.now();

    console.log(`[EffortEstimator] ${estimateId}: Estimating effort for: "${alternative.name}"`);

    // Step 1: Calculate complexity score
    const complexity = calculateComplexity(alternative, context);

    // Step 2: Assess risk
    const risk = await assessRisk(alternative, context);

    // Step 3: Estimate iterations
    const iterations = await estimateIterations(alternative, complexity, context);

    const elapsedMs = Date.now() - startTime;

    console.log(
      `[EffortEstimator] ${estimateId}: Complexity=${complexity.complexityScore.toFixed(1)}, Risk=${risk.riskScore.toFixed(1)}, Iterations=${iterations.estimate}`
    );

    return {
      alternativeId: alternative.id,
      alternativeName: alternative.name,
      complexity,
      risk,
      iterations,
      estimateId,
      timestamp: new Date().toISOString(),
      elapsedMs,
    };
  }

  /**
   * Estimate effort for all alternatives
   *
   * @param {Array} alternatives - Array of alternatives
   * @param {Object} context - Execution context
   * @returns {Promise<Array>} Array of effort estimates
   */
  async function estimateAllEfforts(alternatives, context) {
    console.log(`[EffortEstimator] Estimating effort for ${alternatives.length} alternatives...`);

    const estimates = [];
    for (const alternative of alternatives) {
      try {
        const estimate = await estimateEffort(alternative, context);
        estimates.push(estimate);
      } catch (error) {
        console.warn(`[EffortEstimator] Failed to estimate effort for "${alternative.name}":`, error.message);
        // Add fallback estimate
        estimates.push(createFallbackEstimate(alternative));
      }
    }

    return estimates;
  }

  /**
   * Calculate complexity score (0-10)
   *
   * Factors:
   * - Step count (more steps = more complex)
   * - Tool diversity (more different tools = more complex)
   * - Assumptions (more assumptions = more complex)
   * - Prerequisites (more prerequisites = more complex)
   * - Alternative confidence (lower confidence = higher complexity)
   */
  function calculateComplexity(alternative, context) {
    const factors = [];

    // Factor 1: Step count (0-10 scale, 1 step = 1, 10+ steps = 10)
    const stepCount = alternative.steps.length;
    const stepCountScore = Math.min(stepCount, 10);
    factors.push({
      name: 'step_count',
      score: stepCountScore,
      weight: 0.3,
      description: `${stepCount} step(s) to execute`,
    });

    // Factor 2: Tool diversity (0-10 scale, 1 tool = 2, 5+ tools = 10)
    const uniqueTools = new Set(alternative.steps.map(s => s.tool)).size;
    const toolDiversityScore = Math.min(uniqueTools * 2, 10);
    factors.push({
      name: 'tool_diversity',
      score: toolDiversityScore,
      weight: 0.2,
      description: `${uniqueTools} different tool(s) used`,
    });

    // Factor 3: Assumptions (0-10 scale, 0 assumptions = 0, 5+ assumptions = 10)
    const assumptionCount = alternative.assumptions?.length || 0;
    const assumptionScore = Math.min(assumptionCount * 2, 10);
    factors.push({
      name: 'assumptions',
      score: assumptionScore,
      weight: 0.2,
      description: `${assumptionCount} assumption(s) made`,
    });

    // Factor 4: Prerequisites (0-10 scale, 0 prereqs = 0, 5+ prereqs = 10)
    const prerequisiteCount = alternative.prerequisites?.length || 0;
    const prerequisiteScore = Math.min(prerequisiteCount * 2, 10);
    factors.push({
      name: 'prerequisites',
      score: prerequisiteScore,
      weight: 0.15,
      description: `${prerequisiteCount} prerequisite(s) required`,
    });

    // Factor 5: Confidence inverse (0-10 scale, 1.0 confidence = 0, 0.0 confidence = 10)
    const confidenceScore = (1.0 - (alternative.confidence || 0.5)) * 10;
    factors.push({
      name: 'uncertainty',
      score: confidenceScore,
      weight: 0.15,
      description: `${((1 - alternative.confidence) * 100).toFixed(0)}% uncertainty`,
    });

    // Calculate weighted average
    let complexityScore = 0;
    let totalWeight = 0;
    for (const factor of factors) {
      complexityScore += factor.score * factor.weight;
      totalWeight += factor.weight;
    }
    complexityScore = complexityScore / totalWeight;

    // Determine complexity level
    let complexityLevel;
    if (complexityScore < 3.0) {
      complexityLevel = 'low';
    } else if (complexityScore < 6.0) {
      complexityLevel = 'medium';
    } else {
      complexityLevel = 'high';
    }

    return {
      complexityScore,
      complexityLevel,
      factors,
      confidence: 0.8, // High confidence in complexity calculation
    };
  }

  /**
   * Assess risk (0-10 scale)
   *
   * Risk = Σ (Likelihood × Impact) for each risk factor
   */
  async function assessRisk(alternative, context) {
    const riskFactors = [];

    // Risk Factor 1: Tool availability
    const toolAvailabilityRisk = assessToolAvailabilityRisk(alternative, context);
    riskFactors.push(toolAvailabilityRisk);

    // Risk Factor 2: Prerequisite satisfaction
    const prerequisiteRisk = assessPrerequisiteRisk(alternative, context);
    riskFactors.push(prerequisiteRisk);

    // Risk Factor 3: Historical failure patterns
    const historicalRisk = await assessHistoricalRisk(alternative, context);
    if (historicalRisk) {
      riskFactors.push(historicalRisk);
    }

    // Risk Factor 4: Assumption validity
    const assumptionRisk = assessAssumptionRisk(alternative, context);
    riskFactors.push(assumptionRisk);

    // Calculate overall risk score
    let riskScore = 0;
    for (const factor of riskFactors) {
      riskScore += factor.score;
    }

    // Normalize to 0-10 scale (cap at 10)
    riskScore = Math.min(riskScore, 10);

    // Determine risk level
    let riskLevel;
    if (riskScore < riskThresholds.low) {
      riskLevel = 'low';
    } else if (riskScore < riskThresholds.medium) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'high';
    }

    return {
      riskScore,
      riskLevel,
      factors: riskFactors,
      confidence: 0.7, // Moderate confidence in risk assessment
    };
  }

  /**
   * Assess tool availability risk
   */
  function assessToolAvailabilityRisk(alternative, context) {
    const availableTools = new Set(context.availableTools || []);
    const requiredTools = alternative.steps.map(s => s.tool);
    const unavailableTools = requiredTools.filter(tool => !availableTools.has(tool));

    const likelihood = unavailableTools.length / Math.max(requiredTools.length, 1);
    const impact = 8.0; // High impact - execution will fail

    return {
      name: 'tool_availability',
      likelihood,
      impact,
      score: likelihood * impact,
      description: unavailableTools.length > 0
        ? `${unavailableTools.length} tool(s) unavailable: ${unavailableTools.join(', ')}`
        : 'All tools available',
    };
  }

  /**
   * Assess prerequisite satisfaction risk
   */
  function assessPrerequisiteRisk(alternative, context) {
    const prerequisiteCount = alternative.prerequisites?.length || 0;

    // Assume 30% chance that each prerequisite might not be satisfied
    const likelihood = Math.min(prerequisiteCount * 0.3, 1.0);
    const impact = 7.0; // High impact - might fail or need extra setup

    return {
      name: 'prerequisite_satisfaction',
      likelihood,
      impact,
      score: likelihood * impact,
      description: prerequisiteCount > 0
        ? `${prerequisiteCount} prerequisite(s) might not be satisfied`
        : 'No prerequisites required',
    };
  }

  /**
   * Assess historical risk (based on similar past failures)
   */
  async function assessHistoricalRisk(alternative, context) {
    if (!episodicMemory) {
      return null;
    }

    try {
      // Search for similar approaches that failed
      const toolSequence = alternative.steps.map(s => s.tool).join(' ');
      const similarEpisodes = await episodicMemory.search(toolSequence, {
        minSimilarity: 0.6,
        limit: 10,
        successOnly: false,
      });

      if (similarEpisodes.length === 0) {
        return null;
      }

      // Calculate failure rate
      const failures = similarEpisodes.filter(ep => !ep.successful);
      const failureRate = failures.length / similarEpisodes.length;

      const likelihood = failureRate;
      const impact = 6.0; // Moderate-high impact

      return {
        name: 'historical_failure',
        likelihood,
        impact,
        score: likelihood * impact,
        description: `${(failureRate * 100).toFixed(0)}% failure rate in ${similarEpisodes.length} similar task(s)`,
      };
    } catch (err) {
      console.warn('[EffortEstimator] Failed to assess historical risk:', err.message);
      return null;
    }
  }

  /**
   * Assess assumption validity risk
   */
  function assessAssumptionRisk(alternative, context) {
    const assumptionCount = alternative.assumptions?.length || 0;

    // Assume 25% chance that each assumption might be wrong
    const likelihood = Math.min(assumptionCount * 0.25, 1.0);
    const impact = 5.0; // Moderate impact

    return {
      name: 'assumption_validity',
      likelihood,
      impact,
      score: likelihood * impact,
      description: assumptionCount > 0
        ? `${assumptionCount} assumption(s) might be incorrect`
        : 'No assumptions made',
    };
  }

  /**
   * Estimate iterations needed
   */
  async function estimateIterations(alternative, complexity, context) {
    let estimate = baseIterationEstimate;

    // Factor 1: Complexity (higher complexity = more iterations)
    const complexityMultiplier = 1 + (complexity.complexityScore / 10);
    estimate *= complexityMultiplier;

    // Factor 2: Historical data (if available)
    if (episodicMemory) {
      try {
        const historicalEstimate = await getHistoricalIterationEstimate(alternative, context);
        if (historicalEstimate) {
          // Blend historical estimate with complexity-based estimate (70% historical, 30% complexity)
          estimate = historicalEstimate * 0.7 + estimate * 0.3;
        }
      } catch (err) {
        console.warn('[EffortEstimator] Failed to get historical iteration estimate:', err.message);
      }
    }

    // Round and cap
    estimate = Math.round(estimate);
    estimate = Math.min(estimate, maxIterationEstimate);
    estimate = Math.max(estimate, 1); // At least 1 iteration

    return {
      estimate,
      min: Math.max(1, estimate - 2),
      max: Math.min(maxIterationEstimate, estimate + 3),
      confidence: episodicMemory ? 0.75 : 0.5, // Higher confidence with historical data
    };
  }

  /**
   * Get historical iteration estimate from similar tasks
   */
  async function getHistoricalIterationEstimate(alternative, context) {
    if (!episodicMemory) {
      return null;
    }

    try {
      // Search for similar tool sequences
      const toolSequence = alternative.steps.map(s => s.tool).join(' ');
      const similarEpisodes = await episodicMemory.search(toolSequence, {
        minSimilarity: 0.7,
        limit: 5,
        successOnly: true, // Only successful episodes for iteration estimates
      });

      if (similarEpisodes.length === 0) {
        return null;
      }

      // Calculate average iterations
      const totalIterations = similarEpisodes.reduce((sum, ep) => sum + (ep.iterations || 2), 0);
      const averageIterations = totalIterations / similarEpisodes.length;

      console.log(
        `[EffortEstimator] Historical estimate: ${averageIterations.toFixed(1)} iterations (from ${similarEpisodes.length} similar task(s))`
      );

      return averageIterations;
    } catch (err) {
      console.warn('[EffortEstimator] Failed to get historical estimate:', err.message);
      return null;
    }
  }

  /**
   * Create fallback estimate when calculation fails
   */
  function createFallbackEstimate(alternative) {
    return {
      alternativeId: alternative.id,
      alternativeName: alternative.name,
      complexity: {
        complexityScore: 5.0,
        complexityLevel: 'medium',
        factors: [],
        confidence: 0.3,
      },
      risk: {
        riskScore: 5.0,
        riskLevel: 'medium',
        factors: [],
        confidence: 0.3,
      },
      iterations: {
        estimate: baseIterationEstimate,
        min: 1,
        max: baseIterationEstimate + 3,
        confidence: 0.3,
      },
      estimateId: ulid(),
      timestamp: new Date().toISOString(),
      fallback: true,
    };
  }

  return {
    estimateEffort,
    estimateAllEfforts,
  };
}
