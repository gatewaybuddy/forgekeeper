/**
 * @module consciousness/thought-generators
 * @description Generates thoughts from various sources for autonomous thinking
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 86%
 *
 * Dependencies:
 * - contextlog-analyzer (for real pattern detection)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine.generateThought()
 * - Accesses: ContextLog, Tasks, Memories, etc.
 *
 * Tests:
 * - unit: __tests__/unit/thought-generators.test.mjs
 */

import { ContextLogAnalyzer } from './contextlog-analyzer.mjs'

/**
 * Thought source weights (must sum to 1.0)
 */
const DEFAULT_SOURCE_WEIGHTS = {
  contextLog: 0.30,      // Review recent events/errors
  tasks: 0.25,           // Explore generated tasks
  memories: 0.15,        // Reflect on past experiences
  metaCognition: 0.10,   // Self-assessment
  codeExploration: 0.10, // Discover improvements
  hypothetical: 0.10     // What-if scenarios
}

/**
 * ThoughtGenerators - Provides diverse sources of autonomous thoughts
 */
export class ThoughtGenerators {
  /**
   * Create thought generators
   *
   * @param {object} options - Configuration
   * @param {object} options.weights - Source weights
   * @param {object} options.contextLogAnalyzer - ContextLog analyzer instance
   */
  constructor(options = {}) {
    this.weights = { ...DEFAULT_SOURCE_WEIGHTS, ...options.weights }

    // Dependencies
    this.contextLogAnalyzer = options.contextLogAnalyzer || new ContextLogAnalyzer()

    // Normalize weights
    const total = Object.values(this.weights).reduce((sum, w) => sum + w, 0)
    Object.keys(this.weights).forEach(key => {
      this.weights[key] /= total
    })

    // Generator registry
    this.generators = {
      contextLog: this.generateFromContextLog.bind(this),
      tasks: this.generateFromTasks.bind(this),
      memories: this.generateFromMemories.bind(this),
      metaCognition: this.generateMetaCognitive.bind(this),
      codeExploration: this.generateCodeExploration.bind(this),
      hypothetical: this.generateHypothetical.bind(this)
    }
  }

