/**
 * @module consciousness/decision-analyzer
 * @description Analyzes and compares decision options using multi-factor evaluation
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 86%
 *
 * Dependencies:
 * - scenario-simulator (for option simulation)
 * - multi-step-planner (for execution planning)
 * - causal-reasoner (for impact analysis)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine for decision-making
 * - Uses: ScenarioSimulator, MultiStepPlanner, CausalReasoner
 *
 * Tests:
 * - unit: __tests__/unit/decision-analyzer.test.mjs
 */

/**
 * Decision factors and weights
 */
const DEFAULT_WEIGHTS = {
  expectedValue: 0.30,      // Expected outcome value
  risk: 0.25,               // Risk level
  effort: 0.15,             // Required effort
  alignment: 0.20,          // Goal alignment
  reversibility: 0.10       // Can it be undone?
}

/**
 * Decision states
 */
const DECISION_STATES = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  ANALYZED: 'analyzed',
  DECIDED: 'decided',
  IMPLEMENTED: 'implemented'
}

/**
 * DecisionAnalyzer - Analyzes and compares decision options
 */
export class DecisionAnalyzer {
  /**
   * Create decision analyzer
   *
   * @param {object} options - Configuration
   * @param {object} options.scenarioSimulator - For simulating options
   * @param {object} options.multiStepPlanner - For planning execution
   * @param {object} options.causalReasoner - For impact analysis
   * @param {object} options.goalTracker - For alignment checking
   * @param {object} options.inferenceManager - For LLM analysis
   * @param {object} options.weights - Custom factor weights
   */
  constructor(options = {}) {
    this.scenarioSimulator = options.scenarioSimulator
    this.multiStepPlanner = options.multiStepPlanner
    this.causalReasoner = options.causalReasoner
    this.goalTracker = options.goalTracker
    this.inferenceManager = options.inferenceManager

    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }

