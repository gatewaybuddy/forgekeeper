/**
 * @module consciousness/thought-classifier
 * @description Classifies thoughts as requiring deep reasoning or rote processing
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 88%
 *
 * Dependencies:
 * - None (pure logic)
 *
 * Integration points:
 * - Called by: InferenceManager.process()
 * - Calls: None
 *
 * Tests:
 * - unit: __tests__/unit/thought-classifier.test.mjs
 */

/**
 * Default classification weights
 */
const DEFAULT_WEIGHTS = {
  complexity: 0.25,
  novelty: 0.20,
  creativity: 0.25,
  uncertainty: 0.15,
  stakes: 0.15
}

/**
 * Keywords for various scoring dimensions
 */
const KEYWORDS = {
  creative: ['design', 'innovative', 'novel', 'creative', 'explore', 'imagine', 'invent', 'brainstorm', 'alternative'],
  deterministic: ['copy', 'move', 'delete', 'list', 'show', 'print', 'echo', 'cat', 'ls', 'git status'],
  uncertain: ['maybe', 'possibly', 'perhaps', 'might', 'could', 'unclear', 'not sure', 'think', 'probably'],
  clear: ['install', 'run', 'execute', 'start', 'stop', 'create', 'update', 'delete'],
  highStakes: ['production', 'deploy', 'security', 'authentication', 'database', 'critical', 'important', 'migration'],
  lowStakes: ['readme', 'documentation', 'comment', 'log', 'test', 'example', 'demo'],
  complex: ['algorithm', 'architecture', 'distributed', 'concurrent', 'optimization', 'performance', 'scalability', 'consensus'],
  simple: ['hello', 'world', 'test', 'example', 'basic', 'simple']
}

/**
 * ThoughtClassifier - Determines if a thought requires deep or rote processing
 */
export class ThoughtClassifier {
  /**
   * Create a thought classifier
   *
   * @param {object} options - Configuration options
   * @param {number} options.threshold - Deep score threshold (default: 0.6)
   * @param {object} options.weights - Dimension weights
   */
  constructor(options = {}) {
    this.threshold = options.threshold || 0.6
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }

