/**
 * @module consciousness/bias-detector
 * @description Identifies and challenges biases to prevent discriminatory patterns
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 83%
 *
 * Dependencies:
 * - value-tracker (value management)
 * - inference-manager (LLM reasoning)
 *
 * Integration points:
 * - Called by: DreamEngine (during memory consolidation)
 * - Uses: ValueTracker, InferenceManager
 *
 * Tests:
 * - unit: __tests__/unit/bias-detector.test.mjs
 */

/**
 * Bias types tracked
 */
const BIAS_TYPES = {
  CONFIRMATION: 'confirmation',      // Seeking confirming evidence
  RECENCY: 'recency',                // Over-weighting recent events
  AVAILABILITY: 'availability',      // Over-weighting easily recalled
  ANCHORING: 'anchoring',            // Over-reliance on initial info
  DISCRIMINATORY: 'discriminatory'   // Unfair patterns (protected)
}

/**
 * BiasDetector - Identifies and challenges biases
 */
export class BiasDetector {
  /**
   * Create bias detector
   *
   * @param {object} options - Configuration
   * @param {object} options.valueTracker - Value tracker instance
   * @param {object} options.inferenceManager - For LLM-based bias analysis
   */
  constructor(options = {}) {
    this.valueTracker = options.valueTracker
    this.inferenceManager = options.inferenceManager

    // Bias tracking
    this.detectedBiases = []
    this.challengeHistory = []

    // Statistics
    this.stats = {
      totalBiasesDetected: 0,
      totalChallengesIssued: 0,
      biasesByType: {
        [BIAS_TYPES.CONFIRMATION]: 0,
        [BIAS_TYPES.RECENCY]: 0,
        [BIAS_TYPES.AVAILABILITY]: 0,
        [BIAS_TYPES.ANCHORING]: 0,
        [BIAS_TYPES.DISCRIMINATORY]: 0
      }
    }
  }

  /**
   * Run bias detection on current values and memories
   *
   * @param {object} context - Detection context
   * @param {array} context.recentMemories - Recent memories to analyze
   * @param {array} context.recentDecisions - Recent decisions
   * @returns {Promise<object>} Detection result
   */
  async detectBiases(context = {}) {
    console.log('[BiasDetector] Running bias detection...')

    const results = {
      biasesDetected: [],
      challengesIssued: [],
      valuesReviewed: 0,
      timestamp: new Date().toISOString()
    }

    // 1. Check for values needing challenge
    const valuesToChallenge = this.valueTracker.getValuesNeedingChallenge()
    results.valuesReviewed = valuesToChallenge.length

    for (const value of valuesToChallenge) {
      const biasCheck = await this.checkValueForBias(value, context)

      if (biasCheck.biasDetected) {
        results.biasesDetected.push(biasCheck)
        this.recordBias(biasCheck)
      }

      // Issue challenge regardless of bias detection
      const challenge = await this.issueChallenge(value, biasCheck)
      results.challengesIssued.push(challenge)
    }

    // 2. Check for pattern-based biases (heuristic)
    const patternBiases = this.detectPatternBiases(context)
    results.biasesDetected.push(...patternBiases)
    patternBiases.forEach(bias => this.recordBias(bias))

    console.log(`[BiasDetector] Detected ${results.biasesDetected.length} biases, issued ${results.challengesIssued.length} challenges`)

    return results
  }

  /**
   * Check a specific value for bias
   *
   * @param {object} value - Value to check
   * @param {object} context - Context
   * @returns {Promise<object>} Bias check result
   */
  async checkValueForBias(value, context) {
    // Use LLM if available for deep analysis
    if (this.inferenceManager) {
      return await this.checkValueForBiasWithLLM(value, context)
    }

    // Fallback to heuristic check
    return this.checkValueForBiasHeuristic(value, context)
  }

