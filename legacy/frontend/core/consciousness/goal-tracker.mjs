/**
 * @module consciousness/goal-tracker
 * @description Goal setting and tracking for autonomous consciousness
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 86%
 *
 * Dependencies:
 * - fs/promises (for persistence)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine, thought generators
 * - Tracks: Long-term and short-term goals
 *
 * Tests:
 * - unit: __tests__/unit/goal-tracker.test.mjs
 */

import fs from 'fs/promises'
import path from 'path'

/**
 * Goal states
 */
const GOAL_STATES = {
  ACTIVE: 'active',
  ACHIEVED: 'achieved',
  ABANDONED: 'abandoned',
  DEFERRED: 'deferred'
}

/**
 * GoalTracker - Manages goals and tracks progress
 */
export class GoalTracker {
  /**
   * Create goal tracker
   *
   * @param {object} options - Configuration
   * @param {string} options.storageFile - Storage file path
   */
  constructor(options = {}) {
    this.storageFile = options.storageFile || '.forgekeeper/consciousness/goals.json'

    this.goals = new Map()
    this.goalHistory = []

    this.stats = {
      totalGoals: 0,
      activeGoals: 0,
      achievedGoals: 0,
      abandonedGoals: 0,
      avgCompletionTime: 0
    }
  }

  /**
   * Initialize goal tracker
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.loadGoals()
    this.updateStats()
    console.log(`[GoalTracker] Initialized with ${this.goals.size} goals`)
  }

  /**
   * Create a new goal
   *
   * @param {object} goalData - Goal data
   * @returns {Promise<object>} Created goal
   */
  async createGoal(goalData) {
    const goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: goalData.title,
      description: goalData.description || '',
      type: goalData.type || 'improvement', // improvement, investigation, optimization, learning
      priority: goalData.priority || 'medium',
      state: GOAL_STATES.ACTIVE,
      createdAt: new Date().toISOString(),
      targetDate: goalData.targetDate || null,
      metrics: goalData.metrics || {},
      progress: 0,
      milestones: goalData.milestones || [],
      relatedValues: goalData.relatedValues || [],
      notes: []
    }

    this.goals.set(goal.id, goal)
    this.stats.totalGoals++
    this.stats.activeGoals++

    await this.persist()

    console.log(`[GoalTracker] Created goal: ${goal.title}`)

