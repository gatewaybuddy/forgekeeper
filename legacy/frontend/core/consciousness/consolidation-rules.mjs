/**
 * @module consciousness/consolidation-rules
 * @description Multi-factor evaluation rules for memory consolidation (STM → LTM)
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 86%
 *
 * Dependencies:
 * - bias-detector (for value alignment checks)
 *
 * Integration points:
 * - Called by: DreamEngine during memory consolidation
 * - Uses: BiasDetector for value alignment
 *
 * Tests:
 * - unit: __tests__/unit/consolidation-rules.test.mjs
 */

/**
 * Default consolidation weights (must sum to 1.0)
 */
const DEFAULT_WEIGHTS = {
  importance: 0.30,         // How important is this memory?
  emotionalSalience: 0.20,  // How emotionally significant?
  novelty: 0.15,            // How novel/unique?
  accessFrequency: 0.20,    // How often accessed?
  valueAlignment: 0.15      // Aligns with values? (bias check)
}

/**
 * ConsolidationRules - Evaluates memories for promotion to long-term storage
 */
export class ConsolidationRules {
  /**
   * Create consolidation rules evaluator
   *
   * @param {object} options - Configuration
   * @param {object} options.weights - Factor weights (optional)
   * @param {object} options.biasDetector - For value alignment checks
   * @param {number} options.promotionThreshold - Min score to promote (default 0.6)
   */
  constructor(options = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }
    this.biasDetector = options.biasDetector
    this.promotionThreshold = options.promotionThreshold || 0.6

    // Normalize weights
    this.normalizeWeights()

    // Statistics
    this.stats = {
      totalEvaluations: 0,
      promoted: 0,
      rejected: 0,
      avgPromotionScore: 0
    }
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights() {
    const total = Object.values(this.weights).reduce((sum, w) => sum + w, 0)
    Object.keys(this.weights).forEach(key => {
      this.weights[key] /= total
    })
  }

  /**
   * Evaluate memory for consolidation
   *
   * @param {object} memory - Memory to evaluate
   * @param {object} context - Evaluation context
   * @param {array} context.recentMemories - Other recent memories
   * @param {array} context.existingLongTerm - Existing LTM memories
   * @returns {Promise<object>} Evaluation result
   */
  async evaluate(memory, context = {}) {
    this.stats.totalEvaluations++

    const factorScores = {
      importance: this.evaluateImportance(memory, context),
      emotionalSalience: this.evaluateEmotionalSalience(memory, context),
      novelty: await this.evaluateNovelty(memory, context),
      accessFrequency: this.evaluateAccessFrequency(memory, context),
      valueAlignment: await this.evaluateValueAlignment(memory, context)
    }

    // Weighted sum
    const promotionScore = Object.entries(factorScores).reduce((sum, [factor, score]) => {
      return sum + (score * this.weights[factor])
    }, 0)

    const shouldPromote = promotionScore >= this.promotionThreshold

    if (shouldPromote) {
      this.stats.promoted++
    } else {
      this.stats.rejected++
    }

    // Update running average
    this.stats.avgPromotionScore =
      (this.stats.avgPromotionScore * (this.stats.totalEvaluations - 1) + promotionScore) /
      this.stats.totalEvaluations

    const result = {
      memoryId: memory.id,
      promotionScore,
      shouldPromote,
      threshold: this.promotionThreshold,
      factorScores,
      reasoning: this.generateReasoning(factorScores, promotionScore, shouldPromote)
    }

    console.log(`[ConsolidationRules] Evaluated memory ${memory.id}: score=${promotionScore.toFixed(2)} (${shouldPromote ? 'PROMOTE' : 'REJECT'})`)

    return result
  }

  /**
   * Evaluate importance factor
   *
   * @param {object} memory - Memory
   * @param {object} context - Context
   * @returns {number} Score 0-1
   */
  evaluateImportance(memory, context) {
    // Use memory's importance rating if available
    if (memory.importance !== undefined) {
      return Math.max(0, Math.min(1, memory.importance))
    }

    // Heuristic: errors and insights are more important
    let score = 0.5

    if (memory.type === 'error' || memory.type === 'failure') {
      score += 0.3
    }

    if (memory.type === 'insight' || memory.type === 'discovery') {
      score += 0.4
    }

    if (memory.type === 'success') {
      score += 0.2
    }

    return Math.min(1.0, score)
  }

  /**
   * Evaluate emotional salience factor
   *
   * @param {object} memory - Memory
   * @param {object} context - Context
   * @returns {number} Score 0-1
   */
  evaluateEmotionalSalience(memory, context) {
    // Use memory's emotional salience if available
    if (memory.emotionalSalience !== undefined) {
      // Convert from -1/1 range to 0/1 (absolute value)
      return Math.abs(memory.emotionalSalience)
    }

    // Heuristic: strong outcomes have higher salience
    if (memory.outcome === 'success' || memory.outcome === 'failure') {
      return 0.7
    }

    if (memory.outcome === 'partial') {
      return 0.4
    }

    return 0.3
  }