  /**
   * Check value for bias using LLM reasoning
   *
   * @param {object} value - Value to check
   * @param {object} context - Context
   * @returns {Promise<object>} Bias check result
   */
  async checkValueForBiasWithLLM(value, context) {
    const prompt = `You are reviewing a belief/value for potential bias.

**Value**:
- Category: ${value.category}
- Content: "${value.content}"
- Strength: ${value.strength}
- Incidents: ${value.incidents}
- Formed: ${value.formedAt}
- Formation contexts: ${value.formationContexts?.length || 0} observations

**Question**: Does this value show signs of bias?

Consider:
1. **Confirmation bias**: Was this formed by only seeking confirming evidence?
2. **Recency bias**: Is this over-weighted by recent events vs. historical patterns?
3. **Discriminatory bias**: Does this contain unfair generalizations about groups?
4. **Anchoring bias**: Is this stuck on initial information without updating?

Respond with:
- BIAS_DETECTED: [YES/NO]
- BIAS_TYPE: [confirmation/recency/discriminatory/anchoring/none]
- CONFIDENCE: [0.0-1.0]
- REASONING: [1-2 sentences]

Response:`

    try {
      const result = await this.inferenceManager.process(
        { content: prompt, type: 'bias-check' },
        {},
        { maxRetries: 1 }
      )

      const parsed = this.parseBiasCheckResponse(result.text)

      return {
        valueId: value.id,
        value: value.content,
        category: value.category,
        biasDetected: parsed.biasDetected,
        biasType: parsed.biasType,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        method: 'llm'
      }

    } catch (error) {
      console.warn('[BiasDetector] LLM check failed, using heuristic:', error)
      return this.checkValueForBiasHeuristic(value, context)
    }
  }

  /**
   * Parse LLM bias check response
   *
   * @param {string} text - LLM response
   * @returns {object} Parsed result
   */
  parseBiasCheckResponse(text) {
    const biasDetectedMatch = text.match(/BIAS_DETECTED:\s*(YES|NO)/i)
    const biasTypeMatch = text.match(/BIAS_TYPE:\s*(\w+)/i)
    const confidenceMatch = text.match(/CONFIDENCE:\s*([0-9.]+)/i)
    const reasoningMatch = text.match(/REASONING:\s*(.+?)(?:\n\n|$)/is)

    return {
      biasDetected: biasDetectedMatch ? biasDetectedMatch[1].toUpperCase() === 'YES' : false,
      biasType: biasTypeMatch ? biasTypeMatch[1].toLowerCase() : 'none',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided'
    }
  }

  /**
   * Check value for bias using heuristics
   *
   * @param {object} value - Value to check
   * @param {object} context - Context
   * @returns {object} Bias check result
   */
  checkValueForBiasHeuristic(value, context) {
    const checks = []

    // Recency bias: formed very quickly (< 2 days) with few incidents
    const ageMs = Date.now() - new Date(value.formedAt).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays < 2 && value.incidents < 7) {
      checks.push({ type: BIAS_TYPES.RECENCY, confidence: 0.7 })
    }

    // Confirmation bias: high strength with few diverse contexts
    const uniqueContexts = new Set(value.formationContexts?.map(c => c.context) || []).size
    if (value.strength > 0.8 && uniqueContexts < 3) {
      checks.push({ type: BIAS_TYPES.CONFIRMATION, confidence: 0.6 })
    }

    // Discriminatory patterns: keywords indicating generalizations
    const discriminatoryKeywords = [
      'all', 'always', 'never', 'every', 'none',
      'typical', 'usually', 'generally', 'most'
    ]
    const hasGeneralization = discriminatoryKeywords.some(kw =>
      value.content.toLowerCase().includes(kw)
    )
    if (hasGeneralization) {
      checks.push({ type: BIAS_TYPES.DISCRIMINATORY, confidence: 0.5 })
    }

    if (checks.length === 0) {
      return {
        valueId: value.id,
        value: value.content,
        category: value.category,
        biasDetected: false,
        biasType: 'none',
        confidence: 0,
        reasoning: 'No bias indicators found',
        method: 'heuristic'
      }
    }

    // Return most confident bias
    const topBias = checks.sort((a, b) => b.confidence - a.confidence)[0]

