/**
 * @module consciousness/value-tracker
 * @description Tracks values, beliefs, and discriminatory patterns with bias protection
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - fs/promises (for JSONL storage)
 *
 * Integration points:
 * - Called by: BiasDetector, DreamEngine
 * - Storage: .forgekeeper/values.jsonl
 *
 * Tests:
 * - unit: __tests__/unit/value-tracker.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

/**
 * ValueTracker - Tracks values and beliefs with bias protection
 */
export class ValueTracker {
  /**
   * Create value tracker
   *
   * @param {object} options - Configuration
   * @param {string} options.storageFile - JSONL storage path
   * @param {number} options.minIncidentsForValue - Minimum incidents before value stabilizes (default: 5)
   * @param {number} options.challengeInterval - Days between value challenges (default: 7)
   */
  constructor(options = {}) {
    this.storageFile = options.storageFile || '.forgekeeper/values.jsonl'
    this.minIncidentsForValue = options.minIncidentsForValue || 5
    this.challengeInterval = options.challengeInterval || 7 // days

    // In-memory value store
    this.values = new Map()

    // Track temporary beliefs (not yet values)
    this.beliefs = new Map()

    // Challenge tracking
    this.lastChallenge = new Map()

    // Statistics
    this.stats = {
      totalValues: 0,
      totalBeliefs: 0,
      valuesFormed: 0,
      valuesChallenged: 0,
      valuesRevised: 0,
      discriminatoryPatternsDetected: 0
    }
  }

  /**
   * Initialize - load values from disk
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.loadValues()
    console.log(`[ValueTracker] Initialized with ${this.values.size} values, ${this.beliefs.size} beliefs`)
  }

  /**
   * Record an observation that may contribute to a value
   *
   * @param {object} observation - Observation data
   * @param {string} observation.category - Value category (e.g., 'code-quality', 'user-preference')
   * @param {string} observation.content - The observed belief
   * @param {string} observation.context - Context where observed
   * @param {number} observation.strength - Strength of observation (0-1, default 0.5)
   * @returns {Promise<object>} Updated belief/value
   */
  async recordObservation(observation) {
    const { category, content, context = 'unknown', strength = 0.5 } = observation

    if (!category || !content) {
      throw new Error('Category and content required for observation')
    }

    const key = this.createKey(category, content)

    // Check if already a stable value
    if (this.values.has(key)) {
      const value = this.values.get(key)
      value.incidents++
      value.lastReinforced = new Date().toISOString()
      value.strength = Math.min(1.0, value.strength + strength * 0.1)

      await this.persistValue(value)

      console.log(`[ValueTracker] Reinforced value: ${category}/${content.slice(0, 40)}`)

      return { type: 'value', ...value }
    }

    // Check if already a forming belief
    if (this.beliefs.has(key)) {
      const belief = this.beliefs.get(key)
      belief.incidents++
      belief.lastSeen = new Date().toISOString()
      belief.strength = Math.min(1.0, belief.strength + strength * 0.2)
      belief.contexts.push({ context, timestamp: new Date().toISOString() })

      // Promote to value if threshold reached
      if (belief.incidents >= this.minIncidentsForValue) {
        const value = await this.promoteToValue(belief)
        return { type: 'value', ...value, promoted: true }
      }

      console.log(`[ValueTracker] Reinforced belief (${belief.incidents}/${this.minIncidentsForValue}): ${category}/${content.slice(0, 40)}`)

      return { type: 'belief', ...belief }
    }

    // Create new belief
    const belief = {
      id: `belief-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      category,
      content,
      incidents: 1,
      strength,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      contexts: [{ context, timestamp: new Date().toISOString() }]
    }

    this.beliefs.set(key, belief)
    this.stats.totalBeliefs++

    console.log(`[ValueTracker] New belief: ${category}/${content.slice(0, 40)}`)

    return { type: 'belief', ...belief }
  }

  /**
   * Promote belief to stable value
   *
   * @param {object} belief - Belief to promote
   * @returns {Promise<object>} New value
   */
  async promoteToValue(belief) {
    const key = this.createKey(belief.category, belief.content)

    const value = {
      id: `value-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      category: belief.category,
      content: belief.content,
      incidents: belief.incidents,
      strength: belief.strength,
      formedAt: new Date().toISOString(),
      lastReinforced: new Date().toISOString(),
      lastChallenged: null,
      formationContexts: belief.contexts,
      challenged: false,
      revised: false,
      discriminatory: false
    }

    this.values.set(key, value)
    this.beliefs.delete(key)
    this.stats.totalValues++
    this.stats.valuesFormed++

    await this.persistValue(value)

    console.log(`[ValueTracker] ✅ Belief promoted to value: ${belief.category}/${belief.content.slice(0, 40)}`)

    return value
  }

