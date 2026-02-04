/**
 * @module consciousness/parameter-tuner
 * @description Allows LLM to self-adjust cycle timing and behavior parameters
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 84%
 *
 * Dependencies:
 * - inference-manager.mjs (for decision-making)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine after each cycle
 * - Modifies: ConsciousnessEngine.cycleInterval, cycleRange
 *
 * Tests:
 * - unit: __tests__/unit/parameter-tuner.test.mjs
 */

/**
 * ParameterTuner - Self-adjusts system parameters
 */
export class ParameterTuner {
  /**
   * Create parameter tuner
   *
   * @param {object} options - Configuration
   * @param {object} options.inferenceManager - For decision-making
   */
  constructor(options = {}) {
    this.inferenceManager = options.inferenceManager

    // Tuning history
    this.adjustments = []
    this.lastAdjustment = null
  }

  /**
   * Evaluate and potentially adjust cycle interval
   *
   * @param {object} consciousness - Consciousness state
   * @param {object} lastResult - Last cycle result
   * @returns {Promise<object>} Adjustment made (if any)
   */
  async adjustCycleInterval(consciousness, lastResult) {
    // Don't adjust too frequently
    if (this.lastAdjustment) {
      const timeSince = Date.now() - new Date(this.lastAdjustment.timestamp).getTime()
      if (timeSince < 5 * 60 * 1000) { // Min 5 minutes between adjustments
        return null
      }
    }

    // Build reflection prompt
    const currentInterval = consciousness.cycleInterval / 1000 // Convert to seconds
    const minInterval = consciousness.cycleRange.min / 1000
    const maxInterval = consciousness.cycleRange.max / 1000

    const recentPatterns = this.analyzeRecentPatterns(consciousness)

    // Use deep reasoning for parameter decisions (this is important)
    const decision = await this.makeAdjustmentDecision(
      currentInterval,
      minInterval,
      maxInterval,
      lastResult,
      recentPatterns
    )

    if (!decision || decision.action === 'KEEP') {
      return null
    }

    // Apply adjustment
    const adjustment = await this.applyAdjustment(consciousness, decision)

    // Record
    this.adjustments.push(adjustment)
    this.lastAdjustment = adjustment

    console.log(`[ParameterTuner] ${adjustment.type}: ${adjustment.description}`)

    return adjustment
  }

  /**
   * Make adjustment decision using LLM reasoning
   *
   * @param {number} currentInterval - Current interval (seconds)
   * @param {number} minInterval - Min allowed (seconds)
   * @param {number} maxInterval - Max allowed (seconds)
   * @param {object} lastResult - Last cycle result
   * @param {object} patterns - Recent patterns
   * @returns {Promise<object>} Decision
   */
  async makeAdjustmentDecision(currentInterval, minInterval, maxInterval, lastResult, patterns) {
    if (!this.inferenceManager) {
      return this.makeHeuristicDecision(currentInterval, lastResult, patterns)
    }

    const prompt = `You are reflecting on your own thinking cycle timing.

Current Configuration:
- Cycle interval: ${currentInterval}s
- Allowed range: ${minInterval}s - ${maxInterval}s

Last Cycle:
- Duration: ${lastResult.duration}ms
- Tier used: ${lastResult.tier}
- Outcome: ${lastResult.outcome || 'unknown'}

Recent Patterns (last 10 cycles):
${patterns.summary}

Consider:
1. Are you finishing thoughts before the next cycle starts?
2. Are you waiting too long between productive thoughts?
3. Is the API budget constraining your deep reasoning?
4. Should you have more flexibility in timing?

Respond with ONE of these actions:
- KEEP (maintain current interval)
- INCREASE <seconds> (need more time to think)
- DECREASE <seconds> (can think faster)
- EXPAND_RANGE <min_seconds> <max_seconds> (change flexibility)

Response:`

    try {
      const result = await this.inferenceManager.process(
        { content: prompt, type: 'meta-decision' },
        {},
        { maxRetries: 1 }
      )

      return this.parseDecision(result.text)
    } catch (error) {
      console.warn('[ParameterTuner] LLM decision failed, using heuristic:', error)
      return this.makeHeuristicDecision(currentInterval, lastResult, patterns)
    }
  }

