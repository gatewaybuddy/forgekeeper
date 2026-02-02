/**
 * @module consciousness/outcome-learner
 * @description Learns from outcomes to improve decision-making
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 87%
 *
 * Dependencies:
 * - fs/promises (for persistence)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine after each cycle
 * - Learns: Success/failure patterns, strategy effectiveness
 *
 * Tests:
 * - unit: __tests__/unit/outcome-learner.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'

/**
 * OutcomeLearner - Learns from outcomes to improve performance
 */
export class OutcomeLearner {
  /**
   * Create outcome learner
   *
   * @param {object} options - Configuration
   * @param {string} options.storageFile - Storage file path
   * @param {number} options.windowSize - Learning window size (default: 50)
   */
  constructor(options = {}) {
    this.storageFile = options.storageFile || '.forgekeeper/consciousness/learning.json'
    this.windowSize = options.windowSize || 50

    this.outcomes = []
    this.strategies = new Map()
    this.patterns = new Map()

    this.stats = {
      totalOutcomes: 0,
      successfulOutcomes: 0,
      failedOutcomes: 0,
      patternsLearned: 0,
      strategiesOptimized: 0
    }
  }

  /**
   * Initialize outcome learner
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.loadLearning()
    console.log(`[OutcomeLearner] Initialized with ${this.outcomes.length} outcomes`)
  }

  /**
   * Record an outcome
   *
   * @param {object} outcome - Outcome data
   * @returns {Promise<void>}
   */
  async recordOutcome(outcome) {
    const record = {
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      success: outcome.success,
      context: outcome.context || {},
      strategy: outcome.strategy || 'unknown',
      thoughtType: outcome.thoughtType || 'unknown',
      tier: outcome.tier || 'unknown',
      duration: outcome.duration || 0,
      error: outcome.error || null,
      metrics: outcome.metrics || {}
    }

    this.outcomes.push(record)
    if (this.outcomes.length > this.windowSize) {
      this.outcomes.shift()
    }

    this.stats.totalOutcomes++
    if (record.success) {
      this.stats.successfulOutcomes++
    } else {
      this.stats.failedOutcomes++
    }

    // Update strategy tracking
    this.updateStrategyPerformance(record)

    // Look for patterns
    await this.detectPatterns()

    // Persist every 10 outcomes
    if (this.stats.totalOutcomes % 10 === 0) {
      await this.persist()
    }
  }

  /**
   * Update strategy performance tracking
   *
   * @param {object} outcome - Outcome record
   */
  updateStrategyPerformance(outcome) {
    const strategy = outcome.strategy

    if (!this.strategies.has(strategy)) {
      this.strategies.set(strategy, {
        name: strategy,
        totalUses: 0,
        successes: 0,
        failures: 0,
        avgDuration: 0,
        totalDuration: 0,
        contexts: new Map()
      })
    }

    const strategyData = this.strategies.get(strategy)
    strategyData.totalUses++

    if (outcome.success) {
      strategyData.successes++
    } else {
      strategyData.failures++
    }

    strategyData.totalDuration += outcome.duration
    strategyData.avgDuration = strategyData.totalDuration / strategyData.totalUses

    // Track context-specific performance
    const contextKey = JSON.stringify(outcome.context)
    if (!strategyData.contexts.has(contextKey)) {
      strategyData.contexts.set(contextKey, {
        successes: 0,
        failures: 0
      })
    }

    const contextData = strategyData.contexts.get(contextKey)
    if (outcome.success) {
      contextData.successes++
    } else {
      contextData.failures++
    }
  }

