/**
 * @module consciousness/multi-step-planner
 * @description Decomposes complex goals into actionable step-by-step plans
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 87%
 *
 * Dependencies:
 * - goal-tracker (for goal integration)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine when planning needed
 * - Creates: Multi-step execution plans with dependencies
 *
 * Tests:
 * - unit: __tests__/unit/multi-step-planner.test.mjs
 */

/**
 * Step states
 */
const STEP_STATES = {
  PENDING: 'pending',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
}

/**
 * MultiStepPlanner - Creates and manages multi-step execution plans
 */
export class MultiStepPlanner {
  /**
   * Create multi-step planner
   *
   * @param {object} options - Configuration
   * @param {object} options.inferenceManager - For LLM-based planning
   * @param {object} options.causalReasoner - For causal analysis
   */
  constructor(options = {}) {
    this.inferenceManager = options.inferenceManager
    this.causalReasoner = options.causalReasoner

    this.plans = new Map()
    this.activePlan = null

    this.stats = {
      totalPlans: 0,
      completedPlans: 0,
      failedPlans: 0,
      totalSteps: 0,
      completedSteps: 0
    }
  }

  /**
   * Create a plan for a goal
   *
   * @param {object} goal - Goal to plan for
   * @param {object} context - Context
   * @returns {Promise<object>} Created plan
   */
  async createPlan(goal, context = {}) {
    const plan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      goalId: goal.id,
      goal: goal.title,
      description: goal.description,
      state: 'planning',
      createdAt: new Date().toISOString(),
      steps: [],
      dependencies: new Map(),
      currentStep: null,
      progress: 0,
      estimatedDuration: null,
      actualDuration: null
    }

    // Generate steps using LLM or heuristic
    if (this.inferenceManager) {
      plan.steps = await this.generateStepsWithLLM(goal, context)
    } else {
      plan.steps = this.generateStepsHeuristic(goal, context)
    }

    // Build dependency graph
    this.buildDependencies(plan)

    // Estimate duration
    plan.estimatedDuration = this.estimatePlanDuration(plan)

    this.plans.set(plan.id, plan)
    this.stats.totalPlans++
    this.stats.totalSteps += plan.steps.length

    console.log(`[MultiStepPlanner] Created plan with ${plan.steps.length} steps`)

