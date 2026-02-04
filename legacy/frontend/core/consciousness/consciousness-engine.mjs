/**
 * @module consciousness/consciousness-engine
 * @description Main continuous thinking loop orchestrating autonomous consciousness
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 88%
 *
 * Dependencies:
 * - inference-manager (two-tier inference)
 * - short-term-memory (working memory)
 * - dream-engine (memory consolidation)
 * - thought-generators (thought sources)
 * - parameter-tuner (self-adjustment)
 * - auto-commit (git save points)
 *
 * Integration points:
 * - Called by: GraphQL resolvers (start/stop mutations)
 * - Uses: All consciousness subsystems
 *
 * Tests:
 * - unit: __tests__/unit/consciousness-engine.test.mjs
 * - integration: __tests__/integration/consciousness-system-integration.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { EventEmitter } from 'events'

/**
 * ConsciousnessEngine - Main orchestrator for autonomous thinking
 */
export class ConsciousnessEngine extends EventEmitter {
  /**
   * Create consciousness engine
   *
   * @param {object} options - Configuration
   * @param {object} options.inferenceManager - Two-tier inference
   * @param {object} options.shortTermMemory - Working memory
   * @param {object} options.dreamEngine - Memory consolidation
   * @param {object} options.thoughtGenerators - Thought sources
   * @param {object} options.parameterTuner - Self-tuning
   * @param {object} options.autoCommit - Git save points
   * @param {number} options.cycleInterval - Initial cycle interval (ms, default 30000)
   * @param {object} options.cycleRange - Allowed range {min, max} (ms)
   * @param {string} options.stateFile - State persistence path
   */
  constructor(options = {}) {
    super()

    // Dependencies
    this.inferenceManager = options.inferenceManager
    this.shortTermMemory = options.shortTermMemory
    this.dreamEngine = options.dreamEngine
    this.thoughtGenerators = options.thoughtGenerators
    this.parameterTuner = options.parameterTuner
    this.autoCommit = options.autoCommit

    // Configuration
    this.cycleInterval = options.cycleInterval || 30000 // 30 seconds default
    this.cycleRange = options.cycleRange || {
      min: 10000,  // 10 seconds
      max: 300000  // 5 minutes
    }

    // State
    this.state = 'idle' // idle | thinking | dreaming | stopped
    this.currentCycle = 0
    this.cycleHistory = []
    this.lastCycleResult = null
    this.startTime = null

    // Timers
    this.cycleTimer = null
    this.dreamTimer = null

    // Persistence
    this.stateFile = options.stateFile || '.forgekeeper/consciousness/state.json'
    this.autoSaveInterval = 5 // Save every 5 cycles

    // Metrics
    this.metrics = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      dreamsTriggered: 0,
      parameterAdjustments: 0,
      savePointsCreated: 0,
      avgCycleDuration: 0,
      uptimeMs: 0
    }

