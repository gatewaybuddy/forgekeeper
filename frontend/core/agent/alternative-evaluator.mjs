/**
 * Alternative Evaluator - Rank and Select Best Alternative
 *
 * [Phase 6.4] Multi-Criteria Alternative Evaluation
 *
 * Purpose:
 *   Rank alternatives using multi-criteria decision making (MCDM).
 *   Combines complexity, risk, alignment, and confidence scores to
 *   choose the optimal alternative for execution.
 *
 * Key Features:
 *   - Weighted scoring: Effort (40%), Risk (30%), Alignment (30%)
 *   - Score normalization: All metrics scaled to 0-1
 *   - Ranking: Sort by overall score (higher is better)
 *   - Selection: Choose highest-scoring alternative with justification
 *
 * @module frontend/core/agent/alternative-evaluator
 */

import { ulid } from 'ulid';

/**
 * Create an alternative evaluator instance
 *
 * @param {Object} config - Configuration options
 * @returns {Object} Alternative evaluator instance
 */
export function createAlternativeEvaluator(config = {}) {
  // Weights for multi-criteria scoring (must sum to 1.0)
  const weights = config.weights || {
    effort: 0.35,      // 35% weight (inverse - lower effort is better)
    risk: 0.25,        // 25% weight (inverse - lower risk is better)
    alignment: 0.30,   // 30% weight (direct - higher alignment is better)
    confidence: 0.10,  // 10% weight (direct - higher confidence is better)
  };

  // Validate weights sum to 1.0
  const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.01) {
    console.warn(`[AlternativeEvaluator] Weights sum to ${weightSum.toFixed(2)}, not 1.0. Normalizing...`);
    // Normalize weights
    for (const key in weights) {
      weights[key] = weights[key] / weightSum;
    }
  }

  /**
   * Evaluate and rank alternatives
   *
   * @param {Array} alternatives - Alternatives from generator (with confidence)
   * @param {Array} effortEstimates - Effort estimates from estimator
   * @param {Array} alignmentResults - Alignment results from checker
   * @returns {Object} Evaluation result with rankings
   */
  function evaluateAlternatives(alternatives, effortEstimates, alignmentResults) {
    const evaluationId = ulid();
    const startTime = Date.now();

    console.log(`[AlternativeEvaluator] ${evaluationId}: Evaluating ${alternatives.length} alternatives...`);

    // Step 1: Build unified data structure
    const unifiedAlternatives = buildUnifiedData(alternatives, effortEstimates, alignmentResults);

    // Step 2: Normalize scores to 0-1 scale
    const normalized = normalizeScores(unifiedAlternatives);

    // Step 3: Calculate weighted scores
    const scored = calculateWeightedScores(normalized, weights);

    // Step 4: Rank by overall score
    const ranked = rankAlternatives(scored);

    // Step 5: Select best alternative
    const chosen = selectBestAlternative(ranked);

    const elapsedMs = Date.now() - startTime;

    console.log(
      `[AlternativeEvaluator] ${evaluationId}: Best choice: "${chosen.alternative.name}" (score: ${chosen.overall_score.toFixed(2)})`
    );

    return {
      rankedAlternatives: ranked,
      chosen,
      weights,
      evaluationId,
      timestamp: new Date().toISOString(),
      elapsedMs,
    };
  }

  /**
   * Build unified data structure with all metrics
   */
  function buildUnifiedData(alternatives, effortEstimates, alignmentResults) {
    return alternatives.map(alt => {
      // Find corresponding effort estimate
      const effort = effortEstimates.find(e => e.alternativeId === alt.id);

      // Find corresponding alignment result
      const alignment = alignmentResults.find(a => a.alternativeId === alt.id);

      return {
        alternative: alt,
        effort: effort || createDefaultEffort(),
        alignment: alignment || createDefaultAlignment(),
      };
    });
  }

  /**
   * Create default effort estimate (fallback)
   */
  function createDefaultEffort() {
    return {
      complexity: { complexityScore: 5.0 },
      risk: { riskScore: 5.0 },
      iterations: { estimate: 3 },
    };
  }

  /**
   * Create default alignment result (fallback)
   */
  function createDefaultAlignment() {
    return {
      alignmentScore: 0.5,
    };
  }

  /**
   * Normalize scores to 0-1 scale
   *
   * Normalization strategy:
   * - Complexity: 0-10 scale → 0-1 (divide by 10)
   * - Risk: 0-10 scale → 0-1 (divide by 10)
   * - Iterations: min-max normalization across alternatives
   * - Alignment: already 0-1
   * - Confidence: already 0-1
   */
  function normalizeScores(unifiedAlternatives) {
    // Find min/max iterations for normalization
    const iterations = unifiedAlternatives.map(u => u.effort.iterations.estimate);
    const minIterations = Math.min(...iterations);
    const maxIterations = Math.max(...iterations);
    const iterationRange = maxIterations - minIterations || 1; // Avoid divide by zero

    return unifiedAlternatives.map(unified => {
      // Normalize complexity (0-10 → 0-1)
      const normalizedComplexity = unified.effort.complexity.complexityScore / 10;

      // Normalize risk (0-10 → 0-1)
      const normalizedRisk = unified.effort.risk.riskScore / 10;

      // Normalize iterations (min-max normalization)
      const normalizedIterations = (unified.effort.iterations.estimate - minIterations) / iterationRange;

      // Combine effort metrics (weighted average of complexity, risk, iterations)
      const effortScore = (normalizedComplexity * 0.4) + (normalizedRisk * 0.4) + (normalizedIterations * 0.2);

      // Alignment already 0-1
      const alignmentScore = unified.alignment.alignmentScore;

      // Confidence already 0-1
      const confidenceScore = unified.alternative.confidence || 0.5;

      return {
        ...unified,
        normalized: {
          effort: effortScore,          // 0-1 (lower is better)
          risk: normalizedRisk,         // 0-1 (lower is better)
          alignment: alignmentScore,    // 0-1 (higher is better)
          confidence: confidenceScore,  // 0-1 (higher is better)
        },
      };
    });
  }

  /**
   * Calculate weighted scores
   *
   * Overall Score = (1 - effort) * weight_effort +
   *                 (1 - risk) * weight_risk +
   *                 alignment * weight_alignment +
   *                 confidence * weight_confidence
   *
   * Note: Effort and risk are inverted (lower is better)
   */
  function calculateWeightedScores(normalized, weights) {
    return normalized.map(item => {
      const effortContribution = (1 - item.normalized.effort) * weights.effort;
      const riskContribution = (1 - item.normalized.risk) * weights.risk;
      const alignmentContribution = item.normalized.alignment * weights.alignment;
      const confidenceContribution = item.normalized.confidence * weights.confidence;

      const overallScore = effortContribution + riskContribution + alignmentContribution + confidenceContribution;

      return {
        ...item,
        scores: {
          effort: effortContribution,
          risk: riskContribution,
          alignment: alignmentContribution,
          confidence: confidenceContribution,
          overall: overallScore,
        },
      };
    });
  }

  /**
   * Rank alternatives by overall score (descending)
   */
  function rankAlternatives(scored) {
    // Sort by overall score (highest first)
    const sorted = [...scored].sort((a, b) => b.scores.overall - a.scores.overall);

    // Assign ranks
    return sorted.map((item, index) => ({
      rank: index + 1,
      alternativeId: item.alternative.id,
      alternativeName: item.alternative.name,
      overall_score: item.scores.overall,
      score_breakdown: {
        effort: item.scores.effort,
        risk: item.scores.risk,
        alignment: item.scores.alignment,
        confidence: item.scores.confidence,
      },
      raw_metrics: {
        complexity: item.effort.complexity.complexityScore,
        complexityLevel: item.effort.complexity.complexityLevel,
        risk: item.effort.risk.riskScore,
        riskLevel: item.effort.risk.riskLevel,
        iterations: item.effort.iterations.estimate,
        alignment: item.alignment.alignmentScore,
        alignmentRelevance: item.alignment.relevance,
        confidence: item.alternative.confidence,
      },
      alternative: item.alternative,
    }));
  }

  /**
   * Select best alternative with justification
   */
  function selectBestAlternative(ranked) {
    if (ranked.length === 0) {
      throw new Error('No alternatives to evaluate');
    }

    const best = ranked[0]; // Highest-ranked
    const justification = buildJustification(best, ranked);

    return {
      ...best,
      justification,
      chosen: true,
    };
  }

  /**
   * Build justification for why this alternative was chosen
   */
  function buildJustification(chosen, allRanked) {
    const reasons = [];

    // Reason 1: Overall score
    reasons.push(`Highest overall score (${chosen.overall_score.toFixed(2)})`);

    // Reason 2: Specific strengths
    const breakdown = chosen.score_breakdown;
    const strengths = [];

    if (breakdown.alignment >= 0.25) {
      strengths.push(`strong goal alignment (${chosen.raw_metrics.alignmentRelevance})`);
    }

    if (breakdown.effort >= 0.28) {
      strengths.push(`low effort (${chosen.raw_metrics.complexityLevel} complexity)`);
    }

    if (breakdown.risk >= 0.20) {
      strengths.push(`low risk (${chosen.raw_metrics.riskLevel} risk)`);
    }

    if (breakdown.confidence >= 0.08) {
      strengths.push(`high confidence (${(chosen.raw_metrics.confidence * 100).toFixed(0)}%)`);
    }

    if (strengths.length > 0) {
      reasons.push(`Key strengths: ${strengths.join(', ')}`);
    }

    // Reason 3: Comparison with next best (if exists)
    if (allRanked.length > 1) {
      const nextBest = allRanked[1];
      const scoreDiff = chosen.overall_score - nextBest.overall_score;
      const percentBetter = (scoreDiff / nextBest.overall_score) * 100;

      reasons.push(`${percentBetter.toFixed(0)}% better than next alternative ("${nextBest.alternativeName}")`);
    }

    // Reason 4: Estimated iterations
    reasons.push(`Estimated completion: ${chosen.raw_metrics.iterations} iteration(s)`);

    return reasons.join('. ');
  }

  return {
    evaluateAlternatives,
  };
}
