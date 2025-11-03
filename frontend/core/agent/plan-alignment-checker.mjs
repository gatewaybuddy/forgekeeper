/**
 * Plan Alignment Checker - Evaluate Goal Relevance of Alternatives
 *
 * [Phase 6.3] Plan Alignment Checking
 *
 * Purpose:
 *   Evaluate how well each alternative aligns with the overall goal.
 *   Prevents the agent from pursuing actions that don't contribute to
 *   the main objective, even if they're technically feasible.
 *
 * Key Features:
 *   - Alignment scoring (0-1): relevance to overall goal
 *   - Goal decomposition: break complex goals into subgoals
 *   - Contribution evaluation: does this action help?
 *   - LLM-powered semantic analysis (optional)
 *
 * @module frontend/core/agent/plan-alignment-checker
 */

import { ulid } from 'ulid';

/**
 * Create a plan alignment checker instance
 *
 * @param {Object} llmClient - LLM client for semantic analysis (optional)
 * @param {string} model - Model to use for LLM analysis
 * @param {Object} config - Configuration options
 * @returns {Object} Plan alignment checker instance
 */
export function createPlanAlignmentChecker(llmClient = null, model = 'core', config = {}) {
  const useLLM = config.useLLM !== false && llmClient !== null;
  const temperature = config.temperature || 0.2; // Low temperature for deterministic alignment
  const maxTokens = config.maxTokens || 500;
  const alignmentThresholds = config.alignmentThresholds || {
    low: 0.3,
    medium: 0.6,
    high: 1.0,
  };

  /**
   * Check alignment for a single alternative
   *
   * @param {Object} alternative - Alternative from generator
   * @param {Object} context - Execution context with overall goal
   * @returns {Promise<Object>} Alignment result
   */
  async function checkAlignment(alternative, context) {
    const checkId = ulid();
    const startTime = Date.now();

    console.log(`[PlanAlignmentChecker] ${checkId}: Checking alignment for: "${alternative.name}"`);

    let alignmentScore;
    let reasoning;
    let contribution;
    let relevance;
    let actualMethod = 'heuristic'; // Track actual method used

    // Use LLM for semantic alignment analysis if available
    if (useLLM) {
      try {
        const llmResult = await checkAlignmentWithLLM(alternative, context);
        alignmentScore = llmResult.alignmentScore;
        reasoning = llmResult.reasoning;
        contribution = llmResult.contribution;
        relevance = llmResult.relevance;
        actualMethod = 'llm';
      } catch (err) {
        console.warn(`[PlanAlignmentChecker] ${checkId}: LLM alignment check failed, using heuristics:`, err.message);
        const heuristicResult = checkAlignmentHeuristic(alternative, context);
        alignmentScore = heuristicResult.alignmentScore;
        reasoning = heuristicResult.reasoning;
        contribution = heuristicResult.contribution;
        relevance = heuristicResult.relevance;
        actualMethod = 'heuristic'; // Explicitly set to heuristic after fallback
      }
    } else {
      // Use heuristic-based alignment
      const heuristicResult = checkAlignmentHeuristic(alternative, context);
      alignmentScore = heuristicResult.alignmentScore;
      reasoning = heuristicResult.reasoning;
      contribution = heuristicResult.contribution;
      relevance = heuristicResult.relevance;
      actualMethod = 'heuristic';
    }

    const elapsedMs = Date.now() - startTime;

    console.log(
      `[PlanAlignmentChecker] ${checkId}: Alignment=${alignmentScore.toFixed(2)} (${relevance})`
    );

    return {
      alternativeId: alternative.id,
      alternativeName: alternative.name,
      alignmentScore,
      relevance,
      contribution,
      reasoning,
      checkId,
      timestamp: new Date().toISOString(),
      elapsedMs,
      method: actualMethod,
    };
  }

  /**
   * Check alignment for all alternatives
   *
   * @param {Array} alternatives - Array of alternatives
   * @param {Object} context - Execution context
   * @returns {Promise<Array>} Array of alignment results
   */
  async function checkAllAlignments(alternatives, context) {
    console.log(`[PlanAlignmentChecker] Checking alignment for ${alternatives.length} alternatives...`);

    const results = [];
    for (const alternative of alternatives) {
      try {
        const result = await checkAlignment(alternative, context);
        results.push(result);
      } catch (error) {
        console.warn(`[PlanAlignmentChecker] Failed to check alignment for "${alternative.name}":`, error.message);
        // Add fallback result
        results.push(createFallbackAlignment(alternative));
      }
    }

    return results;
  }

  /**
   * Check alignment using LLM semantic analysis
   */
  async function checkAlignmentWithLLM(alternative, context) {
    const prompt = buildAlignmentPrompt(alternative, context);

    const response = await llmClient.chat({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an alignment checker. Evaluate how well an action aligns with an overall goal.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'alignment',
          strict: true,
          schema: getAlignmentSchema()
        }
      }
    });

    const result = JSON.parse(response.choices[0].message.content);

    return {
      alignmentScore: result.alignmentScore,
      relevance: determineRelevanceLevel(result.alignmentScore),
      contribution: result.contribution,
      reasoning: result.reasoning,
    };
  }

  /**
   * Build prompt for LLM alignment check
   */
  function buildAlignmentPrompt(alternative, context) {
    return `# Evaluate Alignment

**Overall Goal**: ${context.taskGoal || 'Not specified'}

**Proposed Action**: ${alternative.name}
**Description**: ${alternative.description}
**Steps**: ${alternative.steps.map((s, i) => `${i + 1}. ${s.description || s.tool}`).join(', ')}

## Your Task

Evaluate how well this action aligns with the overall goal.

**Questions to consider**:
1. Does this action directly support the goal?
2. Is this a necessary prerequisite for the goal?
3. Does this action move us closer to completion?
4. Or is this action tangential or unrelated?

**Alignment Score** (0.0-1.0):
- 1.0 = Directly achieves the goal
- 0.8 = Critical prerequisite or major step toward goal
- 0.6 = Helpful but not essential
- 0.4 = Tangentially related
- 0.2 = Weakly related
- 0.0 = Unrelated or counterproductive

Provide:
1. **alignmentScore**: 0.0-1.0 score
2. **contribution**: Brief description of how this contributes (or doesn't)
3. **reasoning**: Explanation of your alignment score

Be objective and critical. Don't give high scores just to be nice.`;
  }

  /**
   * Get JSON schema for alignment response
   */
  function getAlignmentSchema() {
    return {
      type: 'object',
      properties: {
        alignmentScore: {
          type: 'number',
          minimum: 0.0,
          maximum: 1.0,
          description: 'Alignment score from 0.0 (unrelated) to 1.0 (directly achieves goal)'
        },
        contribution: {
          type: 'string',
          description: 'Brief description of how this action contributes to the goal'
        },
        reasoning: {
          type: 'string',
          description: 'Explanation of the alignment score'
        }
      },
      required: ['alignmentScore', 'contribution', 'reasoning'],
      additionalProperties: false
    };
  }

  /**
   * Check alignment using heuristics (keyword matching, action type detection)
   */
  function checkAlignmentHeuristic(alternative, context) {
    const goal = (context.taskGoal || '').toLowerCase();
    const actionName = (alternative.name || '').toLowerCase();
    const actionDesc = (alternative.description || '').toLowerCase();
    const actionText = `${actionName} ${actionDesc}`;

    let alignmentScore = 0.5; // Default: medium alignment
    let contribution = 'Action may contribute to the goal';
    let reasoning = 'Heuristic-based alignment check';

    // Extract keywords from goal
    const goalKeywords = extractKeywords(goal);
    const actionKeywords = extractKeywords(actionText);

    // Calculate keyword overlap
    const overlap = goalKeywords.filter(kw => actionKeywords.includes(kw));
    const overlapRatio = goalKeywords.length > 0 ? overlap.length / goalKeywords.length : 0;

    // Heuristic 1: Keyword overlap
    alignmentScore = 0.3 + (overlapRatio * 0.5); // 0.3 base + up to 0.5 from overlap

    // Heuristic 2: Action type alignment
    const actionTypeBonus = calculateActionTypeAlignment(goal, actionText);
    alignmentScore += actionTypeBonus;

    // Heuristic 3: Prerequisite detection
    const prerequisiteBonus = calculatePrerequisiteAlignment(alternative, context);
    alignmentScore += prerequisiteBonus;

    // Cap at 1.0
    alignmentScore = Math.min(alignmentScore, 1.0);

    // Determine contribution and reasoning
    if (alignmentScore >= 0.8) {
      contribution = 'Directly supports the goal';
      reasoning = `Strong keyword overlap (${overlap.length}/${goalKeywords.length} keywords) and action type alignment`;
    } else if (alignmentScore >= 0.6) {
      contribution = 'Contributes to the goal';
      reasoning = `Moderate keyword overlap (${overlap.length}/${goalKeywords.length} keywords)`;
    } else if (alignmentScore >= 0.4) {
      contribution = 'May indirectly help the goal';
      reasoning = `Low keyword overlap (${overlap.length}/${goalKeywords.length} keywords)`;
    } else {
      contribution = 'Unclear contribution to goal';
      reasoning = `Minimal keyword overlap (${overlap.length}/${goalKeywords.length} keywords)`;
    }

    return {
      alignmentScore,
      relevance: determineRelevanceLevel(alignmentScore),
      contribution,
      reasoning,
    };
  }

  /**
   * Extract meaningful keywords from text
   */
  function extractKeywords(text) {
    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculate alignment bonus based on action type matching
   */
  function calculateActionTypeAlignment(goal, actionText) {
    let bonus = 0;

    // Common goal-action patterns
    const patterns = [
      { goalPattern: /install|setup|configure/, actionPattern: /install|setup|configure/, bonus: 0.2 },
      { goalPattern: /test|verify|check/, actionPattern: /test|verify|check/, bonus: 0.2 },
      { goalPattern: /build|compile|package/, actionPattern: /build|compile|package/, bonus: 0.2 },
      { goalPattern: /deploy|release|publish/, actionPattern: /deploy|release|publish/, bonus: 0.2 },
      { goalPattern: /clone|download|fetch/, actionPattern: /clone|download|fetch/, bonus: 0.2 },
      { goalPattern: /create|write|generate/, actionPattern: /create|write|generate/, bonus: 0.2 },
      { goalPattern: /read|list|show/, actionPattern: /read|list|show/, bonus: 0.1 },
      { goalPattern: /fix|repair|resolve/, actionPattern: /fix|repair|resolve/, bonus: 0.2 },
    ];

    for (const pattern of patterns) {
      if (pattern.goalPattern.test(goal) && pattern.actionPattern.test(actionText)) {
        bonus += pattern.bonus;
        break; // Only one bonus
      }
    }

    return bonus;
  }

  /**
   * Calculate alignment bonus for prerequisite actions
   */
  function calculatePrerequisiteAlignment(alternative, context) {
    // If action has prerequisites, it's likely a foundational step
    const prerequisiteCount = alternative.prerequisites?.length || 0;

    // Actions with prerequisites are often necessary setup steps
    if (prerequisiteCount > 0) {
      return 0.1; // Small bonus for prerequisite actions
    }

    return 0;
  }

  /**
   * Determine relevance level from alignment score
   */
  function determineRelevanceLevel(score) {
    if (score >= alignmentThresholds.medium) {
      return 'high';
    } else if (score >= alignmentThresholds.low) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Create fallback alignment when checking fails
   */
  function createFallbackAlignment(alternative) {
    return {
      alternativeId: alternative.id,
      alternativeName: alternative.name,
      alignmentScore: 0.5, // Neutral
      relevance: 'medium',
      contribution: 'Unable to determine alignment',
      reasoning: 'Alignment check failed, using neutral score',
      checkId: ulid(),
      timestamp: new Date().toISOString(),
      fallback: true,
      method: 'fallback',
    };
  }

  return {
    checkAlignment,
    checkAllAlignments,
  };
}