    // Learning data
    this.outcomes = []
    this.classificationStats = {
      total: 0,
      correct: 0,
      accuracy: 0
    }
  }

  /**
   * Classify a thought
   *
   * @param {object} thought - The thought to classify
   * @param {string} thought.content - Thought content
   * @param {string} thought.type - Thought type
   * @param {object} context - Additional context
   * @param {array} context.recentThoughts - Recent thought history
   * @returns {Promise<object>} Classification result
   */
  async classify(thought, context = {}) {
    // Handle edge cases
    if (!thought || !thought.content) {
      return this.createResult('rote', 0.1, {}, 'Empty thought defaults to rote')
    }

    // Score each dimension
    const scores = {
      complexity: this.scoreComplexity(thought),
      novelty: this.scoreNovelty(thought, context),
      creativity: this.scoreCreativity(thought),
      uncertainty: this.scoreUncertainty(thought),
      stakes: this.scoreStakes(thought)
    }

    // Calculate weighted deep score
    const deepScore = this.calculateDeepScore(scores)

    // Determine tier
    const tier = deepScore > this.threshold ? 'deep' : 'rote'

    // Calculate confidence (how far from threshold)
    const confidence = Math.abs(deepScore - this.threshold) / 0.4

    // Generate reasoning
    const reasoning = this.generateReasoning(thought, scores, deepScore, tier)

    return this.createResult(tier, confidence, scores, reasoning, deepScore)
  }

  /**
   * Score thought complexity
   *
   * @param {object} thought - The thought
   * @returns {number} Complexity score (0-1)
   */
  scoreComplexity(thought) {
    const content = thought.content.toLowerCase()
    let score = 0.3 // Base score

    // Concept count (more concepts = higher complexity)
    const words = content.split(/\s+/)
    const conceptDensity = Math.min(words.length / 20, 1.0)
    score += conceptDensity * 0.3

    // Check for complex keywords
    const hasComplexKeywords = KEYWORDS.complex.some(kw => content.includes(kw))
    if (hasComplexKeywords) score += 0.3

    // Check for simple keywords (reduce score)
    const hasSimpleKeywords = KEYWORDS.simple.some(kw => content.includes(kw))
    if (hasSimpleKeywords) score -= 0.2

    // Type-based adjustments
    if (thought.type === 'architecture') score += 0.2
    if (thought.type === 'command') score -= 0.2

    // Sentence complexity (multiple clauses)
    const clauseCount = (content.match(/[,;:]/g) || []).length
    score += Math.min(clauseCount / 5, 0.2)

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Score thought novelty
   *
   * @param {object} thought - The thought
   * @param {object} context - Context with recent thoughts
   * @returns {number} Novelty score (0-1)
   */
  scoreNovelty(thought, context) {
    const recentThoughts = context?.recentThoughts || []

    // No history = high novelty
    if (recentThoughts.length === 0) {
      return 0.8
    }

    // Check semantic similarity with recent thoughts
    const similarities = recentThoughts.map(recent =>
      this.calculateSimilarity(thought.content, recent.content)
    )

    const maxSimilarity = Math.max(...similarities, 0)

    // High similarity = low novelty
    return Math.max(0, Math.min(1, 1 - maxSimilarity))
  }

  /**
   * Calculate semantic similarity between two strings
   *
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/))
    const words2 = new Set(str2.toLowerCase().split(/\s+/))

    // Jaccard similarity
    const intersection = new Set([...words1].filter(w => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  /**
   * Score creativity requirement
   *
   * @param {object} thought - The thought
   * @returns {number} Creativity score (0-1)
   */
  scoreCreativity(thought) {
    const content = thought.content.toLowerCase()
    let score = 0.3 // Base score

    // Check for creative keywords
    const creativeMatches = KEYWORDS.creative.filter(kw => content.includes(kw))
    score += creativeMatches.length * 0.15

    // Check for deterministic keywords (reduce score)
    const deterministicMatches = KEYWORDS.deterministic.filter(kw => content.includes(kw))
    score -= deterministicMatches.length * 0.15

    // Type-based adjustments
    if (thought.type === 'design') score += 0.3
    if (thought.type === 'command') score -= 0.3

    // Open-ended questions increase creativity need
    if (content.includes('?') && !content.includes('how do i')) {
      score += 0.2
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Score uncertainty level
   *
   * @param {object} thought - The thought
   * @returns {number} Uncertainty score (0-1)
   */
  scoreUncertainty(thought) {
    const content = thought.content.toLowerCase()
    let score = 0.3 // Base score

    // Check for uncertainty markers
    const uncertainMatches = KEYWORDS.uncertain.filter(kw => content.includes(kw))
    score += uncertainMatches.length * 0.2

    // Check for clear/specific keywords (reduce score)
    const clearMatches = KEYWORDS.clear.filter(kw => content.includes(kw))
    score -= clearMatches.length * 0.1

    // Vague language
    const vagueTerms = ['thing', 'stuff', 'it', 'that', 'something']
    const vagueMatches = vagueTerms.filter(term => content.includes(term))
    score += vagueMatches.length * 0.1

    // Specific details reduce uncertainty
    if (/\d+/.test(content)) score -= 0.1  // Contains numbers
    if (/"[^"]+"/.test(content)) score -= 0.1  // Contains quotes (specific)

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Score stakes/impact
   *
   * @param {object} thought - The thought
   * @returns {number} Stakes score (0-1)
   */
  scoreStakes(thought) {
    const content = thought.content.toLowerCase()
    let score = 0.3 // Base score

    // Check for high-stakes keywords
    const highStakesMatches = KEYWORDS.highStakes.filter(kw => content.includes(kw))
    score += highStakesMatches.length * 0.2

    // Check for low-stakes keywords (reduce score)
    const lowStakesMatches = KEYWORDS.lowStakes.filter(kw => content.includes(kw))
    score -= lowStakesMatches.length * 0.15

    // Type-based adjustments
    if (thought.type === 'security') score += 0.3
    if (thought.type === 'documentation') score -= 0.2

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Calculate weighted deep score
   *
   * @param {object} scores - Individual dimension scores
   * @returns {number} Deep score (0-1)
   */
  calculateDeepScore(scores) {
    return (
      scores.complexity * this.weights.complexity +
      scores.novelty * this.weights.novelty +
      scores.creativity * this.weights.creativity +
      scores.uncertainty * this.weights.uncertainty +
      scores.stakes * this.weights.stakes
    )
  }

  /**
   * Generate reasoning for classification
   *
   * @param {object} thought - The thought
   * @param {object} scores - Dimension scores
   * @param {number} deepScore - Overall deep score
   * @param {string} tier - Determined tier
   * @returns {string} Reasoning explanation
   */
  generateReasoning(thought, scores, deepScore, tier) {
    const parts = []

    // Identify dominant factors
    const sortedScores = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)

    parts.push(`Classified as ${tier} (score: ${deepScore.toFixed(2)}).`)

    // Explain top factors
    const [top1, top2] = sortedScores
    parts.push(`Primary factors: ${top1[0]} (${top1[1].toFixed(2)})`)
    if (top2) {
      parts.push(`and ${top2[0]} (${top2[1].toFixed(2)}).`)
    }

    // Explain decision
    if (tier === 'deep') {
      parts.push('Requires creative/complex reasoning.')
    } else {
      parts.push('Can be handled with deterministic processing.')
    }

    return parts.join(' ')
  }

  /**
   * Create classification result object
   *
   * @param {string} tier - 'deep' or 'rote'
   * @param {number} confidence - Confidence (0-1)
   * @param {object} scores - Dimension scores
   * @param {string} reasoning - Explanation
   * @param {number} deepScore - Overall deep score
   * @returns {object} Classification result
   */
  createResult(tier, confidence, scores, reasoning, deepScore = 0) {
    return {
      tier,
      confidence: Math.max(0, Math.min(1, confidence)),
      scores,
      reasoning,
      deepScore
    }
  }

  /**
   * Record classification outcome for learning
   *
   * @param {object} thought - The thought
   * @param {object} classification - The classification result
   * @param {object} outcome - Actual outcome
   */
  recordOutcome(thought, classification, outcome) {
    this.outcomes.push({
      thought,
      classification,
      outcome,
      timestamp: new Date().toISOString()
    })

    // Update stats
    this.classificationStats.total++
    if (classification.tier === outcome.tier) {
      this.classificationStats.correct++
    }
    this.classificationStats.accuracy =
      this.classificationStats.correct / this.classificationStats.total

    // Keep last 1000 outcomes
    if (this.outcomes.length > 1000) {
      this.outcomes = this.outcomes.slice(-1000)
    }
  }

  /**
   * Get classification statistics
   *
   * @returns {object} Statistics
   */
  getClassificationStats() {
    return { ...this.classificationStats }
  }

  /**
   * Adapt threshold based on outcomes
   *
   * Uses recent outcomes to adjust threshold for better accuracy
   */
  adaptThreshold() {
    if (this.outcomes.length < 20) {
      return // Need sufficient data
    }

    // Analyze recent misclassifications
    const recent = this.outcomes.slice(-50)
    const misclassified = recent.filter(o =>
      o.classification.tier !== o.outcome.tier
    )

    if (misclassified.length === 0) {
      return // No adjustments needed
    }

    // Calculate threshold adjustment
    let adjustment = 0
    misclassified.forEach(({ classification, outcome }) => {
      if (classification.tier === 'rote' && outcome.tier === 'deep') {
        // Threshold too high, should have been deep
        adjustment -= 0.02
      } else if (classification.tier === 'deep' && outcome.tier === 'rote') {
        // Threshold too low, should have been rote
        adjustment += 0.02
      }
    })

    // Apply adjustment (bounded)
    this.threshold = Math.max(0.4, Math.min(0.8, this.threshold + adjustment))

    console.log(`[ThoughtClassifier] Threshold adapted to ${this.threshold.toFixed(2)}`)
  }
}