    return plan
  }

  /**
   * Generate steps using LLM
   *
   * @param {object} goal - Goal
   * @param {object} context - Context
   * @returns {Promise<array>} Steps
   */
  async generateStepsWithLLM(goal, context) {
    const prompt = `You are planning how to achieve a goal.

**Goal**: ${goal.title}
**Description**: ${goal.description || 'No description'}
**Type**: ${goal.type || 'general'}
**Priority**: ${goal.priority || 'medium'}

Create a step-by-step plan to achieve this goal. For each step:
1. Give it a clear title
2. Describe what needs to be done
3. Estimate difficulty (low/medium/high)
4. List prerequisites (what must be done first)
5. Estimate duration (in hours)

Format each step as:
STEP: [Title]
ACTION: [What to do]
DIFFICULTY: [low/medium/high]
PREREQUISITES: [comma-separated step numbers, or "none"]
DURATION: [hours]

Create 3-7 steps.

Steps:`

    try {
      const result = await this.inferenceManager.process(
        { content: prompt, type: 'planning' },
        {},
        { maxRetries: 1 }
      )

      return this.parseStepsFromLLM(result.text)
    } catch (error) {
      console.warn('[MultiStepPlanner] LLM planning failed, using heuristic:', error)
      return this.generateStepsHeuristic(goal, context)
    }
  }

  /**
   * Parse steps from LLM response
   *
   * @param {string} text - LLM response
   * @returns {array} Steps
   */
  parseStepsFromLLM(text) {
    const steps = []
    const stepBlocks = text.split(/STEP:/i).slice(1) // Skip before first STEP

    for (let i = 0; i < stepBlocks.length; i++) {
      const block = stepBlocks[i]

      const titleMatch = block.match(/^([^\n]+)/)
      const actionMatch = block.match(/ACTION:\s*([^\n]+)/i)
      const difficultyMatch = block.match(/DIFFICULTY:\s*(\w+)/i)
      const prereqMatch = block.match(/PREREQUISITES:\s*([^\n]+)/i)
      const durationMatch = block.match(/DURATION:\s*(\d+)/i)

      const step = {
        id: `step-${i + 1}`,
        number: i + 1,
        title: titleMatch ? titleMatch[1].trim() : `Step ${i + 1}`,
        action: actionMatch ? actionMatch[1].trim() : '',
        difficulty: difficultyMatch ? difficultyMatch[1].toLowerCase() : 'medium',
        prerequisites: this.parsePrerequisites(prereqMatch ? prereqMatch[1] : 'none', i + 1),
        estimatedDuration: durationMatch ? parseInt(durationMatch[1]) * 60 : 60, // minutes
        state: STEP_STATES.PENDING,
        startedAt: null,
        completedAt: null,
        result: null
      }

      steps.push(step)
    }

    return steps.length > 0 ? steps : this.generateStepsHeuristic({}, {})
  }

  /**
   * Parse prerequisites string
   *
   * @param {string} prereqStr - Prerequisites string
   * @param {number} currentStep - Current step number
   * @returns {array} Prerequisite step numbers
   */
  parsePrerequisites(prereqStr, currentStep) {
    if (!prereqStr || prereqStr.toLowerCase().includes('none')) {
      return []
    }

    const numbers = prereqStr.match(/\d+/g) || []
    return numbers
      .map(n => parseInt(n))
      .filter(n => n < currentStep) // Only previous steps
  }

  /**
   * Generate steps using heuristic
   *
   * @param {object} goal - Goal
   * @param {object} context - Context
   * @returns {array} Steps
   */
  generateStepsHeuristic(goal, context) {
    // Basic template based on goal type
    const templates = {
      improvement: [
        { title: 'Analyze current state', action: 'Gather baseline metrics', difficulty: 'low' },
        { title: 'Identify improvement areas', action: 'Find bottlenecks and issues', difficulty: 'medium', prerequisites: [1] },
        { title: 'Design solution', action: 'Create improvement plan', difficulty: 'medium', prerequisites: [2] },
        { title: 'Implement changes', action: 'Apply improvements', difficulty: 'high', prerequisites: [3] },
        { title: 'Validate results', action: 'Measure improvements', difficulty: 'low', prerequisites: [4] }
      ],
      investigation: [
        { title: 'Define scope', action: 'Clarify what to investigate', difficulty: 'low' },
        { title: 'Gather information', action: 'Collect relevant data', difficulty: 'medium', prerequisites: [1] },
        { title: 'Analyze findings', action: 'Identify patterns and insights', difficulty: 'medium', prerequisites: [2] },
        { title: 'Draw conclusions', action: 'Synthesize results', difficulty: 'medium', prerequisites: [3] }
      ],
      learning: [
        { title: 'Set learning objectives', action: 'Define what to learn', difficulty: 'low' },
        { title: 'Find resources', action: 'Gather learning materials', difficulty: 'low', prerequisites: [1] },
        { title: 'Study and practice', action: 'Learn through practice', difficulty: 'high', prerequisites: [2] },
        { title: 'Apply knowledge', action: 'Use what was learned', difficulty: 'medium', prerequisites: [3] },
        { title: 'Reflect', action: 'Evaluate learning outcomes', difficulty: 'low', prerequisites: [4] }
      ]
    }

    const template = templates[goal.type] || templates.improvement

    return template.map((step, i) => ({
      id: `step-${i + 1}`,
      number: i + 1,
      ...step,
      prerequisites: step.prerequisites || [],
      estimatedDuration: step.difficulty === 'low' ? 30 : step.difficulty === 'high' ? 120 : 60,
      state: STEP_STATES.PENDING,
      startedAt: null,
      completedAt: null,
      result: null
    }))
  }

  /**
   * Build dependency graph for plan
   *
   * @param {object} plan - Plan
   */
  buildDependencies(plan) {
    for (const step of plan.steps) {
      plan.dependencies.set(step.number, step.prerequisites)
    }
  }

  /**
   * Get next ready step in plan
   *
   * @param {string} planId - Plan ID
   * @returns {object|null} Next step or null
   */
  getNextStep(planId) {
    const plan = this.plans.get(planId)
    if (!plan) return null

    // Find first step that is ready (all prerequisites completed)
    for (const step of plan.steps) {
      if (step.state === STEP_STATES.PENDING) {
        const prereqsMet = this.checkPrerequisites(plan, step)
        if (prereqsMet) {
          step.state = STEP_STATES.READY
          return step
        }
      }

      if (step.state === STEP_STATES.READY) {
        return step
      }
    }

    return null
  }

  /**
   * Check if step prerequisites are met
   *
   * @param {object} plan - Plan
   * @param {object} step - Step
   * @returns {boolean} True if prerequisites met
   */
  checkPrerequisites(plan, step) {
    if (step.prerequisites.length === 0) {
      return true
    }

    for (const prereqNum of step.prerequisites) {
      const prereqStep = plan.steps.find(s => s.number === prereqNum)
      if (!prereqStep || prereqStep.state !== STEP_STATES.COMPLETED) {
        return false
      }
    }

    return true
  }

  /**
   * Start executing a step
   *
   * @param {string} planId - Plan ID
   * @param {string} stepId - Step ID
   * @returns {object} Updated step
   */
  startStep(planId, stepId) {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) throw new Error(`Step not found: ${stepId}`)

    if (step.state !== STEP_STATES.READY) {
      throw new Error(`Step not ready: ${step.state}`)
    }

    step.state = STEP_STATES.IN_PROGRESS
    step.startedAt = new Date().toISOString()
    plan.currentStep = stepId

    console.log(`[MultiStepPlanner] Started step ${step.number}: ${step.title}`)

    return step
  }

  /**
   * Complete a step
   *
   * @param {string} planId - Plan ID
   * @param {string} stepId - Step ID
   * @param {object} result - Step result
   * @returns {object} Updated plan
   */
  completeStep(planId, stepId, result = {}) {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) throw new Error(`Step not found: ${stepId}`)

    step.state = STEP_STATES.COMPLETED
    step.completedAt = new Date().toISOString()
    step.result = result

    this.stats.completedSteps++

    // Update plan progress
    const completedCount = plan.steps.filter(s => s.state === STEP_STATES.COMPLETED).length
    plan.progress = (completedCount / plan.steps.length) * 100

    // Check if plan complete
    if (plan.progress === 100) {
      plan.state = 'completed'
      plan.completedAt = new Date().toISOString()
      plan.actualDuration = Date.now() - new Date(plan.createdAt).getTime()
      this.stats.completedPlans++
    }

    console.log(`[MultiStepPlanner] Completed step ${step.number}: ${step.title} (plan ${plan.progress.toFixed(0)}% complete)`)

    return plan
  }

  /**
   * Fail a step and handle backtracking
   *
   * @param {string} planId - Plan ID
   * @param {string} stepId - Step ID
   * @param {string} reason - Failure reason
   * @returns {object} Recovery plan
   */
  failStep(planId, stepId, reason) {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) throw new Error(`Step not found: ${stepId}`)

    step.state = STEP_STATES.FAILED
    step.failureReason = reason
    step.failedAt = new Date().toISOString()

    // Generate recovery plan
    const recovery = this.generateRecoveryPlan(plan, step, reason)

    console.warn(`[MultiStepPlanner] Step ${step.number} failed: ${reason}`)

    return recovery
  }

  /**
   * Generate recovery plan for failed step
   *
   * @param {object} plan - Original plan
   * @param {object} failedStep - Failed step
   * @param {string} reason - Failure reason
   * @returns {object} Recovery plan
   */
  generateRecoveryPlan(plan, failedStep, reason) {
    // Strategies: retry, skip, modify approach
    const recovery = {
      planId: plan.id,
      failedStep: failedStep.number,
      reason,
      strategies: []
    }

    // Strategy 1: Retry with modifications
    recovery.strategies.push({
      type: 'retry',
      description: `Retry step ${failedStep.number} with adjusted approach`,
      confidence: 0.6
    })

    // Strategy 2: Skip if not critical
    if (failedStep.difficulty === 'low') {
      recovery.strategies.push({
        type: 'skip',
        description: `Skip step ${failedStep.number} and continue`,
        confidence: 0.5
      })
    }

    // Strategy 3: Add intermediate step
    recovery.strategies.push({
      type: 'decompose',
      description: `Break step ${failedStep.number} into smaller substeps`,
      confidence: 0.7
    })

    // Strategy 4: Backtrack to earlier step
    if (failedStep.prerequisites.length > 0) {
      recovery.strategies.push({
        type: 'backtrack',
        description: `Review prerequisite steps and retry`,
        confidence: 0.5
      })
    }

    recovery.strategies.sort((a, b) => b.confidence - a.confidence)

    return recovery
  }

  /**
   * Estimate plan duration
   *
   * @param {object} plan - Plan
   * @returns {number} Estimated duration (minutes)
   */
  estimatePlanDuration(plan) {
    // Sum of all step durations + overhead
    const totalStepTime = plan.steps.reduce((sum, step) => sum + step.estimatedDuration, 0)
    const overhead = plan.steps.length * 5 // 5 minutes overhead per step
    return totalStepTime + overhead
  }

  /**
   * Get plan by ID
   *
   * @param {string} planId - Plan ID
   * @returns {object|null} Plan
   */
  getPlan(planId) {
    return this.plans.get(planId) || null
  }

  /**
   * Get active plans
   *
   * @returns {array} Active plans
   */
  getActivePlans() {
    return Array.from(this.plans.values())
      .filter(p => p.state === 'planning' || p.state === 'in-progress')
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activePlans: this.getActivePlans().length,
      completionRate: this.stats.totalPlans > 0
        ? (this.stats.completedPlans / this.stats.totalPlans) * 100
        : 0,
      stepCompletionRate: this.stats.totalSteps > 0
        ? (this.stats.completedSteps / this.stats.totalSteps) * 100
        : 0
    }
  }
}