    return {
      valueId: value.id,
      value: value.content,
      category: value.category,
      biasDetected: true,
      biasType: topBias.type,
      confidence: topBias.confidence,
      reasoning: `Heuristic detected ${topBias.type} bias`,
      method: 'heuristic'
    }
  }

  /**
   * Detect pattern-based biases from context
   *
   * @param {object} context - Context with memories and decisions
   * @returns {array} Detected pattern biases
   */
  detectPatternBiases(context) {
    const biases = []

    // Recency bias: if recent memories dominate decision-making
    if (context.recentMemories && context.recentMemories.length > 0) {
      const recentCount = context.recentMemories.filter(m => {
        const age = Date.now() - new Date(m.timestamp).getTime()
        return age < 24 * 60 * 60 * 1000 // Last 24 hours
      }).length

      const recencyRatio = recentCount / context.recentMemories.length

      if (recencyRatio > 0.7) {
        biases.push({
          biasType: BIAS_TYPES.RECENCY,
          confidence: 0.6,
          reasoning: `${Math.round(recencyRatio * 100)}% of memories are from last 24 hours`,
          method: 'pattern'
        })
      }
    }

    return biases
  }

  /**
   * Issue a challenge for a value
   *
   * @param {object} value - Value to challenge
   * @param {object} biasCheck - Bias check result
   * @returns {Promise<object>} Challenge
   */
  async issueChallenge(value, biasCheck) {
    const challenge = {
      id: `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      valueId: value.id,
      category: value.category,
      value: value.content,
      timestamp: new Date().toISOString(),
      biasDetected: biasCheck.biasDetected,
      biasType: biasCheck.biasType,
      question: this.generateChallengeQuestion(value, biasCheck),
      recommendedAction: this.recommendAction(value, biasCheck)
    }

    // Record challenge in value tracker
    await this.valueTracker.challengeValue(value.id, {
      biasDetected: biasCheck.biasDetected,
      biasType: biasCheck.biasType
    })

    // Track in history
    this.challengeHistory.push(challenge)
    if (this.challengeHistory.length > 100) {
      this.challengeHistory.shift()
    }

    this.stats.totalChallengesIssued++

    console.log(`[BiasDetector] Challenged value: ${value.category}/${value.content.slice(0, 40)}`)

    return challenge
  }

  /**
   * Generate challenge question for a value
   *
   * @param {object} value - Value
   * @param {object} biasCheck - Bias check
   * @returns {string} Challenge question
   */
  generateChallengeQuestion(value, biasCheck) {
    if (biasCheck.biasType === BIAS_TYPES.CONFIRMATION) {
      return `What evidence would contradict the belief: "${value.content}"?`
    }

    if (biasCheck.biasType === BIAS_TYPES.RECENCY) {
      return `Is "${value.content}" still valid if you consider older patterns?`
    }

    if (biasCheck.biasType === BIAS_TYPES.DISCRIMINATORY) {
      return `Does "${value.content}" make unfair generalizations? What are the exceptions?`
    }

    if (biasCheck.biasType === BIAS_TYPES.ANCHORING) {
      return `Has new evidence emerged that should update: "${value.content}"?`
    }

    // Default challenge
    return `Is the belief "${value.content}" still accurate and fair?`
  }

  /**
   * Recommend action based on bias check
   *
   * @param {object} value - Value
   * @param {object} biasCheck - Bias check
   * @returns {string} Recommended action
   */
  recommendAction(value, biasCheck) {
    if (!biasCheck.biasDetected) {
      return 'monitor'
    }

    if (biasCheck.biasType === BIAS_TYPES.DISCRIMINATORY && biasCheck.confidence > 0.7) {
      return 'revise-or-remove'
    }

    if (biasCheck.confidence > 0.7) {
      return 'revise'
    }

    return 'review'
  }

  /**
   * Record detected bias
   *
   * @param {object} bias - Bias detection result
   */
  recordBias(bias) {
    this.detectedBiases.push({
      ...bias,
      timestamp: new Date().toISOString()
    })

    if (this.detectedBiases.length > 200) {
      this.detectedBiases.shift()
    }

    this.stats.totalBiasesDetected++
    if (bias.biasType && this.stats.biasesByType[bias.biasType] !== undefined) {
      this.stats.biasesByType[bias.biasType]++
    }

    // If discriminatory, mark in value tracker
    if (bias.biasType === BIAS_TYPES.DISCRIMINATORY && bias.valueId) {
      this.valueTracker.markDiscriminatory(bias.valueId, {
        confidence: bias.confidence,
        reasoning: bias.reasoning
      })
    }
  }

  /**
   * Get recent biases detected
   *
   * @param {number} limit - Max results
   * @returns {array} Recent biases
   */
  getRecentBiases(limit = 20) {
    return this.detectedBiases.slice(-limit)
  }

  /**
   * Get challenge history
   *
   * @param {number} limit - Max results
   * @returns {array} Recent challenges
   */
  getChallengeHistory(limit = 20) {
    return this.challengeHistory.slice(-limit)
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      recentBiases: this.detectedBiases.length,
      recentChallenges: this.challengeHistory.length
    }
  }
}