    return goal
  }

  /**
   * Update goal progress
   *
   * @param {string} goalId - Goal ID
   * @param {number} progress - Progress 0-100
   * @param {string} note - Progress note
   * @returns {Promise<object>} Updated goal
   */
  async updateProgress(goalId, progress, note = '') {
    const goal = this.goals.get(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    const oldProgress = goal.progress
    goal.progress = Math.max(0, Math.min(100, progress))

    if (note) {
      goal.notes.push({
        timestamp: new Date().toISOString(),
        text: note,
        progress: goal.progress
      })
    }

    goal.updatedAt = new Date().toISOString()

    // Auto-achieve if 100%
    if (goal.progress === 100 && goal.state === GOAL_STATES.ACTIVE) {
      goal.state = GOAL_STATES.ACHIEVED
      goal.achievedAt = new Date().toISOString()
      this.stats.activeGoals--
      this.stats.achievedGoals++

      this.goalHistory.push({
        ...goal,
        completionTime: Date.now() - new Date(goal.createdAt).getTime()
      })
    }

    await this.persist()

    console.log(`[GoalTracker] Goal progress: ${goal.title} (${oldProgress}% → ${goal.progress}%)`)

    return goal
  }

  /**
   * Mark goal as achieved
   *
   * @param {string} goalId - Goal ID
   * @param {string} note - Achievement note
   * @returns {Promise<object>} Achieved goal
   */
  async achieveGoal(goalId, note = '') {
    const goal = this.goals.get(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    if (goal.state !== GOAL_STATES.ACTIVE) {
      throw new Error(`Goal is not active: ${goal.state}`)
    }

    goal.state = GOAL_STATES.ACHIEVED
    goal.achievedAt = new Date().toISOString()
    goal.progress = 100

    if (note) {
      goal.notes.push({
        timestamp: new Date().toISOString(),
        text: `Achieved: ${note}`,
        progress: 100
      })
    }

    this.stats.activeGoals--
    this.stats.achievedGoals++

    const completionTime = Date.now() - new Date(goal.createdAt).getTime()
    this.goalHistory.push({ ...goal, completionTime })

    await this.persist()

    console.log(`[GoalTracker] Goal achieved: ${goal.title}`)

    return goal
  }

  /**
   * Abandon a goal
   *
   * @param {string} goalId - Goal ID
   * @param {string} reason - Reason for abandonment
   * @returns {Promise<object>} Abandoned goal
   */
  async abandonGoal(goalId, reason = '') {
    const goal = this.goals.get(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    goal.state = GOAL_STATES.ABANDONED
    goal.abandonedAt = new Date().toISOString()
    goal.abandonReason = reason

    if (reason) {
      goal.notes.push({
        timestamp: new Date().toISOString(),
        text: `Abandoned: ${reason}`,
        progress: goal.progress
      })
    }

    if (goal.state === GOAL_STATES.ACTIVE) {
      this.stats.activeGoals--
    }
    this.stats.abandonedGoals++

    await this.persist()

    console.log(`[GoalTracker] Goal abandoned: ${goal.title}`)

    return goal
  }

  /**
   * Defer a goal
   *
   * @param {string} goalId - Goal ID
   * @param {string} newTargetDate - New target date
   * @returns {Promise<object>} Deferred goal
   */
  async deferGoal(goalId, newTargetDate = null) {
    const goal = this.goals.get(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    goal.state = GOAL_STATES.DEFERRED
    goal.deferredAt = new Date().toISOString()

    if (newTargetDate) {
      goal.targetDate = newTargetDate
    }

    if (goal.state === GOAL_STATES.ACTIVE) {
      this.stats.activeGoals--
    }

    await this.persist()

    return goal
  }

  /**
   * Resume a deferred goal
   *
   * @param {string} goalId - Goal ID
   * @returns {Promise<object>} Resumed goal
   */
  async resumeGoal(goalId) {
    const goal = this.goals.get(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    if (goal.state !== GOAL_STATES.DEFERRED) {
      throw new Error(`Goal is not deferred: ${goal.state}`)
    }

    goal.state = GOAL_STATES.ACTIVE
    goal.resumedAt = new Date().toISOString()
    this.stats.activeGoals++

    await this.persist()

    return goal
  }

  /**
   * Get active goals
   *
   * @param {object} filters - Filters
   * @returns {array} Active goals
   */
  getActiveGoals(filters = {}) {
    let goals = Array.from(this.goals.values())
      .filter(g => g.state === GOAL_STATES.ACTIVE)

    if (filters.type) {
      goals = goals.filter(g => g.type === filters.type)
    }

    if (filters.priority) {
      goals = goals.filter(g => g.priority === filters.priority)
    }

    // Sort by priority and progress
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    goals.sort((a, b) => {
      const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
      if (priorityDiff !== 0) return priorityDiff

      return a.progress - b.progress // Lower progress first
    })

    return goals
  }

  /**
   * Get goal by ID
   *
   * @param {string} goalId - Goal ID
   * @returns {object|null} Goal
   */
  getGoal(goalId) {
    return this.goals.get(goalId) || null
  }

  /**
   * Get all goals
   *
   * @param {object} filters - Filters
   * @returns {array} Goals
   */
  getAllGoals(filters = {}) {
    let goals = Array.from(this.goals.values())

    if (filters.state) {
      goals = goals.filter(g => g.state === filters.state)
    }

    if (filters.type) {
      goals = goals.filter(g => g.type === filters.type)
    }

    return goals
  }

  /**
   * Get goals related to a value
   *
   * @param {string} valueId - Value ID
   * @returns {array} Related goals
   */
  getGoalsForValue(valueId) {
    return Array.from(this.goals.values())
      .filter(g => g.relatedValues.includes(valueId))
  }

  /**
   * Suggest goals based on context
   *
   * @param {object} context - Context (insights, patterns, etc.)
   * @returns {array} Suggested goals
   */
  suggestGoals(context = {}) {
    const suggestions = []

    // Suggest based on biases detected
    if (context.biasesDetected && context.biasesDetected.length > 0) {
      suggestions.push({
        title: 'Reduce detected biases',
        description: `Address ${context.biasesDetected.length} detected bias patterns`,
        type: 'improvement',
        priority: 'high',
        metrics: {
          targetBiasReduction: 50 // %
        }
      })
    }

    // Suggest based on error patterns
    if (context.errorRate && context.errorRate > 0.1) {
      suggestions.push({
        title: 'Improve error handling',
        description: `Current error rate: ${Math.round(context.errorRate * 100)}%`,
        type: 'optimization',
        priority: 'high',
        metrics: {
          targetErrorRate: 0.05
        }
      })
    }

    // Suggest learning goals
    if (context.novelPatterns && context.novelPatterns.length > 0) {
      suggestions.push({
        title: 'Investigate novel patterns',
        description: `Explore ${context.novelPatterns.length} new patterns discovered`,
        type: 'learning',
        priority: 'medium'
      })
    }

    return suggestions
  }

  /**
   * Update statistics
   */
  updateStats() {
    this.stats.totalGoals = this.goals.size
    this.stats.activeGoals = Array.from(this.goals.values())
      .filter(g => g.state === GOAL_STATES.ACTIVE).length
    this.stats.achievedGoals = Array.from(this.goals.values())
      .filter(g => g.state === GOAL_STATES.ACHIEVED).length
    this.stats.abandonedGoals = Array.from(this.goals.values())
      .filter(g => g.state === GOAL_STATES.ABANDONED).length

    // Calculate avg completion time
    if (this.goalHistory.length > 0) {
      const totalTime = this.goalHistory.reduce((sum, g) => sum + (g.completionTime || 0), 0)
      this.stats.avgCompletionTime = totalTime / this.goalHistory.length
    }
  }

  /**
   * Persist goals to disk
   *
   * @returns {Promise<void>}
   */
  async persist() {
    try {
      const data = {
        goals: Array.from(this.goals.entries()),
        goalHistory: this.goalHistory.slice(-50), // Keep last 50
        stats: this.stats,
        savedAt: new Date().toISOString()
      }

      const dir = path.dirname(this.storageFile)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.storageFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[GoalTracker] Failed to persist goals:', error)
    }
  }

  /**
   * Load goals from disk
   *
   * @returns {Promise<void>}
   */
  async loadGoals() {
    try {
      const data = await fs.readFile(this.storageFile, 'utf-8')
      const parsed = JSON.parse(data)

      this.goals = new Map(parsed.goals || [])
      this.goalHistory = parsed.goalHistory || []
      this.stats = parsed.stats || this.stats
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[GoalTracker] Failed to load goals:', error)
      }
    }
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    this.updateStats()
    return {
      ...this.stats,
      achievementRate: this.stats.totalGoals > 0
        ? (this.stats.achievedGoals / this.stats.totalGoals) * 100
        : 0
    }
  }
}
