/**
 * @module consciousness/budget-manager
 * @description Manages API token budget and usage tracking
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 92%
 *
 * Dependencies:
 * - fs (for persistence)
 *
 * Integration points:
 * - Called by: InferenceManager
 * - Calls: None
 *
 * Tests:
 * - unit: __tests__/unit/budget-manager.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'

/**
 * Valid inference tiers
 */
const VALID_TIERS = ['deep', 'rote']

/**
 * BudgetManager - Tracks and enforces API token budgets
 */
export class BudgetManager {
  /**
   * Create a budget manager
   *
   * @param {object} options - Configuration options
   * @param {number} options.dailyLimit - Daily token limit (default: from env or 1M)
   * @param {string} options.storePath - Path to budget storage file
   */
  constructor(options = {}) {
    this.dailyLimit = options.dailyLimit ||
      parseInt(process.env.CONSCIOUSNESS_DAILY_API_BUDGET || '1000000')

    this.storePath = options.storePath ||
      '.forgekeeper/consciousness/budget.json'

    this.used = 0
    this.usageByTier = {
      deep: 0,
      rote: 0
    }
    this.usageHistory = []
    this.resetsAt = this.getNextResetTime()
    this.createdAt = new Date().toISOString()
  }

  /**
   * Get remaining tokens
   */
  get remaining() {
    return Math.max(0, this.dailyLimit - this.used)
  }

  /**
   * Record token usage
   *
   * @param {number} amount - Number of tokens used
   * @param {string} tier - Inference tier ('deep' or 'rote')
   * @throws {Error} If amount is negative or budget exceeded
   */
  use(amount, tier = 'deep') {
    // Validate amount
    if (amount < 0) {
      throw new Error('Token amount must be positive')
    }

    // Validate tier
    if (tier && !VALID_TIERS.includes(tier)) {
      throw new Error(`Invalid tier: ${tier}. Must be one of: ${VALID_TIERS.join(', ')}`)
    }

    // Check if we need to reset (new day)
    if (Date.now() >= new Date(this.resetsAt).getTime()) {
      this.reset()
    }

    // Allow zero usage (for testing/logging)
    if (amount === 0) {
      return
    }

    // Check budget
    if (this.used + amount > this.dailyLimit) {
      throw new Error(
        `Budget exceeded: ${this.used + amount} > ${this.dailyLimit} ` +
        `(${this.remaining} remaining)`
      )
    }

    // Record usage
    this.used += amount
    this.usageByTier[tier] += amount

    // Add to history
    this.usageHistory.push({
      amount,
      tier,
      timestamp: new Date().toISOString(),
      totalUsed: this.used,
      remaining: this.remaining
    })

    // Auto-save periodically (every 10 uses)
    if (this.usageHistory.length % 10 === 0) {
      this.save().catch(err => {
        console.error('[BudgetManager] Auto-save failed:', err)
      })
    }
  }

  /**
   * Check if credit is available
   *
   * @param {number} amount - Optional amount to check (default: any credit)
   * @returns {boolean} True if credit available
   */
  hasCredit(amount = 1) {
    // Check if we need to reset
    if (Date.now() >= new Date(this.resetsAt).getTime()) {
      this.reset()
    }

    return this.remaining >= amount
  }

  /**
   * Get detailed credit status
   *
   * @param {number} amount - Amount to check
   * @returns {object} Credit status with reason
   */
  getCreditStatus(amount = 1) {
    // Check if we need to reset
    if (Date.now() >= new Date(this.resetsAt).getTime()) {
      this.reset()
    }

    const hasCredit = this.remaining >= amount

    return {
      hasCredit,
      remaining: this.remaining,
      used: this.used,
      dailyLimit: this.dailyLimit,
      percentageUsed: this.getPercentageUsed(),
      reason: hasCredit
        ? 'Budget available'
        : `Daily budget exceeded: ${this.used}/${this.dailyLimit} tokens used`
    }
  }