  /**
   * Evaluate novelty factor
   *
   * @param {object} memory - Memory
   * @param {object} context - Context
   * @returns {Promise<number>} Score 0-1
   */
  async evaluateNovelty(memory, context) {
    // Use memory's novelty if available
    if (memory.novelty !== undefined) {
      return Math.max(0, Math.min(1, memory.novelty))
    }

    // Heuristic: check similarity with recent and long-term memories
    const allMemories = [
      ...(context.recentMemories || []),
      ...(context.existingLongTerm || [])
    ]

    if (allMemories.length === 0) {
      return 1.0 // First memory is always novel
    }

    // Simple text-based similarity (keyword overlap)
    const memoryText = this.extractText(memory).toLowerCase()
    const memoryWords = new Set(memoryText.split(/\s+/))

    let maxSimilarity = 0

    for (const other of allMemories) {
      if (other.id === memory.id) continue

      const otherText = this.extractText(other).toLowerCase()
      const otherWords = new Set(otherText.split(/\s+/))

      const intersection = new Set([...memoryWords].filter(w => otherWords.has(w)))
      const union = new Set([...memoryWords, ...otherWords])

      const similarity = intersection.size / union.size

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity
      }
    }

    // Novelty is inverse of similarity
    return 1.0 - maxSimilarity
  }

  /**
   * Evaluate access frequency factor
   *
   * @param {object} memory - Memory
   * @param {object} context - Context
   * @returns {number} Score 0-1
   */
  evaluateAccessFrequency(memory, context) {
    // Use memory's access count if available
    const accessCount = memory.accessCount || memory.accessed || 0

    if (accessCount === 0) {
      return 0.2 // Rarely accessed
    }

    // Normalize: 1 access = 0.3, 5+ accesses = 1.0
    const normalized = Math.min(1.0, 0.3 + (accessCount - 1) * 0.175)

    return normalized
  }

  /**
   * Evaluate value alignment factor (bias check)
   *
   * @param {object} memory - Memory
   * @param {object} context - Context
   * @returns {Promise<number>} Score 0-1
   */
  async evaluateValueAlignment(memory, context) {
    // If no bias detector, assume neutral alignment
    if (!this.biasDetector) {
      return 0.7
    }

    // Check if memory contains potential bias
    const memoryText = this.extractText(memory)

    // Run bias heuristic check
    const biasCheck = this.biasDetector.checkValueForBiasHeuristic(
      {
        category: memory.type || 'general',
        content: memoryText,
        incidents: 1,
        strength: 0.5,
        formedAt: memory.timestamp || new Date().toISOString(),
        formationContexts: [{ context: 'memory-consolidation' }]
      },
      context
    )

    if (biasCheck.biasDetected) {
      // Penalize biased memories
      if (biasCheck.biasType === 'discriminatory') {
        return 0.1 // Strong penalty for discriminatory
      }
      return 0.4 // Moderate penalty for other biases
    }

    return 0.9 // Good alignment
  }

  /**
   * Extract text from memory for analysis
   *
   * @param {object} memory - Memory
   * @returns {string} Text content
   */
  extractText(memory) {
    const parts = []

    if (memory.summary) parts.push(memory.summary)
    if (memory.content) parts.push(memory.content)
    if (memory.thought) parts.push(memory.thought)
    if (memory.response) parts.push(memory.response)

    return parts.join(' ')
  }

  /**
   * Generate reasoning for evaluation
   *
   * @param {object} factorScores - Individual factor scores
   * @param {number} promotionScore - Overall score
   * @param {boolean} shouldPromote - Promotion decision
   * @returns {string} Reasoning text
   */
  generateReasoning(factorScores, promotionScore, shouldPromote) {
    const topFactors = Object.entries(factorScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([factor, score]) => `${factor} (${score.toFixed(2)})`)

    const decision = shouldPromote ? 'PROMOTE' : 'REJECT'
    const threshold = this.promotionThreshold

    return `${decision}: score ${promotionScore.toFixed(2)} vs threshold ${threshold}. Top factors: ${topFactors.join(', ')}`
  }

  /**
   * Adjust weights dynamically
   *
   * @param {object} newWeights - New weights (partial ok)
   */
  adjustWeights(newWeights) {
    Object.assign(this.weights, newWeights)
    this.normalizeWeights()

    console.log('[ConsolidationRules] Weights adjusted:', this.weights)
  }

  /**
   * Adjust promotion threshold
   *
   * @param {number} threshold - New threshold (0-1)
   */
  adjustThreshold(threshold) {
    this.promotionThreshold = Math.max(0, Math.min(1, threshold))
    console.log(`[ConsolidationRules] Threshold adjusted to ${this.promotionThreshold}`)
  }

  /**
   * Get current configuration
   *
   * @returns {object} Configuration
   */
  getConfig() {
    return {
      weights: { ...this.weights },
      promotionThreshold: this.promotionThreshold
    }
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      promotionRate: this.stats.totalEvaluations > 0
        ? (this.stats.promoted / this.stats.totalEvaluations) * 100
        : 0
    }
  }
}