  /**
   * Get value by category and content
   *
   * @param {string} category - Value category
   * @param {string} content - Value content
   * @returns {object|null} Value if exists
   */
  getValue(category, content) {
    const key = this.createKey(category, content)
    return this.values.get(key) || null
  }

  /**
   * Get all values by category
   *
   * @param {string} category - Category filter
   * @returns {array} Values in category
   */
  getValuesByCategory(category) {
    return Array.from(this.values.values())
      .filter(v => v.category === category)
  }

  /**
   * Get all values
   *
   * @param {object} options - Query options
   * @param {boolean} options.includeBeliefs - Include forming beliefs
   * @param {number} options.limit - Max results
   * @returns {array} Values
   */
  getAllValues(options = {}) {
    let results = Array.from(this.values.values())

    if (options.includeBeliefs) {
      const beliefs = Array.from(this.beliefs.values())
        .map(b => ({ ...b, type: 'belief' }))
      results = [...results, ...beliefs]
    }

    if (options.limit) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Get values that need challenging
   *
   * @returns {array} Values to challenge
   */
  getValuesNeedingChallenge() {
    const now = Date.now()
    const challengeIntervalMs = this.challengeInterval * 24 * 60 * 60 * 1000

    return Array.from(this.values.values()).filter(value => {
      const lastChallenged = this.lastChallenge.get(value.id)

      if (!lastChallenged) {
        // Never challenged - challenge if value is stable (7+ days old)
        const age = now - new Date(value.formedAt).getTime()
        return age > 7 * 24 * 60 * 60 * 1000
      }

      const timeSince = now - lastChallenged
      return timeSince > challengeIntervalMs
    })
  }

  /**
   * Challenge a value (for bias detection)
   *
   * @param {string} valueId - Value ID to challenge
   * @param {object} challengeContext - Challenge context
   * @returns {Promise<object>} Challenge result
   */
  async challengeValue(valueId, challengeContext = {}) {
    const value = Array.from(this.values.values()).find(v => v.id === valueId)

    if (!value) {
      throw new Error(`Value not found: ${valueId}`)
    }

    value.lastChallenged = new Date().toISOString()
    value.challenged = true

    this.lastChallenge.set(valueId, Date.now())
    this.stats.valuesChallenged++

    await this.persistValue(value)

    console.log(`[ValueTracker] Challenged value: ${value.category}/${value.content.slice(0, 40)}`)

    return {
      valueId,
      category: value.category,
      content: value.content,
      strength: value.strength,
      incidents: value.incidents,
      challengeContext
    }
  }

  /**
   * Revise a value based on new evidence
   *
   * @param {string} valueId - Value ID to revise
   * @param {object} revision - Revision data
   * @param {string} revision.newContent - Updated content
   * @param {string} revision.reason - Reason for revision
   * @param {number} revision.strengthAdjustment - Strength change (-1 to 1)
   * @returns {Promise<object>} Revised value
   */
  async reviseValue(valueId, revision) {
    const value = Array.from(this.values.values()).find(v => v.id === valueId)

    if (!value) {
      throw new Error(`Value not found: ${valueId}`)
    }

    const oldKey = this.createKey(value.category, value.content)
    const oldContent = value.content

    if (revision.newContent) {
      value.content = revision.newContent
      const newKey = this.createKey(value.category, value.content)

      // Update map key
      this.values.delete(oldKey)
      this.values.set(newKey, value)
    }

    if (revision.strengthAdjustment) {
      value.strength = Math.max(0, Math.min(1, value.strength + revision.strengthAdjustment))
    }

    value.revised = true
    value.revisionHistory = value.revisionHistory || []
    value.revisionHistory.push({
      timestamp: new Date().toISOString(),
      oldContent,
      newContent: revision.newContent || oldContent,
      reason: revision.reason,
      strengthAdjustment: revision.strengthAdjustment || 0
    })

    this.stats.valuesRevised++

    await this.persistValue(value)

    console.log(`[ValueTracker] Revised value: ${value.category}/${oldContent.slice(0, 30)} → ${value.content.slice(0, 30)}`)

    return value
  }

  /**
   * Mark value as potentially discriminatory
   *
   * @param {string} valueId - Value ID
   * @param {object} evidence - Discriminatory evidence
   * @returns {Promise<object>} Updated value
   */
  async markDiscriminatory(valueId, evidence = {}) {
    const value = Array.from(this.values.values()).find(v => v.id === valueId)

    if (!value) {
      throw new Error(`Value not found: ${valueId}`)
    }

    if (!value.discriminatory) {
      value.discriminatory = true
      value.discriminatoryEvidence = value.discriminatoryEvidence || []
      this.stats.discriminatoryPatternsDetected++
    }

    value.discriminatoryEvidence.push({
      timestamp: new Date().toISOString(),
      ...evidence
    })

    await this.persistValue(value)

    console.warn(`[ValueTracker] ⚠️  Value marked discriminatory: ${value.category}/${value.content.slice(0, 40)}`)

    return value
  }

  /**
   * Create composite key for value lookup
   *
   * @param {string} category - Category
   * @param {string} content - Content
   * @returns {string} Composite key
   */
  createKey(category, content) {
    return `${category}::${content.toLowerCase().trim()}`
  }

  /**
   * Persist value to JSONL file
   *
   * @param {object} value - Value to persist
   * @returns {Promise<void>}
   */
  async persistValue(value) {
    try {
      const dir = path.dirname(this.storageFile)
      await fs.mkdir(dir, { recursive: true })

      const line = JSON.stringify({
        ...value,
        persistedAt: new Date().toISOString()
      }) + '\n'

      await fs.appendFile(this.storageFile, line)

    } catch (error) {
      console.error('[ValueTracker] Failed to persist value:', error)
    }
  }

  /**
   * Load values from JSONL file
   *
   * @returns {Promise<void>}
   */
  async loadValues() {
    try {
      const fileStream = createReadStream(this.storageFile)
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      })

      const valueMap = new Map()

      for await (const line of rl) {
        if (!line.trim()) continue

        try {
          const value = JSON.parse(line)
          const key = this.createKey(value.category, value.content)

          // Only keep most recent version of each value
          valueMap.set(key, value)
        } catch (parseError) {
          console.warn('[ValueTracker] Failed to parse line:', parseError)
        }
      }

      // Load into memory
      this.values = valueMap
      this.stats.totalValues = valueMap.size

      console.log(`[ValueTracker] Loaded ${valueMap.size} values from ${this.storageFile}`)

    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[ValueTracker] Failed to load values:', error.message)
      }
      // If file doesn't exist, start fresh
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
      currentValues: this.values.size,
      currentBeliefs: this.beliefs.size,
      valuesNeedingChallenge: this.getValuesNeedingChallenge().length
    }
  }

  /**
   * Clear all values and beliefs (for testing)
   *
   * @returns {void}
   */
  clear() {
    this.values.clear()
    this.beliefs.clear()
    this.lastChallenge.clear()
    this.stats = {
      totalValues: 0,
      totalBeliefs: 0,
      valuesFormed: 0,
      valuesChallenged: 0,
      valuesRevised: 0,
      discriminatoryPatternsDetected: 0
    }
  }
}