  /**
   * Get percentage of budget used
   *
   * @returns {number} Percentage (0-100)
   */
  getPercentageUsed() {
    if (this.dailyLimit === 0) return 0
    return (this.used / this.dailyLimit) * 100
  }

  /**
   * Reset daily budget
   */
  reset() {
    this.used = 0
    this.usageByTier = {
      deep: 0,
      rote: 0
    }
    this.usageHistory = []
    this.resetsAt = this.getNextResetTime()

    console.log(`[BudgetManager] Budget reset. Next reset: ${this.resetsAt}`)
  }

  /**
   * Get next reset time (midnight UTC)
   *
   * @returns {string} ISO timestamp
   */
  getNextResetTime() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(0, 0, 0, 0)
    return tomorrow.toISOString()
  }

  /**
   * Get budget information
   *
   * @returns {object} Budget details
   */
  getBudget() {
    return {
      dailyLimit: this.dailyLimit,
      used: this.used,
      remaining: this.remaining,
      percentageUsed: this.getPercentageUsed(),
      resetsAt: this.resetsAt,
      usageByTier: { ...this.usageByTier }
    }
  }

  /**
   * Get usage history
   *
   * @param {number} limit - Max number of entries (default: all)
   * @returns {array} Usage history
   */
  getUsageHistory(limit = null) {
    if (limit) {
      return this.usageHistory.slice(-limit)
    }
    return [...this.usageHistory]
  }

  /**
   * Estimate remaining usage capacity
   *
   * @returns {object} Usage estimates
   */
  estimateRemainingUsage() {
    // Average tokens per call
    const avgDeepTokens = 2000  // Typical deep reasoning call
    const avgRoteTokens = 200   // Typical rote task call

    const canMakeDeepCalls = Math.floor(this.remaining / avgDeepTokens)
    const canMakeRoteCalls = Math.floor(this.remaining / avgRoteTokens)

    // Recommend tier based on remaining budget
    let recommendedTier = 'deep'
    if (this.getPercentageUsed() > 80) {
      recommendedTier = 'rote'  // Conserve budget
    } else if (this.getPercentageUsed() > 50) {
      recommendedTier = 'balanced'  // Mix of both
    }

    return {
      canMakeDeepCalls,
      canMakeRoteCalls,
      recommendedTier,
      percentageUsed: this.getPercentageUsed()
    }
  }

  /**
   * Save budget state to disk
   *
   * @returns {Promise<void>}
   */
  async save() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.storePath)
      await fs.mkdir(dir, { recursive: true })

      // Save state
      const state = {
        dailyLimit: this.dailyLimit,
        used: this.used,
        usageByTier: this.usageByTier,
        usageHistory: this.usageHistory,
        resetsAt: this.resetsAt,
        createdAt: this.createdAt,
        updatedAt: new Date().toISOString()
      }

      await fs.writeFile(
        this.storePath,
        JSON.stringify(state, null, 2),
        'utf-8'
      )
    } catch (error) {
      console.error('[BudgetManager] Save failed:', error)
      throw error
    }
  }

  /**
   * Load budget state from disk
   *
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8')
      const state = JSON.parse(data)

      // Restore state
      this.dailyLimit = state.dailyLimit
      this.used = state.used || 0
      this.usageByTier = state.usageByTier || { deep: 0, rote: 0 }
      this.usageHistory = state.usageHistory || []
      this.resetsAt = state.resetsAt
      this.createdAt = state.createdAt

      // Check if we need to reset (new day)
      if (Date.now() >= new Date(this.resetsAt).getTime()) {
        this.reset()
      }

      console.log(`[BudgetManager] Loaded state: ${this.used}/${this.dailyLimit} tokens used`)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, that's ok
        console.log('[BudgetManager] No saved state found, starting fresh')
      } else {
        console.error('[BudgetManager] Load failed:', error)
        throw error
      }
    }
  }
}