  /**
   * Detect patterns in outcomes
   *
   * @returns {Promise<void>}
   */
  async detectPatterns() {
    // Pattern 1: Tier effectiveness by thought type
    const tierThoughtPatterns = this.analyzeTierByThoughtType()

    // Pattern 2: Time-of-day performance
    const timePatterns = this.analyzeTimeOfDay()

    // Pattern 3: Sequence patterns (what follows what)
    const sequencePatterns = this.analyzeSequences()

    // Update patterns
    for (const pattern of [...tierThoughtPatterns, ...timePatterns, ...sequencePatterns]) {
      this.patterns.set(pattern.id, pattern)
      this.stats.patternsLearned = this.patterns.size
    }
  }

  /**
   * Analyze tier effectiveness by thought type
   *
   * @returns {array} Patterns
   */
  analyzeTierByThoughtType() {
    const patterns = []
    const tierByType = {}

    for (const outcome of this.outcomes) {
      const key = `${outcome.thoughtType}:${outcome.tier}`
      if (!tierByType[key]) {
        tierByType[key] = {
          successes: 0,
          failures: 0,
          thoughtType: outcome.thoughtType,
          tier: outcome.tier
        }
      }

      if (outcome.success) {
        tierByType[key].successes++
      } else {
        tierByType[key].failures++
      }
    }

    // Generate patterns
    for (const [key, data] of Object.entries(tierByType)) {
      const total = data.successes + data.failures
      if (total < 3) continue // Need at least 3 samples

      const successRate = data.successes / total

      patterns.push({
        id: `tier-thought-${key}`,
        type: 'tier-effectiveness',
        thoughtType: data.thoughtType,
        tier: data.tier,
        successRate,
        confidence: Math.min(total / 10, 1.0), // More samples = higher confidence
        recommendation: this.generateTierRecommendation(data.thoughtType, data.tier, successRate)
      })
    }

    return patterns
  }

  /**
   * Generate tier recommendation
   *
   * @param {string} thoughtType - Thought type
   * @param {string} tier - Tier
   * @param {number} successRate - Success rate
   * @returns {string} Recommendation
   */
  generateTierRecommendation(thoughtType, tier, successRate) {
    if (successRate > 0.8) {
      return `Continue using ${tier} tier for ${thoughtType} thoughts`
    } else if (successRate < 0.5) {
      return `Consider switching from ${tier} tier for ${thoughtType} thoughts`
    }
    return `${tier} tier for ${thoughtType} has mixed results`
  }

  /**
   * Analyze time-of-day performance
   *
   * @returns {array} Patterns
   */
  analyzeTimeOfDay() {
    const patterns = []
    const hourlyPerformance = {}

    for (const outcome of this.outcomes) {
      const hour = new Date(outcome.timestamp).getHours()
      if (!hourlyPerformance[hour]) {
        hourlyPerformance[hour] = {
          successes: 0,
          failures: 0
        }
      }

      if (outcome.success) {
        hourlyPerformance[hour].successes++
      } else {
        hourlyPerformance[hour].failures++
      }
    }

    // Find best/worst hours
    let bestHour = null
    let worstHour = null
    let bestRate = 0
    let worstRate = 1

    for (const [hour, data] of Object.entries(hourlyPerformance)) {
      const total = data.successes + data.failures
      if (total < 3) continue

      const rate = data.successes / total

      if (rate > bestRate) {
        bestRate = rate
        bestHour = hour
      }

      if (rate < worstRate) {
        worstRate = rate
        worstHour = hour
      }
    }

    if (bestHour !== null) {
      patterns.push({
        id: 'time-best-hour',
        type: 'time-of-day',
        hour: parseInt(bestHour),
        successRate: bestRate,
        confidence: 0.6,
        recommendation: `Peak performance around ${bestHour}:00`
      })
    }

    if (worstHour !== null && worstRate < 0.5) {
      patterns.push({
        id: 'time-worst-hour',
        type: 'time-of-day',
        hour: parseInt(worstHour),
        successRate: worstRate,
        confidence: 0.6,
        recommendation: `Lower performance around ${worstHour}:00 - consider reducing activity`
      })
    }

    return patterns
  }