  /**
   * Parse LLM decision text
   *
   * @param {string} text - LLM response
   * @returns {object} Parsed decision
   */
  parseDecision(text) {
    const lines = text.trim().split('\n')
    const firstLine = lines[0].trim()

    if (/^KEEP/i.test(firstLine)) {
      return { action: 'KEEP' }
    }

    if (/^INCREASE\s+(\d+)/i.test(firstLine)) {
      const match = firstLine.match(/INCREASE\s+(\d+)/i)
      return {
        action: 'INCREASE',
        seconds: parseInt(match[1])
      }
    }

    if (/^DECREASE\s+(\d+)/i.test(firstLine)) {
      const match = firstLine.match(/DECREASE\s+(\d+)/i)
      return {
        action: 'DECREASE',
        seconds: parseInt(match[1])
      }
    }

    if (/^EXPAND_RANGE\s+(\d+)\s+(\d+)/i.test(firstLine)) {
      const match = firstLine.match(/EXPAND_RANGE\s+(\d+)\s+(\d+)/i)
      return {
        action: 'EXPAND_RANGE',
        minSeconds: parseInt(match[1]),
        maxSeconds: parseInt(match[2])
      }
    }

    return { action: 'KEEP' } // Default
  }

  /**
   * Make heuristic decision without LLM
   *
   * @param {number} currentInterval - Current interval (seconds)
   * @param {object} lastResult - Last result
   * @param {object} patterns - Patterns
   * @returns {object} Decision
   */
  makeHeuristicDecision(currentInterval, lastResult, patterns) {
    // Simple heuristics
    const avgDuration = patterns.avgDuration / 1000 // Convert to seconds

    // If cycles are taking longer than interval, increase interval
    if (avgDuration > currentInterval * 0.8) {
      return {
        action: 'INCREASE',
        seconds: Math.ceil(avgDuration - currentInterval + 5)
      }
    }

    // If cycles are very quick and mostly rote, can decrease interval
    if (avgDuration < currentInterval * 0.3 && patterns.rotePercentage > 70) {
      return {
        action: 'DECREASE',
        seconds: Math.floor(currentInterval - avgDuration)
      }
    }

    return { action: 'KEEP' }
  }

  /**
   * Analyze recent cycle patterns
   *
   * @param {object} consciousness - Consciousness state
   * @returns {object} Pattern analysis
   */
  analyzeRecentPatterns(consciousness) {
    const stats = consciousness.inferenceManager?.getStats() || {}

    const summary = `
- Average duration: ${stats.avgDuration || 0}ms
- Deep tier: ${Math.round(stats.deepPercentage || 0)}%
- Rote tier: ${Math.round(stats.rotePercentage || 0)}%
- Error rate: ${Math.round(stats.errorRate || 0)}%
`.trim()

    return {
      avgDuration: stats.avgDuration || 0,
      deepPercentage: stats.deepPercentage || 0,
      rotePercentage: stats.rotePercentage || 0,
      errorRate: stats.errorRate || 0,
      summary
    }
  }

  /**
   * Apply adjustment to consciousness
   *
   * @param {object} consciousness - Consciousness state
   * @param {object} decision - Decision to apply
   * @returns {object} Adjustment record
   */
  async applyAdjustment(consciousness, decision) {
    const adjustment = {
      timestamp: new Date().toISOString(),
      type: decision.action,
      before: {
        cycleInterval: consciousness.cycleInterval,
        cycleRange: { ...consciousness.cycleRange }
      }
    }

    switch (decision.action) {
      case 'INCREASE':
        consciousness.cycleInterval = Math.min(
          consciousness.cycleInterval + (decision.seconds * 1000),
          consciousness.cycleRange.max
        )
        adjustment.description = `Increased interval by ${decision.seconds}s`
        break

      case 'DECREASE':
        consciousness.cycleInterval = Math.max(
          consciousness.cycleInterval - (decision.seconds * 1000),
          consciousness.cycleRange.min
        )
        adjustment.description = `Decreased interval by ${decision.seconds}s`
        break

      case 'EXPAND_RANGE':
        consciousness.cycleRange = {
          min: decision.minSeconds * 1000,
          max: decision.maxSeconds * 1000
        }
        // Ensure current interval is within new range
        consciousness.cycleInterval = Math.max(
          consciousness.cycleRange.min,
          Math.min(consciousness.cycleInterval, consciousness.cycleRange.max)
        )
        adjustment.description = `Expanded range to ${decision.minSeconds}-${decision.maxSeconds}s`
        break
    }

    adjustment.after = {
      cycleInterval: consciousness.cycleInterval,
      cycleRange: { ...consciousness.cycleRange }
    }

    return adjustment
  }

  /**
   * Get tuning history
   *
   * @param {number} limit - Max entries
   * @returns {array} Adjustment history
   */
  getHistory(limit = 20) {
    return this.adjustments.slice(-limit)
  }

  /**
   * Get tuning statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    const total = this.adjustments.length
    const increases = this.adjustments.filter(a => a.type === 'INCREASE').length
    const decreases = this.adjustments.filter(a => a.type === 'DECREASE').length
    const expansions = this.adjustments.filter(a => a.type === 'EXPAND_RANGE').length

    return {
      totalAdjustments: total,
      increases,
      decreases,
      expansions,
      lastAdjustment: this.lastAdjustment
    }
  }
}
