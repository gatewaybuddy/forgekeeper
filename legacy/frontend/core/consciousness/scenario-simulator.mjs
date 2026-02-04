/**
 * @module consciousness/scenario-simulator
 * @description Runs counterfactual "what-if" scenario simulations
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 84%
 *
 * Dependencies:
 * - causal-reasoner (for outcome prediction)
 * - multi-step-planner (for action sequences)
 *
 * Integration points:
 * - Called by: DecisionAnalyzer for option comparison
 * - Uses: CausalReasoner predictions, MultiStepPlanner for steps
 *
 * Tests:
 * - unit: __tests__/unit/scenario-simulator.test.mjs
 */

/**
 * Scenario types
 */
const SCENARIO_TYPES = {
  DECISION: 'decision',           // Simulate decision outcomes
  INTERVENTION: 'intervention',   // Simulate intervention effects
  EXPLORATION: 'exploration',     // Explore possibilities
  COUNTERFACTUAL: 'counterfactual' // What-if alternative history
}

/**
 * Scenario states
 */
const SCENARIO_STATES = {
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

/**
 * ScenarioSimulator - Simulates alternative scenarios and outcomes
 */
export class ScenarioSimulator {
  /**
   * Create scenario simulator
   *
   * @param {object} options - Configuration
   * @param {object} options.causalReasoner - For outcome prediction
   * @param {object} options.multiStepPlanner - For action planning
   * @param {object} options.inferenceManager - For LLM simulation
   * @param {number} options.maxSimulationSteps - Max steps per simulation (default: 10)
   * @param {number} options.uncertaintyThreshold - Threshold for uncertain predictions (default: 0.5)
   */
  constructor(options = {}) {
    this.causalReasoner = options.causalReasoner
    this.multiStepPlanner = options.multiStepPlanner
    this.inferenceManager = options.inferenceManager

    this.maxSimulationSteps = options.maxSimulationSteps || 10
    this.uncertaintyThreshold = options.uncertaintyThreshold || 0.5

    this.scenarios = new Map()
    this.stats = {
      totalScenarios: 0,
      completedScenarios: 0,
      failedScenarios: 0,
      scenariosByType: {}
    }
  }

  /**
   * Create a new scenario
   *
   * @param {object} config - Scenario configuration
   * @param {string} config.type - Scenario type
   * @param {string} config.description - What to simulate
   * @param {object} config.initialState - Starting conditions
   * @param {array} config.actions - Actions to simulate
   * @param {object} config.context - Context data
   * @returns {object} Created scenario
   */
  createScenario(config) {
    const scenario = {
      id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: config.type || SCENARIO_TYPES.EXPLORATION,
      description: config.description,
      initialState: config.initialState || {},
      actions: config.actions || [],
      context: config.context || {},
      state: SCENARIO_STATES.INITIALIZED,
      createdAt: new Date().toISOString(),
      steps: [],
      currentStep: 0,
      predictions: [],
      outcomes: null,
      confidence: null,
      risks: [],
      opportunities: []
    }

    this.scenarios.set(scenario.id, scenario)
    this.stats.totalScenarios++
    this.stats.scenariosByType[scenario.type] =
      (this.stats.scenariosByType[scenario.type] || 0) + 1

    console.log(`[ScenarioSimulator] Created scenario: ${scenario.description}`)

    return scenario
  }

  /**
   * Run a scenario simulation
   *
   * @param {string} scenarioId - Scenario ID
   * @returns {Promise<object>} Simulation result
   */
  async runSimulation(scenarioId) {
    const scenario = this.scenarios.get(scenarioId)
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`)
    }

    scenario.state = SCENARIO_STATES.RUNNING
    scenario.startedAt = new Date().toISOString()

    try {
      // Step 1: Set up initial state
      let currentState = { ...scenario.initialState }
      const simulationSteps = []

      // Step 2: Simulate each action
      for (const action of scenario.actions) {
        if (simulationSteps.length >= this.maxSimulationSteps) {
          console.warn('[ScenarioSimulator] Max steps reached, stopping simulation')
          break
        }

        const stepResult = await this.simulateStep(
          action,
          currentState,
          scenario.context
        )

        simulationSteps.push(stepResult)
        currentState = stepResult.newState
        scenario.currentStep++

        // Check for critical failure
        if (stepResult.criticalFailure) {
          console.warn(`[ScenarioSimulator] Critical failure in step ${scenario.currentStep}`)
          break
        }
      }

      scenario.steps = simulationSteps

      // Step 3: Predict final outcomes using causal reasoning
      const predictions = await this.predictOutcomes(scenario, currentState)
      scenario.predictions = predictions

      // Step 4: Assess risks and opportunities
      const assessment = this.assessScenario(scenario, currentState)
      scenario.risks = assessment.risks
      scenario.opportunities = assessment.opportunities
      scenario.confidence = assessment.overallConfidence

      // Step 5: Generate final outcome summary
      scenario.outcomes = await this.generateOutcomeSummary(scenario)

      scenario.state = SCENARIO_STATES.COMPLETED
      scenario.completedAt = new Date().toISOString()
      this.stats.completedScenarios++

      console.log(`[ScenarioSimulator] Completed scenario: ${scenario.description}`)

      return {
        scenarioId: scenario.id,
        success: true,
        steps: simulationSteps,
        predictions: scenario.predictions,
        outcomes: scenario.outcomes,
        confidence: scenario.confidence,
        risks: scenario.risks,
        opportunities: scenario.opportunities
      }
    } catch (error) {
      scenario.state = SCENARIO_STATES.FAILED
      scenario.error = error.message
      scenario.failedAt = new Date().toISOString()
      this.stats.failedScenarios++

      console.error(`[ScenarioSimulator] Scenario failed: ${error.message}`)

      return {
        scenarioId: scenario.id,
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Simulate a single step
   *
   * @param {object} action - Action to simulate
   * @param {object} currentState - Current state
   * @param {object} context - Context
   * @returns {Promise<object>} Step result
   */
  async simulateStep(action, currentState, context) {
    const stepResult = {
      action: action.type || action.name,
      description: action.description,
      startState: { ...currentState },
      newState: { ...currentState },
      effects: [],
      probability: 1.0,
      criticalFailure: false
    }

    // Use causal reasoner to predict effects
    if (this.causalReasoner) {
      const actionEvent = {
        type: action.type || action.name,
        category: 'action',
        timestamp: new Date().toISOString()
      }

      const predictedEffects = this.causalReasoner.predictEffects(actionEvent)

      for (const effect of predictedEffects) {
        stepResult.effects.push({
          type: effect.event,
          probability: effect.probability,
          reasoning: effect.reasoning
        })

        // Apply effect to state
        this.applyEffectToState(stepResult.newState, effect)

        // Check for critical failure
        if (this.isCriticalEffect(effect)) {
          stepResult.criticalFailure = true
        }
      }

      // Calculate overall probability
      if (predictedEffects.length > 0) {
        stepResult.probability = predictedEffects.reduce(
          (sum, e) => sum + e.probability,
          0
        ) / predictedEffects.length
      }
    }

    // Use LLM for more detailed simulation if available
    if (this.inferenceManager && action.requiresLLM) {
      const llmResult = await this.simulateWithLLM(action, currentState, context)
      stepResult.llmAnalysis = llmResult
      this.mergeLLMResultsIntoState(stepResult.newState, llmResult)
    }

    return stepResult
  }

  /**
   * Apply predicted effect to state
   *
   * @param {object} state - State to modify
   * @param {object} effect - Effect to apply
   */
  applyEffectToState(state, effect) {
    const effectType = effect.event

    // Simple heuristic for state changes
    if (effectType.includes('increase') || effectType.includes('improve')) {
      state.score = (state.score || 50) + 10
    } else if (effectType.includes('decrease') || effectType.includes('worsen')) {
      state.score = (state.score || 50) - 10
    }

    if (effectType.includes('error') || effectType.includes('failure')) {
      state.errors = (state.errors || 0) + 1
    }

    if (effectType.includes('success') || effectType.includes('complete')) {
      state.successes = (state.successes || 0) + 1
    }

    // Store effect in history
    if (!state.effectHistory) {
      state.effectHistory = []
    }
    state.effectHistory.push({
      type: effectType,
      probability: effect.probability,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Check if effect is critical
   *
   * @param {object} effect - Effect
   * @returns {boolean} True if critical
   */
  isCriticalEffect(effect) {
    const criticalKeywords = ['fatal', 'crash', 'security', 'data loss', 'breach']
    const effectType = effect.event.toLowerCase()

    return criticalKeywords.some(keyword => effectType.includes(keyword))
  }

  /**
   * Simulate step with LLM
   *
   * @param {object} action - Action
   * @param {object} currentState - Current state
   * @param {object} context - Context
   * @returns {Promise<object>} LLM result
   */
  async simulateWithLLM(action, currentState, context) {
    const prompt = `You are simulating the outcome of an action.

**Action**: ${action.description || action.type}
**Current State**: ${JSON.stringify(currentState, null, 2)}
**Context**: ${JSON.stringify(context, null, 2)}

Predict what will happen after this action is taken. Consider:
1. Immediate effects
2. Side effects
3. Potential risks
4. Probability of success

Respond with:
- SUCCESS_PROBABILITY: [0.0-1.0]
- IMMEDIATE_EFFECTS: [list]
- SIDE_EFFECTS: [list]
- RISKS: [list]
- NEW_STATE: [brief description]`

    try {
      const result = await this.inferenceManager.process(
        { content: prompt, type: 'simulation' },
        {},
        { maxRetries: 1 }
      )

      return this.parseLLMSimulation(result.text)
    } catch (error) {
      console.warn('[ScenarioSimulator] LLM simulation failed:', error)
      return {
        successProbability: 0.5,
        effects: [],
        risks: [],
        newState: currentState
      }
    }
  }

  /**
   * Parse LLM simulation response
   *
   * @param {string} text - LLM response
   * @returns {object} Parsed result
   */
  parseLLMSimulation(text) {
    const result = {
      successProbability: 0.5,
      effects: [],
      sideEffects: [],
      risks: [],
      newState: {}
    }

    const probMatch = text.match(/SUCCESS_PROBABILITY:\s*([\d.]+)/i)
    if (probMatch) {
      result.successProbability = parseFloat(probMatch[1])
    }

    const effectsMatch = text.match(/IMMEDIATE_EFFECTS:\s*([^\n]+)/i)
    if (effectsMatch) {
      result.effects = effectsMatch[1].split(/[,;]/).map(e => e.trim())
    }

    const sideEffectsMatch = text.match(/SIDE_EFFECTS:\s*([^\n]+)/i)
    if (sideEffectsMatch) {
      result.sideEffects = sideEffectsMatch[1].split(/[,;]/).map(e => e.trim())
    }

    const risksMatch = text.match(/RISKS:\s*([^\n]+)/i)
    if (risksMatch) {
      result.risks = risksMatch[1].split(/[,;]/).map(r => r.trim())
    }

    return result
  }

  /**
   * Merge LLM results into state
   *
   * @param {object} state - State to update
   * @param {object} llmResult - LLM result
   */
  mergeLLMResultsIntoState(state, llmResult) {
    state.llmSuccessProbability = llmResult.successProbability

    if (llmResult.effects.length > 0) {
      state.llmEffects = llmResult.effects
    }

    if (llmResult.risks.length > 0) {
      state.llmRisks = llmResult.risks
    }
  }

  /**
   * Predict final outcomes
   *
   * @param {object} scenario - Scenario
   * @param {object} finalState - Final state
   * @returns {Promise<array>} Predictions
   */
  async predictOutcomes(scenario, finalState) {
    const predictions = []

    // Use causal chains to predict downstream effects
    if (this.causalReasoner) {
      const chains = this.causalReasoner.causalChains

      for (const chain of chains.slice(0, 5)) { // Top 5 chains
        predictions.push({
          type: 'causal-chain',
          description: `Chain: ${chain.steps.map(s => s.event).join(' → ')}`,
          confidence: chain.confidence,
          reasoning: 'Based on observed causal patterns'
        })
      }
    }

    // Analyze final state
    predictions.push({
      type: 'state-analysis',
      description: this.describeState(finalState),
      confidence: this.calculateStateConfidence(finalState),
      reasoning: 'Based on final state metrics'
    })

    return predictions
  }

  /**
   * Describe state in human-readable form
   *
   * @param {object} state - State
   * @returns {string} Description
   */
  describeState(state) {
    const parts = []

    if (state.score !== undefined) {
      parts.push(`Score: ${state.score}`)
    }

    if (state.successes) {
      parts.push(`${state.successes} success(es)`)
    }

    if (state.errors) {
      parts.push(`${state.errors} error(s)`)
    }

    if (state.effectHistory && state.effectHistory.length > 0) {
      parts.push(`${state.effectHistory.length} effect(s) applied`)
    }

    return parts.length > 0 ? parts.join(', ') : 'No significant changes'
  }

  /**
   * Calculate confidence in state
   *
   * @param {object} state - State
   * @returns {number} Confidence 0-1
   */
  calculateStateConfidence(state) {
    let confidence = 0.5

    // More effects = lower confidence (more uncertainty)
    if (state.effectHistory) {
      confidence -= Math.min(state.effectHistory.length * 0.05, 0.3)
    }

    // Errors reduce confidence
    if (state.errors) {
      confidence -= Math.min(state.errors * 0.1, 0.3)
    }

    // Successes increase confidence
    if (state.successes) {
      confidence += Math.min(state.successes * 0.1, 0.3)
    }

    // LLM probability
    if (state.llmSuccessProbability !== undefined) {
      confidence = (confidence + state.llmSuccessProbability) / 2
    }

    return Math.max(0, Math.min(1, confidence))
  }

  /**
   * Assess scenario for risks and opportunities
   *
   * @param {object} scenario - Scenario
   * @param {object} finalState - Final state
   * @returns {object} Assessment
   */
  assessScenario(scenario, finalState) {
    const risks = []
    const opportunities = []

    // Risk: Low success probability in steps
    const lowProbSteps = scenario.steps.filter(s => s.probability < this.uncertaintyThreshold)
    if (lowProbSteps.length > 0) {
      risks.push({
        type: 'uncertain-outcomes',
        severity: 'medium',
        description: `${lowProbSteps.length} step(s) have uncertain outcomes`,
        affectedSteps: lowProbSteps.map((s, i) => i)
      })
    }

    // Risk: Critical failures
    const criticalSteps = scenario.steps.filter(s => s.criticalFailure)
    if (criticalSteps.length > 0) {
      risks.push({
        type: 'critical-failure',
        severity: 'high',
        description: 'Critical failure detected in simulation',
        affectedSteps: criticalSteps.map((s, i) => i)
      })
    }

    // Risk: High error count
    if (finalState.errors && finalState.errors > 2) {
      risks.push({
        type: 'error-accumulation',
        severity: 'high',
        description: `${finalState.errors} errors accumulated`,
        count: finalState.errors
      })
    }

    // Opportunity: High success count
    if (finalState.successes && finalState.successes > 3) {
      opportunities.push({
        type: 'success-chain',
        value: 'high',
        description: `${finalState.successes} successful outcomes`,
        count: finalState.successes
      })
    }

    // Opportunity: High score
    if (finalState.score && finalState.score > 70) {
      opportunities.push({
        type: 'high-score',
        value: 'medium',
        description: `Final score: ${finalState.score}`,
        score: finalState.score
      })
    }

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(risks, opportunities, scenario)

    return {
      risks,
      opportunities,
      overallConfidence
    }
  }

  /**
   * Calculate overall confidence
   *
   * @param {array} risks - Risks
   * @param {array} opportunities - Opportunities
   * @param {object} scenario - Scenario
   * @returns {number} Confidence 0-1
   */
  calculateOverallConfidence(risks, opportunities, scenario) {
    let confidence = 0.7 // Base confidence

    // Reduce for risks
    const highRisks = risks.filter(r => r.severity === 'high').length
    const medRisks = risks.filter(r => r.severity === 'medium').length
    confidence -= (highRisks * 0.15 + medRisks * 0.1)

    // Increase for opportunities
    const highOpps = opportunities.filter(o => o.value === 'high').length
    const medOpps = opportunities.filter(o => o.value === 'medium').length
    confidence += (highOpps * 0.1 + medOpps * 0.05)

    // Average step probabilities
    if (scenario.steps.length > 0) {
      const avgProbability = scenario.steps.reduce((sum, s) => sum + s.probability, 0) / scenario.steps.length
      confidence = (confidence + avgProbability) / 2
    }

    return Math.max(0, Math.min(1, confidence))
  }

  /**
   * Generate outcome summary
   *
   * @param {object} scenario - Scenario
   * @returns {Promise<object>} Summary
   */
  async generateOutcomeSummary(scenario) {
    const summary = {
      description: scenario.description,
      stepsCompleted: scenario.steps.length,
      finalState: scenario.steps[scenario.steps.length - 1]?.newState || {},
      overallSuccess: scenario.confidence > 0.6,
      confidence: scenario.confidence,
      keyFindings: []
    }

    // Extract key findings
    if (scenario.risks.length > 0) {
      summary.keyFindings.push({
        type: 'risk',
        message: `${scenario.risks.length} risk(s) identified`,
        details: scenario.risks
      })
    }

    if (scenario.opportunities.length > 0) {
      summary.keyFindings.push({
        type: 'opportunity',
        message: `${scenario.opportunities.length} opportunity(ies) identified`,
        details: scenario.opportunities
      })
    }

    // Critical failures
    const criticalFailures = scenario.steps.filter(s => s.criticalFailure)
    if (criticalFailures.length > 0) {
      summary.keyFindings.push({
        type: 'critical',
        message: 'Critical failure in simulation',
        step: criticalFailures[0].action
      })
    }

    return summary
  }

  /**
   * Compare multiple scenarios
   *
   * @param {array} scenarioIds - Scenario IDs to compare
   * @returns {object} Comparison
   */
  compareScenarios(scenarioIds) {
    const scenarios = scenarioIds.map(id => this.scenarios.get(id)).filter(s => s)

    if (scenarios.length < 2) {
      throw new Error('Need at least 2 scenarios to compare')
    }

    const comparison = {
      scenarios: scenarios.map(s => ({
        id: s.id,
        description: s.description,
        confidence: s.confidence,
        risks: s.risks.length,
        opportunities: s.opportunities.length,
        stepsCompleted: s.steps.length
      })),
      recommendation: null,
      reasoning: []
    }

    // Find best by confidence
    const bestByConfidence = scenarios.reduce((best, s) =>
      (s.confidence || 0) > (best.confidence || 0) ? s : best
    )

    comparison.reasoning.push({
      metric: 'confidence',
      winner: bestByConfidence.id,
      value: bestByConfidence.confidence
    })

    // Find safest (fewest risks)
    const safest = scenarios.reduce((best, s) =>
      s.risks.length < best.risks.length ? s : best
    )

    comparison.reasoning.push({
      metric: 'safety',
      winner: safest.id,
      risks: safest.risks.length
    })

    // Find most opportunistic
    const mostOpportunistic = scenarios.reduce((best, s) =>
      s.opportunities.length > best.opportunities.length ? s : best
    )

    comparison.reasoning.push({
      metric: 'opportunities',
      winner: mostOpportunistic.id,
      count: mostOpportunistic.opportunities.length
    })

    // Overall recommendation: highest confidence with acceptable risk
    const acceptable = scenarios.filter(s =>
      s.risks.filter(r => r.severity === 'high').length === 0
    )

    if (acceptable.length > 0) {
      const recommended = acceptable.reduce((best, s) =>
        (s.confidence || 0) > (best.confidence || 0) ? s : best
      )
      comparison.recommendation = recommended.id
    } else {
      comparison.recommendation = bestByConfidence.id
    }

    return comparison
  }

  /**
   * Get scenario by ID
   *
   * @param {string} scenarioId - Scenario ID
   * @returns {object|null} Scenario
   */
  getScenario(scenarioId) {
    return this.scenarios.get(scenarioId) || null
  }

  /**
   * Get all scenarios
   *
   * @param {object} filters - Filters
   * @returns {array} Scenarios
   */
  getAllScenarios(filters = {}) {
    let scenarios = Array.from(this.scenarios.values())

    if (filters.type) {
      scenarios = scenarios.filter(s => s.type === filters.type)
    }

    if (filters.state) {
      scenarios = scenarios.filter(s => s.state === filters.state)
    }

    if (filters.minConfidence) {
      scenarios = scenarios.filter(s => (s.confidence || 0) >= filters.minConfidence)
    }

    return scenarios
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalScenarios > 0
        ? (this.stats.completedScenarios / this.stats.totalScenarios) * 100
        : 0,
      activeScenarios: Array.from(this.scenarios.values())
        .filter(s => s.state === SCENARIO_STATES.RUNNING).length
    }
  }

  /**
   * Clear all scenarios
   */
  clear() {
    this.scenarios.clear()
    this.stats = {
      totalScenarios: 0,
      completedScenarios: 0,
      failedScenarios: 0,
      scenariosByType: {}
    }
  }
}