    // Options
    this.enabled = process.env.CONSCIOUSNESS_ENABLED !== '0'
  }

  /**
   * Start consciousness loop
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.enabled) {
      console.log('[ConsciousnessEngine] Disabled, not starting')
      return
    }

    if (this.state !== 'idle' && this.state !== 'stopped') {
      console.warn('[ConsciousnessEngine] Already running')
      return
    }

    console.log('[ConsciousnessEngine] Starting autonomous consciousness...')

    // Load previous state if exists
    await this.loadState()

    this.state = 'thinking'
    this.startTime = Date.now()

    this.emit('started', {
      cycleInterval: this.cycleInterval,
      cycleRange: this.cycleRange,
      currentCycle: this.currentCycle
    })

    // Start cycle loop
    this.scheduleCycle()
  }

  /**
   * Stop consciousness loop
   *
   * @returns {Promise<void>}
   */
  async stop() {
    console.log('[ConsciousnessEngine] Stopping...')

    // Clear timers
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer)
      this.cycleTimer = null
    }
    if (this.dreamTimer) {
      clearTimeout(this.dreamTimer)
      this.dreamTimer = null
    }

    this.state = 'stopped'

    // Save state before stopping
    await this.saveState()

    this.emit('stopped', {
      totalCycles: this.currentCycle,
      uptime: Date.now() - this.startTime
    })
  }

  /**
   * Schedule next cycle
   */
  scheduleCycle() {
    if (this.state === 'stopped') return

    this.cycleTimer = setTimeout(async () => {
      await this.runCycle()
      this.scheduleCycle()
    }, this.cycleInterval)
  }

  /**
   * Run a single thinking cycle
   *
   * @returns {Promise<object>} Cycle result
   */
  async runCycle() {
    const cycleId = ++this.currentCycle
    const cycleStart = Date.now()

    console.log(`\n[ConsciousnessEngine] === Cycle ${cycleId} ===`)

    this.emit('cycle-start', { cycle: cycleId })

    const result = {
      cycle: cycleId,
      timestamp: new Date().toISOString(),
      duration: 0,
      steps: [],
      success: false,
      error: null
    }

    try {
      // Step 1: Generate thought
      const thought = await this.generateThought()
      result.steps.push({ step: 'generate', thought: thought.content })

      // Step 2: Process thought (classification + inference)
      const response = await this.processThought(thought)
      result.steps.push({ step: 'process', tier: response.tier })

      // Step 3: Update memory
      await this.updateMemory(thought, response)
      result.steps.push({ step: 'memory', added: true })

      // Step 4: Check dream trigger
      const dreamTriggered = await this.checkDreamTrigger()
      if (dreamTriggered) {
        result.steps.push({ step: 'dream', triggered: true })
        await this.triggerDream()
      }

      // Step 5: Tune parameters
      const adjustment = await this.tuneParameters(result)
      if (adjustment) {
        result.steps.push({ step: 'tune', adjustment: adjustment.type })
        this.metrics.parameterAdjustments++
      }

      // Step 6: Create save point (if interval reached)
      if (this.shouldCreateSavePoint(cycleId)) {
        const savePoint = await this.createSavePoint(cycleId)
        if (savePoint) {
          result.steps.push({ step: 'save', commit: savePoint.commitHash.slice(0, 7) })
          this.metrics.savePointsCreated++
        }
      }

      // Step 7: Auto-save state periodically
      if (cycleId % this.autoSaveInterval === 0) {
        await this.saveState()
      }

      result.success = true
      this.metrics.successfulCycles++

    } catch (error) {
      console.error(`[ConsciousnessEngine] Cycle ${cycleId} failed:`, error)
      result.error = error.message
      this.metrics.failedCycles++
    }

    result.duration = Date.now() - cycleStart
    this.lastCycleResult = result

    // Update metrics
    this.metrics.totalCycles++
    this.metrics.avgCycleDuration =
      (this.metrics.avgCycleDuration * (this.metrics.totalCycles - 1) + result.duration) /
      this.metrics.totalCycles
    this.metrics.uptimeMs = Date.now() - this.startTime

    // Record in history (keep last 100)
    this.cycleHistory.push(result)
    if (this.cycleHistory.length > 100) {
      this.cycleHistory.shift()
    }

    this.emit('cycle-complete', result)

    console.log(`[ConsciousnessEngine] Cycle ${cycleId} complete: ${result.duration}ms (${result.success ? 'success' : 'failed'})`)

    return result
  }

  /**
   * Generate a thought from thought generators
   *
   * @returns {Promise<object>} Generated thought
   */
  async generateThought() {
    if (!this.thoughtGenerators) {
      // Fallback to simple self-assessment if no generator
      return {
        content: 'How effective has my recent thinking been?',
        type: 'self-assessment',
        priority: 'medium',
        expectedDuration: 'short',
        source: 'fallback'
      }
    }

    const thought = await this.thoughtGenerators.generate(this.getState())
    console.log(`[ConsciousnessEngine] Generated thought (${thought.source}): "${thought.content.slice(0, 60)}..."`)
    return thought
  }

  /**
   * Process thought through two-tier inference
   *
   * @param {object} thought - Thought to process
   * @returns {Promise<object>} Inference result
   */
  async processThought(thought) {
    const context = {
      recentMemories: this.shortTermMemory?.getMemories() || [],
      currentCycle: this.currentCycle
    }

    const result = await this.inferenceManager.process(thought, context)

    console.log(`[ConsciousnessEngine] Processed via ${result.tier} tier (${result.duration}ms)`)

    return result
  }

  /**
   * Update memory with thought + response
   *
   * @param {object} thought - Original thought
   * @param {object} response - Inference response
   * @returns {Promise<void>}
   */
  async updateMemory(thought, response) {
    if (!this.shortTermMemory) return

    const experience = {
      type: 'thought-reflection',
      thought: thought.content,
      response: response.text,
      tier: response.tier,
      timestamp: new Date().toISOString(),
      cycle: this.currentCycle
    }

    await this.shortTermMemory.addExperience(experience)

    console.log('[ConsciousnessEngine] Memory updated')
  }

  /**
   * Check if dream cycle should be triggered
   *
   * @returns {Promise<boolean>} True if dream triggered
   */
  async checkDreamTrigger() {
    if (!this.dreamEngine) return false

    const shouldDream = await this.dreamEngine.shouldTriggerDream(this.getState())

    return shouldDream
  }

  /**
   * Trigger dream cycle
   *
   * @returns {Promise<void>}
   */
  async triggerDream() {
    console.log('[ConsciousnessEngine] Triggering dream cycle...')

    this.state = 'dreaming'
    this.emit('dream-start', { cycle: this.currentCycle })

    try {
      const dreamResult = await this.dreamEngine.runDream(this.getState())

      this.metrics.dreamsTriggered++

      this.emit('dream-complete', {
        cycle: this.currentCycle,
        duration: dreamResult.duration,
        memoriesConsolidated: dreamResult.memoriesConsolidated
      })

      console.log(`[ConsciousnessEngine] Dream complete: ${dreamResult.memoriesConsolidated} memories consolidated`)

    } catch (error) {
      console.error('[ConsciousnessEngine] Dream failed:', error)
      this.emit('dream-error', { cycle: this.currentCycle, error: error.message })
    }

    this.state = 'thinking'
  }

  /**
   * Tune cycle parameters
   *
   * @param {object} cycleResult - Last cycle result
   * @returns {Promise<object|null>} Adjustment made (if any)
   */
  async tuneParameters(cycleResult) {
    if (!this.parameterTuner) return null

    const adjustment = await this.parameterTuner.adjustCycleInterval(
      this.getState(),
      cycleResult
    )

    if (adjustment) {
      console.log(`[ConsciousnessEngine] Parameters adjusted: ${adjustment.description}`)
      this.emit('parameters-adjusted', adjustment)
    }

    return adjustment
  }

  /**
   * Check if save point should be created
   *
   * @param {number} cycle - Current cycle number
   * @returns {boolean}
   */
  shouldCreateSavePoint(cycle) {
    if (!this.autoCommit) return false

    return cycle % this.autoCommit.interval === 0
  }

  /**
   * Create git save point
   *
   * @param {number} cycle - Current cycle number
   * @returns {Promise<object|null>} Save point info
   */
  async createSavePoint(cycle) {
    if (!this.autoCommit) return null

    const savePoint = await this.autoCommit.createSavePoint(cycle, 'autonomous')

    if (savePoint) {
      console.log(`[ConsciousnessEngine] Save point created: ${savePoint.commitHash.slice(0, 7)}`)
      this.emit('save-point-created', savePoint)
    }

    return savePoint
  }

  /**
   * Get current state snapshot
   *
   * @returns {object} State snapshot
   */
  getState() {
    return {
      state: this.state,
      currentCycle: this.currentCycle,
      cycleInterval: this.cycleInterval,
      cycleRange: this.cycleRange,
      lastCycleResult: this.lastCycleResult,
      shortTermMemory: this.shortTermMemory,
      inferenceManager: this.inferenceManager,
      metrics: { ...this.metrics },
      uptime: this.startTime ? Date.now() - this.startTime : 0
    }
  }

  /**
   * Save state to disk
   *
   * @returns {Promise<void>}
   */
  async saveState() {
    try {
      const stateData = {
        currentCycle: this.currentCycle,
        cycleInterval: this.cycleInterval,
        cycleRange: this.cycleRange,
        metrics: this.metrics,
        lastCycleResult: this.lastCycleResult,
        cycleHistory: this.cycleHistory.slice(-20), // Keep last 20
        savedAt: new Date().toISOString()
      }

      const dir = path.dirname(this.stateFile)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.stateFile, JSON.stringify(stateData, null, 2))

      console.log('[ConsciousnessEngine] State saved')

    } catch (error) {
      console.error('[ConsciousnessEngine] Failed to save state:', error)
    }
  }

  /**
   * Load state from disk
   *
   * @returns {Promise<void>}
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8')
      const state = JSON.parse(data)

      this.currentCycle = state.currentCycle || 0
      this.cycleInterval = state.cycleInterval || this.cycleInterval
      this.cycleRange = state.cycleRange || this.cycleRange
      this.metrics = state.metrics || this.metrics
      this.lastCycleResult = state.lastCycleResult || null
      this.cycleHistory = state.cycleHistory || []

      console.log(`[ConsciousnessEngine] State loaded: resuming at cycle ${this.currentCycle}`)

    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[ConsciousnessEngine] Failed to load state:', error.message)
      }
      // If file doesn't exist, just start fresh
    }
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.metrics,
      state: this.state,
      currentCycle: this.currentCycle,
      cycleInterval: this.cycleInterval,
      cycleRange: this.cycleRange,
      enabled: this.enabled,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      successRate: this.metrics.totalCycles > 0
        ? (this.metrics.successfulCycles / this.metrics.totalCycles) * 100
        : 0
    }
  }

  /**
   * Get recent cycle history
   *
   * @param {number} limit - Max cycles to return
   * @returns {array} Recent cycles
   */
  getCycleHistory(limit = 20) {
    return this.cycleHistory.slice(-limit)
  }

  /**
   * Manually trigger a cycle (for testing/debugging)
   *
   * @returns {Promise<object>} Cycle result
   */
  async triggerCycle() {
    if (this.state === 'stopped') {
      throw new Error('Consciousness is stopped')
    }

    return await this.runCycle()
  }

  /**
   * Manually adjust cycle interval
   *
   * @param {number} intervalMs - New interval (ms)
   * @returns {void}
   */
  adjustCycleInterval(intervalMs) {
    const newInterval = Math.max(
      this.cycleRange.min,
      Math.min(intervalMs, this.cycleRange.max)
    )

    if (newInterval !== this.cycleInterval) {
      const oldInterval = this.cycleInterval
      this.cycleInterval = newInterval

      console.log(`[ConsciousnessEngine] Interval adjusted: ${oldInterval}ms → ${newInterval}ms`)

      this.emit('interval-adjusted', {
        old: oldInterval,
        new: newInterval
      })
    }
  }
}