    this.decisions = new Map()
    this.stats = {
      totalDecisions: 0,
      decidedCount: 0,
      implementedCount: 0,
      avgOptionsPerDecision: 0
    }
  }

  /**
   * Create a new decision to analyze
   *
   * @param {object} config - Decision configuration
   * @param {string} config.question - Decision question
   * @param {array} config.options - Available options
   * @param {object} config.context - Decision context
   * @param {array} config.goals - Related goals
   * @returns {object} Created decision
   */
  createDecision(config) {
    const decision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      question: config.question,
      options: config.options || [],
      context: config.context || {},
      relatedGoals: config.goals || [],
      state: DECISION_STATES.PENDING,
      createdAt: new Date().toISOString(),
      analysis: null,
      recommendation: null,
      chosenOption: null,
      implementationPlan: null
    }

    this.decisions.set(decision.id, decision)
    this.stats.totalDecisions++

    console.log(`[DecisionAnalyzer] Created decision: ${decision.question}`)

    return decision
  }

  /**
   * Analyze a decision
   *
   * @param {string} decisionId - Decision ID
   * @returns {Promise<object>} Analysis result
   */
  async analyzeDecision(decisionId) {
    const decision = this.decisions.get(decisionId)
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`)
    }

    decision.state = DECISION_STATES.ANALYZING
    decision.analyzedAt = new Date().toISOString()

    console.log(`[DecisionAnalyzer] Analyzing decision: ${decision.question}`)

    try {
      // Step 1: Simulate each option
      const optionAnalyses = []

      for (const option of decision.options) {
        const analysis = await this.analyzeOption(option, decision)
        optionAnalyses.push(analysis)
      }

      // Step 2: Compare options
      const comparison = this.compareOptions(optionAnalyses, decision)

      // Step 3: Generate recommendation
      const recommendation = await this.generateRecommendation(
        optionAnalyses,
        comparison,
        decision
      )

      decision.analysis = {
        options: optionAnalyses,
        comparison,
        analyzedAt: new Date().toISOString()
      }

      decision.recommendation = recommendation
      decision.state = DECISION_STATES.ANALYZED

      console.log(`[DecisionAnalyzer] Analysis complete: ${recommendation.chosenOption}`)

      return {
        decisionId: decision.id,
        analysis: decision.analysis,
        recommendation: decision.recommendation
      }
    } catch (error) {
      console.error(`[DecisionAnalyzer] Analysis failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Analyze a single option
   *
   * @param {object} option - Option to analyze
   * @param {object} decision - Parent decision
   * @returns {Promise<object>} Option analysis
   */
  async analyzeOption(option, decision) {
    const analysis = {
      option: option.name || option.description,
      description: option.description,
      scores: {},
      overallScore: 0,
      simulation: null,
      plan: null,
      risks: [],
      benefits: []
    }

    // Run scenario simulation
    if (this.scenarioSimulator) {
      const scenario = this.scenarioSimulator.createScenario({
        type: 'decision',
        description: `${decision.question} - Option: ${analysis.option}`,
        initialState: decision.context.currentState || {},
        actions: option.actions || [],
        context: decision.context
      })

      const simResult = await this.scenarioSimulator.runSimulation(scenario.id)
      analysis.simulation = simResult

      // Extract risks and benefits from simulation
      if (simResult.risks) {
        analysis.risks = simResult.risks
      }
      if (simResult.opportunities) {
        analysis.benefits = simResult.opportunities
      }
    }

    // Create execution plan
    if (this.multiStepPlanner && option.requiresPlan) {
      const plan = await this.multiStepPlanner.createPlan(
        {
          id: `goal-${analysis.option}`,
          title: analysis.option,
          description: option.description,
          type: 'decision-implementation'
        },
        decision.context
      )

      analysis.plan = plan
    }

    // Score option on each factor
    analysis.scores = {
      expectedValue: this.scoreExpectedValue(option, analysis),
      risk: this.scoreRisk(option, analysis),
      effort: this.scoreEffort(option, analysis),
      alignment: await this.scoreAlignment(option, decision),
      reversibility: this.scoreReversibility(option, analysis)
    }

    // Calculate weighted overall score
    analysis.overallScore = this.calculateOverallScore(analysis.scores)

    return analysis
  }

  /**
   * Score expected value
   *
   * @param {object} option - Option
   * @param {object} analysis - Analysis
   * @returns {number} Score 0-1
   */
  scoreExpectedValue(option, analysis) {
    let score = 0.5 // Default

    // Use simulation confidence if available
    if (analysis.simulation && analysis.simulation.confidence !== undefined) {
      score = analysis.simulation.confidence
    }

    // Adjust for explicit value
    if (option.expectedValue !== undefined) {
      score = (score + option.expectedValue) / 2
    }

    // Adjust for benefits
    if (analysis.benefits && analysis.benefits.length > 0) {
      const highValueBenefits = analysis.benefits.filter(b => b.value === 'high').length
      score += Math.min(highValueBenefits * 0.1, 0.3)
    }

    return Math.min(1.0, score)
  }

  /**
   * Score risk
   *
   * @param {object} option - Option
   * @param {object} analysis - Analysis
   * @returns {number} Score 0-1 (higher = lower risk)
   */
  scoreRisk(option, analysis) {
    let score = 1.0 // Start with low risk

    // Penalize for identified risks
    if (analysis.risks && analysis.risks.length > 0) {
      const highRisks = analysis.risks.filter(r => r.severity === 'high').length
      const medRisks = analysis.risks.filter(r => r.severity === 'medium').length

      score -= (highRisks * 0.25 + medRisks * 0.15)
    }

    // Use explicit risk if provided
    if (option.risk !== undefined) {
      score = (score + (1 - option.risk)) / 2
    }

    return Math.max(0, score)
  }

  /**
   * Score effort required
   *
   * @param {object} option - Option
   * @param {object} analysis - Analysis
   * @returns {number} Score 0-1 (higher = less effort)
   */
  scoreEffort(option, analysis) {
    let score = 0.7 // Moderate effort default

    // Use plan steps count
    if (analysis.plan && analysis.plan.steps) {
      const stepCount = analysis.plan.steps.length
      score = Math.max(0, 1.0 - (stepCount / 10)) // More steps = more effort
    }

    // Use explicit effort if provided
    if (option.effort !== undefined) {
      score = (score + (1 - option.effort)) / 2
    }

    // Adjust for plan duration
    if (analysis.plan && analysis.plan.estimatedDuration) {
      const hours = analysis.plan.estimatedDuration / 60
      score -= Math.min(hours / 24, 0.3) // Penalize long durations
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Score alignment with goals
   *
   * @param {object} option - Option
   * @param {object} decision - Decision
   * @returns {Promise<number>} Score 0-1
   */
  async scoreAlignment(option, decision) {
    let score = 0.5 // Neutral default

    if (!this.goalTracker || decision.relatedGoals.length === 0) {
      return score
    }

    // Check alignment with related goals
    for (const goalId of decision.relatedGoals) {
      const goal = this.goalTracker.getGoal(goalId)
      if (!goal) continue

      // Simple keyword matching
      const optionText = (option.description || option.name || '').toLowerCase()
      const goalText = (goal.title + ' ' + goal.description).toLowerCase()

      const keywords = goalText.split(/\s+/).filter(w => w.length > 3)
      const matches = keywords.filter(k => optionText.includes(k)).length

      if (matches > 0) {
        score += Math.min(matches / keywords.length, 0.3)
      }
    }

    // Use explicit alignment if provided
    if (option.alignment !== undefined) {
      score = (score + option.alignment) / 2
    }

    return Math.min(1.0, score)
  }

  /**
   * Score reversibility
   *
   * @param {object} option - Option
   * @param {object} analysis - Analysis
   * @returns {number} Score 0-1 (higher = more reversible)
   */
  scoreReversibility(option, analysis) {
    let score = 0.5 // Default

    // Use explicit reversibility if provided
    if (option.reversible !== undefined) {
      score = option.reversible ? 0.9 : 0.1
    }

    // Check for keywords indicating irreversibility
    const irreversibleKeywords = ['permanent', 'delete', 'destroy', 'final', 'irreversible']
    const optionText = (option.description || '').toLowerCase()

    if (irreversibleKeywords.some(k => optionText.includes(k))) {
      score = Math.min(score, 0.3)
    }

    // Higher risk often means less reversible
    if (analysis.risks && analysis.risks.length > 0) {
      const highRisks = analysis.risks.filter(r => r.severity === 'high').length
      score -= Math.min(highRisks * 0.15, 0.3)
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Calculate overall weighted score
   *
   * @param {object} scores - Individual scores
   * @returns {number} Overall score 0-1
   */
  calculateOverallScore(scores) {
    let total = 0

    for (const [factor, weight] of Object.entries(this.weights)) {
      if (scores[factor] !== undefined) {
        total += scores[factor] * weight
      }
    }

    return total
  }

  /**
   * Compare analyzed options
   *
   * @param {array} optionAnalyses - Analyses
   * @param {object} decision - Decision
   * @returns {object} Comparison
   */
  compareOptions(optionAnalyses, decision) {
    const comparison = {
      rankings: [],
      byFactor: {},
      tradeoffs: []
    }

    // Rank by overall score
    comparison.rankings = optionAnalyses
      .map(a => ({
        option: a.option,
        score: a.overallScore,
        scores: a.scores
      }))
      .sort((a, b) => b.score - a.score)

    // Best by each factor
    for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
      const best = optionAnalyses.reduce((best, a) =>
        (a.scores[factor] || 0) > (best.scores[factor] || 0) ? a : best
      )

      comparison.byFactor[factor] = {
        option: best.option,
        score: best.scores[factor]
      }
    }

    // Identify tradeoffs
    for (let i = 0; i < optionAnalyses.length; i++) {
      for (let j = i + 1; j < optionAnalyses.length; j++) {
        const tradeoff = this.findTradeoff(optionAnalyses[i], optionAnalyses[j])
        if (tradeoff) {
          comparison.tradeoffs.push(tradeoff)
        }
      }
    }

    return comparison
  }

  /**
   * Find tradeoff between two options
   *
   * @param {object} option1 - First option
   * @param {object} option2 - Second option
   * @returns {object|null} Tradeoff or null
   */
  findTradeoff(option1, option2) {
    const advantages1 = []
    const advantages2 = []

    for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
      const score1 = option1.scores[factor] || 0
      const score2 = option2.scores[factor] || 0
      const diff = Math.abs(score1 - score2)

      if (diff > 0.2) { // Significant difference
        if (score1 > score2) {
          advantages1.push({ factor, advantage: diff })
        } else {
          advantages2.push({ factor, advantage: diff })
        }
      }
    }

    if (advantages1.length > 0 && advantages2.length > 0) {
      return {
        option1: option1.option,
        option2: option2.option,
        option1Advantages: advantages1,
        option2Advantages: advantages2,
        description: this.describeTradeoff(option1.option, option2.option, advantages1, advantages2)
      }
    }

    return null
  }

  /**
   * Describe tradeoff
   *
   * @param {string} option1 - Option 1 name
   * @param {string} option2 - Option 2 name
   * @param {array} adv1 - Advantages of option 1
   * @param {array} adv2 - Advantages of option 2
   * @returns {string} Description
   */
  describeTradeoff(option1, option2, adv1, adv2) {
    const factors1 = adv1.map(a => a.factor).join(', ')
    const factors2 = adv2.map(a => a.factor).join(', ')

    return `${option1} is better for ${factors1}, while ${option2} excels in ${factors2}`
  }

  /**
   * Generate recommendation
   *
   * @param {array} optionAnalyses - Analyses
   * @param {object} comparison - Comparison
   * @param {object} decision - Decision
   * @returns {Promise<object>} Recommendation
   */
  async generateRecommendation(optionAnalyses, comparison, decision) {
    const topOption = comparison.rankings[0]

    const recommendation = {
      chosenOption: topOption.option,
      confidence: topOption.score,
      reasoning: [],
      alternatives: comparison.rankings.slice(1, 3).map(r => ({
        option: r.option,
        score: r.score
      })),
      warnings: [],
      nextSteps: []
    }

    // Generate reasoning
    recommendation.reasoning.push({
      point: `Highest overall score: ${topOption.score.toFixed(2)}`,
      type: 'score'
    })

    // Highlight strengths
    const topAnalysis = optionAnalyses.find(a => a.option === topOption.option)
    const strongFactors = Object.entries(topAnalysis.scores)
      .filter(([_, score]) => score > 0.7)
      .map(([factor, _]) => factor)

    if (strongFactors.length > 0) {
      recommendation.reasoning.push({
        point: `Strong in: ${strongFactors.join(', ')}`,
        type: 'strength'
      })
    }

    // Warnings for risks
    if (topAnalysis.risks && topAnalysis.risks.length > 0) {
      const highRisks = topAnalysis.risks.filter(r => r.severity === 'high')
      if (highRisks.length > 0) {
        recommendation.warnings.push({
          type: 'risk',
          message: `${highRisks.length} high-severity risk(s) identified`,
          risks: highRisks
        })
      }
    }

    // Warnings for low scores
    const weakFactors = Object.entries(topAnalysis.scores)
      .filter(([_, score]) => score < 0.4)
      .map(([factor, _]) => factor)

    if (weakFactors.length > 0) {
      recommendation.warnings.push({
        type: 'weakness',
        message: `Weak in: ${weakFactors.join(', ')}`
      })
    }

    // Next steps from plan
    if (topAnalysis.plan && topAnalysis.plan.steps) {
      recommendation.nextSteps = topAnalysis.plan.steps
        .slice(0, 3)
        .map(step => step.title)
    }

    // LLM-based recommendation if available
    if (this.inferenceManager) {
      const llmRec = await this.generateLLMRecommendation(
        decision,
        optionAnalyses,
        comparison
      )
      if (llmRec) {
        recommendation.llmInsight = llmRec
      }
    }

    return recommendation
  }

  /**
   * Generate LLM-based recommendation
   *
   * @param {object} decision - Decision
   * @param {array} optionAnalyses - Analyses
   * @param {object} comparison - Comparison
   * @returns {Promise<string>} LLM insight
   */
  async generateLLMRecommendation(decision, optionAnalyses, comparison) {
    const prompt = `You are helping make a decision.

**Question**: ${decision.question}

**Options Analyzed**:
${optionAnalyses.map((a, i) => `
${i + 1}. ${a.option}
   - Overall Score: ${a.overallScore.toFixed(2)}
   - Expected Value: ${a.scores.expectedValue.toFixed(2)}
   - Risk: ${a.scores.risk.toFixed(2)}
   - Effort: ${a.scores.effort.toFixed(2)}
   - Risks: ${a.risks.length}
   - Benefits: ${a.benefits.length}
`).join('\n')}

**Top Ranking**: ${comparison.rankings[0].option}

Provide a brief recommendation (2-3 sentences) considering:
1. Which option is best and why
2. Any important considerations
3. Major tradeoffs`

    try {
      const result = await this.inferenceManager.process(
        { content: prompt, type: 'decision-recommendation' },
        {},
        { maxRetries: 1 }
      )

      return result.text
    } catch (error) {
      console.warn('[DecisionAnalyzer] LLM recommendation failed:', error)
      return null
    }
  }

  /**
   * Make a decision (choose an option)
   *
   * @param {string} decisionId - Decision ID
   * @param {string} chosenOption - Chosen option name (optional, uses recommendation if not provided)
   * @returns {object} Decision
   */
  makeDecision(decisionId, chosenOption = null) {
    const decision = this.decisions.get(decisionId)
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`)
    }

    if (decision.state !== DECISION_STATES.ANALYZED) {
      throw new Error('Decision must be analyzed before making a choice')
    }

    decision.chosenOption = chosenOption || decision.recommendation.chosenOption
    decision.state = DECISION_STATES.DECIDED
    decision.decidedAt = new Date().toISOString()

    this.stats.decidedCount++

    console.log(`[DecisionAnalyzer] Decision made: ${decision.chosenOption}`)

    return decision
  }

  /**
   * Create implementation plan for decision
   *
   * @param {string} decisionId - Decision ID
   * @returns {Promise<object>} Implementation plan
   */
  async createImplementationPlan(decisionId) {
    const decision = this.decisions.get(decisionId)
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`)
    }

    if (decision.state !== DECISION_STATES.DECIDED) {
      throw new Error('Decision must be made before creating implementation plan')
    }

    if (!this.multiStepPlanner) {
      throw new Error('MultiStepPlanner not available')
    }

    // Find the chosen option's analysis
    const chosenAnalysis = decision.analysis.options.find(
      a => a.option === decision.chosenOption
    )

    // Use existing plan or create new one
    if (chosenAnalysis && chosenAnalysis.plan) {
      decision.implementationPlan = chosenAnalysis.plan
    } else {
      const plan = await this.multiStepPlanner.createPlan(
        {
          id: `impl-${decision.id}`,
          title: `Implement: ${decision.chosenOption}`,
          description: decision.question,
          type: 'decision-implementation'
        },
        decision.context
      )

      decision.implementationPlan = plan
    }

    decision.state = DECISION_STATES.IMPLEMENTED
    decision.implementedAt = new Date().toISOString()
    this.stats.implementedCount++

    console.log(`[DecisionAnalyzer] Implementation plan created`)

    return decision.implementationPlan
  }

  /**
   * Get decision by ID
   *
   * @param {string} decisionId - Decision ID
   * @returns {object|null} Decision
   */
  getDecision(decisionId) {
    return this.decisions.get(decisionId) || null
  }

  /**
   * Get all decisions
   *
   * @param {object} filters - Filters
   * @returns {array} Decisions
   */
  getAllDecisions(filters = {}) {
    let decisions = Array.from(this.decisions.values())

    if (filters.state) {
      decisions = decisions.filter(d => d.state === filters.state)
    }

    return decisions
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    const decisions = Array.from(this.decisions.values())
    const totalOptions = decisions.reduce((sum, d) => sum + d.options.length, 0)

    return {
      ...this.stats,
      avgOptionsPerDecision: this.stats.totalDecisions > 0
        ? totalOptions / this.stats.totalDecisions
        : 0,
      decisionRate: this.stats.totalDecisions > 0
        ? (this.stats.decidedCount / this.stats.totalDecisions) * 100
        : 0
    }
  }

  /**
   * Clear all decisions
   */
  clear() {
    this.decisions.clear()
    this.stats = {
      totalDecisions: 0,
      decidedCount: 0,
      implementedCount: 0,
      avgOptionsPerDecision: 0
    }
  }
}