  /**
   * Analyze outcome sequences
   *
   * @returns {array} Patterns
   */
  analyzeSequences() {
    const patterns = []

    // Look for "success begets success" or "failure cascades"
    let consecutiveSuccesses = 0
    let consecutiveFailures = 0

    for (const outcome of this.outcomes.slice(-20)) {
      if (outcome.success) {
        consecutiveSuccesses++
        consecutiveFailures = 0
      } else {
        consecutiveFailures++
        consecutiveSuccesses = 0
      }
    }

    if (consecutiveSuccesses >= 5) {
      patterns.push({
        id: 'sequence-success-streak',
        type: 'sequence',
        streak: consecutiveSuccesses,
        confidence: 0.7,
        recommendation: 'Current positive streak - continue current approach'
      })
    }

    if (consecutiveFailures >= 3) {
      patterns.push({
        id: 'sequence-failure-cascade',
        type: 'sequence',
        streak: consecutiveFailures,
        confidence: 0.8,
        recommendation: 'Failure cascade detected - consider changing strategy'
      })
    }

    return patterns
  }

  /**
   * Get best strategy for context
   *
   * @param {object} context - Context
   * @returns {object|null} Best strategy
   */
  getBestStrategy(context = {}) {
    let bestStrategy = null
    let bestSuccessRate = 0

    for (const [name, data] of this.strategies.entries()) {
      if (data.totalUses < 3) continue // Need at least 3 uses

      const successRate = data.successes / data.totalUses

      if (successRate > bestSuccessRate) {
        bestSuccessRate = successRate
        bestStrategy = {
          name,
          successRate,
          avgDuration: data.avgDuration,
          totalUses: data.totalUses
        }
      }
    }

    return bestStrategy
  }

  /**
   * Get learning insights
   *
   * @returns {array} Insights
   */
  getInsights() {
    const insights = []

    // Overall success rate trend
    const recentSuccess = this.outcomes.slice(-10).filter(o => o.success).length / 10
    const olderSuccess = this.outcomes.slice(-20, -10).filter(o => o.success).length / 10

    if (recentSuccess > olderSuccess + 0.2) {
      insights.push({
        type: 'trend',
        message: 'Performance improving',
        confidence: 0.7
      })
    } else if (recentSuccess < olderSuccess - 0.2) {
      insights.push({
        type: 'trend',
        message: 'Performance declining',
        confidence: 0.7
      })
    }

    // Add pattern-based insights
    for (const pattern of this.patterns.values()) {
      if (pattern.recommendation) {
        insights.push({
          type: pattern.type,
          message: pattern.recommendation,
          confidence: pattern.confidence
        })
      }
    }

    return insights
  }

  /**
   * Persist learning data
   *
   * @returns {Promise<void>}
   */
  async persist() {
    try {
      const data = {
        outcomes: this.outcomes,
        strategies: Array.from(this.strategies.entries()),
        patterns: Array.from(this.patterns.entries()),
        stats: this.stats,
        savedAt: new Date().toISOString()
      }

      const dir = path.dirname(this.storageFile)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.storageFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[OutcomeLearner] Failed to persist learning:', error)
    }
  }

  /**
   * Load learning data
   *
   * @returns {Promise<void>}
   */
  async loadLearning() {
    try {
      const data = await fs.readFile(this.storageFile, 'utf-8')
      const parsed = JSON.parse(data)

      this.outcomes = parsed.outcomes || []
      this.strategies = new Map(parsed.strategies || [])
      this.patterns = new Map(parsed.patterns || [])
      this.stats = parsed.stats || this.stats
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[OutcomeLearner] Failed to load learning:', error)
      }
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
      successRate: this.stats.totalOutcomes > 0
        ? (this.stats.successfulOutcomes / this.stats.totalOutcomes) * 100
        : 0,
      recentSuccessRate: this.outcomes.length > 0
        ? (this.outcomes.filter(o => o.success).length / this.outcomes.length) * 100
        : 0
    }
  }
}