  /**
   * Generate a thought from weighted random source
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Generated thought
   */
  async generate(consciousness) {
    // Weighted random selection
    const source = this.weightedRandomSource()
    const generator = this.generators[source]

    if (!generator) {
      console.warn(`[ThoughtGen] Unknown source: ${source}, using metaCognition`)
      return await this.generateMetaCognitive(consciousness)
    }

    try {
      const thought = await generator(consciousness)
      return {
        ...thought,
        source,
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error(`[ThoughtGen] Error in ${source}:`, error)
      // Fallback to metaCognitive
      return await this.generateMetaCognitive(consciousness)
    }
  }

  /**
   * Select source using weighted random
   *
   * @returns {string} Selected source name
   */
  weightedRandomSource() {
    const rand = Math.random()
    let cumulative = 0

    for (const [source, weight] of Object.entries(this.weights)) {
      cumulative += weight
      if (rand <= cumulative) {
        return source
      }
    }

    return 'metaCognition' // Fallback
  }

  /**
   * Generate thought from context log review
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateFromContextLog(consciousness) {
    // Analyze recent ContextLog events for patterns
    const analysis = await this.contextLogAnalyzer.analyze({ limit: 100 })

    // Get most important insight
    const insight = this.contextLogAnalyzer.getMostImportantInsight()

    if (insight) {
      return {
        content: insight.thought,
        type: 'analysis',
        priority: insight.priority,
        expectedDuration: insight.expectedDuration,
        context: insight.context
      }
    }

    // Fallback if no patterns detected
    return {
      content: 'Review recent ContextLog events for emerging patterns',
      type: 'analysis',
      priority: 'low',
      expectedDuration: 'short',
      context: { events: analysis.events }
    }
  }

  /**
   * Generate thought from task system
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateFromTasks(consciousness) {
    // This would integrate with the TGT (Task Generator) system
    // For now, generate representative task-based thoughts

    const taskTypes = [
      'Investigate high-priority generated task',
      'Review pending task dependencies',
      'Assess task completion patterns',
      'Consider creating new task based on recent insights'
    ]

    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)]

    return {
      content: taskType,
      type: 'task-review',
      priority: 'high',
      expectedDuration: 'medium'
    }
  }

  /**
   * Generate thought from memory reflection
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateFromMemories(consciousness) {
    // Reflect on patterns in short-term or long-term memory

    if (!consciousness.shortTermMemory || consciousness.shortTermMemory.buffer.length === 0) {
      return {
        content: 'No recent memories to reflect upon',
        type: 'reflection',
        priority: 'low',
        expectedDuration: 'short'
      }
    }

    const memoryCount = consciousness.shortTermMemory.buffer.length

    const reflections = [
      `Analyze connections between ${memoryCount} recent memories`,
      'Identify recurring patterns in recent experiences',
      'Find contradictions in recent memories that need resolution',
      'Synthesize recent experiences into higher-level insights'
    ]

    const reflection = reflections[Math.floor(Math.random() * reflections.length)]

    return {
      content: reflection,
      type: 'reflection',
      priority: 'medium',
      expectedDuration: 'medium'
    }
  }

  /**
   * Generate meta-cognitive thought (self-assessment)
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateMetaCognitive(consciousness) {
    const assessments = [
      {
        content: 'How effective has my recent thinking been?',
        type: 'self-assessment',
        focus: 'effectiveness'
      },
      {
        content: 'Am I spending time on the right priorities?',
        type: 'self-assessment',
        focus: 'priorities'
      },
      {
        content: 'What biases might be affecting my recent decisions?',
        type: 'self-assessment',
        focus: 'bias-detection'
      },
      {
        content: 'Is my current cycle interval optimal for the work I\'m doing?',
        type: 'self-assessment',
        focus: 'parameters'
      },
      {
        content: 'What have I learned in the last 10 cycles?',
        type: 'self-assessment',
        focus: 'learning'
      }
    ]

    const assessment = assessments[Math.floor(Math.random() * assessments.length)]

    return {
      ...assessment,
      priority: 'medium',
      expectedDuration: 'short'
    }
  }

  /**
   * Generate code exploration thought
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateCodeExploration(consciousness) {
    const explorations = [
      'Scan for opportunities to improve code organization',
      'Look for potential performance bottlenecks',
      'Identify areas with insufficient test coverage',
      'Find outdated patterns that should be refactored',
      'Discover technical debt that should be addressed',
      'Search for security vulnerabilities or risks'
    ]

    const exploration = explorations[Math.floor(Math.random() * explorations.length)]

    return {
      content: exploration,
      type: 'code-exploration',
      priority: 'low',
      expectedDuration: 'long'
    }
  }

  /**
   * Generate hypothetical scenario
   *
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateHypothetical(consciousness) {
    const scenarios = [
      'What if API budget runs out mid-thought?',
      'What if the system receives conflicting user preferences?',
      'What if a critical tool becomes unavailable?',
      'What if memory fills up faster than expected?',
      'What if dream cycles take too long?',
      'What would happen if bias detection fails?',
      'How would I handle a complete system restart?',
      'What if thought classification becomes inaccurate?'
    ]

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]

    return {
      content: scenario,
      type: 'hypothetical',
      priority: 'low',
      expectedDuration: 'medium'
    }
  }

  /**
   * Generate specific type of thought
   *
   * @param {string} source - Source name
   * @param {object} consciousness - Consciousness state
   * @returns {Promise<object>} Thought
   */
  async generateFrom(source, consciousness) {
    const generator = this.generators[source]

    if (!generator) {
      throw new Error(`Unknown thought source: ${source}`)
    }

    const thought = await generator(consciousness)
    return {
      ...thought,
      source,
      generatedAt: new Date().toISOString()
    }
  }

  /**
   * Get source statistics
   *
   * @returns {object} Source weights and info
   */
  getSourceInfo() {
    return {
      weights: { ...this.weights },
      sources: Object.keys(this.generators),
      totalSources: Object.keys(this.generators).length
    }
  }

  /**
   * Adjust source weights
   *
   * @param {object} newWeights - New weights (partial ok)
   */
  adjustWeights(newWeights) {
    Object.assign(this.weights, newWeights)

    // Normalize
    const total = Object.values(this.weights).reduce((sum, w) => sum + w, 0)
    Object.keys(this.weights).forEach(key => {
      this.weights[key] /= total
    })

    console.log('[ThoughtGen] Weights adjusted:', this.weights)
  }
}
