/**
 * @module consciousness/inference-manager
 * @description Manages dual-tier inference (deep API vs. rote local)
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 90%
 *
 * Dependencies:
 * - thought-classifier.mjs
 * - budget-manager.mjs
 *
 * Integration points:
 * - Called by: ConsciousnessEngine.process()
 * - Calls: ThoughtClassifier.classify(), BudgetManager.use()
 *
 * Tests:
 * - unit: __tests__/unit/inference-manager.test.mjs
 * - integration: __tests__/integration/consciousness-to-inference.test.mjs
 */

import { ThoughtClassifier } from './thought-classifier.mjs'
import { BudgetManager } from './budget-manager.mjs'

/**
 * Inference tier configuration
 */
class InferenceTier {
  constructor(name, provider, options = {}) {
    this.name = name
    this.provider = provider
    this.options = options
  }

  async generate(prompt, options = {}) {
    const mergedOptions = { ...this.options, ...options }
    return await this.provider.generate(prompt, mergedOptions)
  }
}

/**
 * InferenceManager - Routes thoughts to appropriate inference tier
 */
export class InferenceManager {
  /**
   * Create an inference manager
   *
   * @param {object} options - Configuration options
   * @param {object} options.deepProvider - Deep reasoning provider (API)
   * @param {object} options.roteProvider - Rote task provider (local)
   * @param {object} options.budgetManager - Budget manager instance
   * @param {object} options.classifier - Thought classifier instance
   * @param {object} options.deepOptions - Deep tier options
   * @param {object} options.roteOptions - Rote tier options
   */
  constructor(options = {}) {
    // Initialize tiers
    this.deepTier = new InferenceTier(
      'deep',
      options.deepProvider,
      options.deepOptions || {
        model: process.env.CONSCIOUSNESS_DEEP_MODEL || 'claude-sonnet-4-5',
        temperature: 0.7,
        maxTokens: 8192
      }
    )

    this.roteTier = new InferenceTier(
      'rote',
      options.roteProvider,
      options.roteOptions || {
        model: process.env.CONSCIOUSNESS_ROTE_MODEL || 'local',
        temperature: 0.0,
        maxTokens: 2048
      }
    )

    // Initialize classifier and budget manager
    this.classifier = options.classifier || new ThoughtClassifier()
    this.budgetManager = options.budgetManager || new BudgetManager()

    // Statistics
    this.stats = {
      totalCalls: 0,
      deepCalls: 0,
      roteCalls: 0,
      totalCost: 0,
      totalDuration: 0,
      errors: 0
    }
  }

  /**
   * Process a thought through the appropriate tier
   *
   * @param {object} thought - The thought to process
   * @param {object} context - Additional context
   * @param {object} options - Processing options
   * @param {number} options.maxRetries - Max retry attempts (default: 3)
   * @param {boolean} options.noFallback - Don't fallback to rote on error
   * @returns {Promise<object>} Processing result
   */
  async process(thought, context = {}, options = {}) {
    const startTime = Date.now()
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3

    try {
      // Build context with budget status
      const enrichedContext = this.buildContext(context)

      // Classify the thought
      let classification
      try {
        classification = await this.classifier.classify(thought, enrichedContext)
      } catch (error) {
        console.error('[InferenceManager] Classification error:', error)
        // Default to rote on classification error
        classification = {
          tier: 'rote',
          confidence: 0,
          scores: {},
          reasoning: 'Classification error, defaulting to rote',
          deepScore: 0
        }
      }

      // Check budget if deep tier requested
      let tier = classification.tier
      let budgetOverride = false

      if (tier === 'deep') {
        const budgetStatus = this.budgetManager.getCreditStatus(2000) // Estimate

        if (!budgetStatus.hasCredit) {
          console.warn('[InferenceManager] Budget exceeded, falling back to rote')
          tier = 'rote'
          budgetOverride = true
        }
      }

      // Select provider
      const provider = tier === 'deep' ? this.deepTier : this.roteTier

      // Generate with retries
      let result
      let attempt = 0
      let lastError

      while (attempt <= maxRetries) {
        try {
          result = await provider.generate(thought.content, {
            context: enrichedContext,
            thought
          })
          break // Success
        } catch (error) {
          lastError = error
          attempt++

          if (attempt <= maxRetries) {
            console.warn(`[InferenceManager] Attempt ${attempt} failed, retrying...`)
            await this.sleep(1000 * attempt) // Exponential backoff
          }
        }
      }

      // If all retries failed
      if (!result) {
        if (options.noFallback) {
          throw lastError
        }

        // Fallback to rote tier if deep failed
        if (tier === 'deep') {
          console.warn('[InferenceManager] Deep tier failed, falling back to rote')
          result = await this.roteTier.generate(thought.content, {
            context: enrichedContext,
            thought
          })
          tier = 'rote'
          budgetOverride = true
        } else {
          throw lastError
        }
      }

      // Track budget usage
      if (tier === 'deep' && result.tokensUsed) {
        this.budgetManager.use(result.tokensUsed, 'deep')
      }

      // Calculate duration
      const duration = Date.now() - startTime

      // Record outcome
      this.recordOutcome(thought, classification, tier, result, duration, true)

      // Build response
      return {
        text: result.text,
        tier,
        classification,
        cost: result.tokensUsed || 0,
        duration,
        budgetOverride: budgetOverride || undefined,
        fallbackReason: lastError ? lastError.message : undefined
      }

    } catch (error) {
      const duration = Date.now() - startTime

      // Record failure
      this.recordOutcome(thought, null, null, null, duration, false, error)

      throw error
    }
  }

  /**
   * Build enriched context for classification
   *
   * @param {object} context - Base context
   * @returns {object} Enriched context
   */
  buildContext(context) {
    return {
      ...context,
      budgetStatus: this.budgetManager.getCreditStatus(),
      recentThoughts: context.recentThoughts || []
    }
  }

  /**
   * Record processing outcome
   *
   * @param {object} thought - The thought
   * @param {object} classification - Classification result
   * @param {string} tier - Tier used
   * @param {object} result - Generation result
   * @param {number} duration - Processing duration
   * @param {boolean} success - Whether successful
   * @param {Error} error - Error if failed
   */
  recordOutcome(thought, classification, tier, result, duration, success, error = null) {
    // Update stats
    this.stats.totalCalls++
    this.stats.totalDuration += duration

    if (success) {
      if (tier === 'deep') {
        this.stats.deepCalls++
        this.stats.totalCost += result.tokensUsed || 0
      } else if (tier === 'rote') {
        this.stats.roteCalls++
      }
    } else {
      this.stats.errors++
    }

    // Record with classifier
    if (classification) {
      this.classifier.recordOutcome(
        thought,
        classification,
        {
          tier,
          success,
          duration,
          cost: result?.tokensUsed || 0,
          error: error?.message
        }
      )
    }
  }

  /**
   * Get processing statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgDuration: this.stats.totalCalls > 0
        ? this.stats.totalDuration / this.stats.totalCalls
        : 0,
      deepPercentage: this.stats.totalCalls > 0
        ? (this.stats.deepCalls / this.stats.totalCalls) * 100
        : 0,
      rotePercentage: this.stats.totalCalls > 0
        ? (this.stats.roteCalls / this.stats.totalCalls) * 100
        : 0,
      errorRate: this.stats.totalCalls > 0
        ? (this.stats.errors / this.stats.totalCalls) * 100
        : 0
    }
  }

  /**
   * Sleep utility
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
