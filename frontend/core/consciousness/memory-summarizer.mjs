/**
 * @module consciousness/memory-summarizer
 * @description Compresses experiences into concise memory summaries
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - inference-manager.mjs (for local LLM)
 *
 * Integration points:
 * - Called by: ShortTermMemory.add()
 * - Calls: InferenceManager.roteTier.generate()
 *
 * Tests:
 * - unit: __tests__/unit/memory-summarizer.test.mjs
 */

/**
 * MemorySummarizer - Creates concise summaries of experiences
 */
export class MemorySummarizer {
  /**
   * Create a memory summarizer
   *
   * @param {object} options - Configuration options
   * @param {object} options.inferenceManager - Inference manager for local LLM
   */
  constructor(options = {}) {
    this.inferenceManager = options.inferenceManager
  }

  /**
   * Summarize an experience into a memory
   *
   * @param {object} experience - The experience to summarize
   * @param {string} experience.content - Experience content
   * @param {string} experience.outcome - Outcome
   * @param {object} experience.context - Additional context
   * @returns {Promise<object>} Memory summary
   */
  async summarize(experience) {
    // Extract key components
    const keyFacts = this.extractKeyFacts(experience)
    const patterns = this.identifyPatterns(experience)
    const importance = this.rateImportance(experience)
    const categories = this.categorize(experience)

    // Generate concise summary (use local LLM if available)
    let summary
    if (this.inferenceManager) {
      summary = await this.generateSummaryWithLLM(experience, keyFacts)
    } else {
      summary = this.generateSummaryHeuristic(experience, keyFacts)
    }

    return {
      id: this.generateId(),
      summary,
      importance,
      emotionalSalience: this.calculateSalience(experience),
      timestamp: new Date().toISOString(),
      categories,
      keyFacts,
      patterns,
      novelty: this.assessNovelty(experience),
      relatedMemories: []
    }
  }

  /**
   * Extract key facts from experience
   *
   * @param {object} experience - The experience
   * @returns {array} Key facts
   */
  extractKeyFacts(experience) {
    const facts = []

    // Extract from content
    if (experience.content) {
      // Simple heuristic: sentences with key verbs
      const keyVerbs = ['implemented', 'created', 'fixed', 'discovered', 'learned']
      const sentences = experience.content.split(/[.!?]+/)

      sentences.forEach(sentence => {
        if (keyVerbs.some(verb => sentence.toLowerCase().includes(verb))) {
          facts.push(sentence.trim())
        }
      })
    }

    // Extract from outcome
    if (experience.outcome) {
      facts.push(`Outcome: ${experience.outcome}`)
    }

    return facts.slice(0, 5) // Top 5
  }

  /**
   * Identify patterns in experience
   *
   * @param {object} experience - The experience
   * @returns {array} Identified patterns
   */
  identifyPatterns(experience) {
    const patterns = []

    // Success/failure pattern
    if (experience.outcome) {
      const isSuccess = /success|complete|work/i.test(experience.outcome)
      patterns.push(isSuccess ? 'success' : 'failure')
    }

    // Type pattern
    if (experience.type) {
      patterns.push(`type:${experience.type}`)
    }

    // Tool usage pattern
    if (experience.toolsUsed && experience.toolsUsed.length > 0) {
      patterns.push(`tools:${experience.toolsUsed.join(',')}`)
    }

    return patterns
  }

  /**
   * Rate importance of experience
   *
   * @param {object} experience - The experience
   * @returns {number} Importance (0-1)
   */
  rateImportance(experience) {
    let score = 0.5 // Base

    // Outcome impact
    if (experience.outcome) {
      if (/success|breakthrough|discover/i.test(experience.outcome)) {
        score += 0.3
      } else if (/fail|error|problem/i.test(experience.outcome)) {
        score += 0.2 // Failures are important too
      }
    }

    // Novel experiences are important
    if (experience.novel) {
      score += 0.2
    }

    // Complex experiences are important
    if (experience.complexity && experience.complexity > 0.7) {
      score += 0.1
    }

    return Math.min(1, score)
  }

  /**
   * Calculate emotional salience
   *
   * @param {object} experience - The experience
   * @returns {number} Salience (-1 to 1)
   */
  calculateSalience(experience) {
    if (!experience.outcome) return 0

    const outcome = experience.outcome.toLowerCase()

    // Positive outcomes
    if (/success|complete|work|fix|solve/i.test(outcome)) {
      return 0.7
    }

    // Negative outcomes
    if (/fail|error|break|crash/i.test(outcome)) {
      return -0.6
    }

    return 0
  }

  /**
   * Categorize experience
   *
   * @param {object} experience - The experience
   * @returns {array} Categories
   */
  categorize(experience) {
    const categories = []

    // Type-based
    if (experience.type) {
      categories.push(experience.type)
    }

    // Content-based
    if (experience.content) {
      const content = experience.content.toLowerCase()

      if (/test|unit|integration/i.test(content)) {
        categories.push('testing')
      }
      if (/bug|fix|error/i.test(content)) {
        categories.push('debugging')
      }
      if (/implement|create|add/i.test(content)) {
        categories.push('implementation')
      }
      if (/design|architecture/i.test(content)) {
        categories.push('design')
      }
    }

    return categories
  }

  /**
   * Assess novelty of experience
   *
   * @param {object} experience - The experience
   * @returns {number} Novelty (0-1)
   */
  assessNovelty(experience) {
    // Simple heuristic
    if (experience.novel !== undefined) {
      return experience.novel
    }

    // Check for novel indicators
    const novelIndicators = ['first', 'new', 'never', 'innovative', 'novel']
    const content = (experience.content || '').toLowerCase()

    const hasNovelIndicators = novelIndicators.some(ind =>
      content.includes(ind)
    )

    return hasNovelIndicators ? 0.8 : 0.4
  }

  /**
   * Generate summary using LLM
   *
   * @param {object} experience - The experience
   * @param {array} keyFacts - Key facts
   * @returns {Promise<string>} Summary
   */
  async generateSummaryWithLLM(experience, keyFacts) {
    const prompt = `Summarize this experience in one concise sentence (max 100 chars):

Experience: ${experience.content || 'Unknown'}
Outcome: ${experience.outcome || 'Unknown'}
Key facts: ${keyFacts.join('; ')}

Summary:`

    try {
      const result = await this.inferenceManager.roteTier.generate(prompt, {
        maxTokens: 50,
        temperature: 0.3
      })

      return result.text.trim().slice(0, 200) // Max 200 chars
    } catch (error) {
      console.warn('[Summarizer] LLM failed, using heuristic:', error)
      return this.generateSummaryHeuristic(experience, keyFacts)
    }
  }

  /**
   * Generate summary using heuristics
   *
   * @param {object} experience - The experience
   * @param {array} keyFacts - Key facts
   * @returns {string} Summary
   */
  generateSummaryHeuristic(experience, keyFacts) {
    // Simple format: [Action] → [Outcome]
    const action = experience.content ?
      experience.content.slice(0, 80) :
      'Experience'

    const outcome = experience.outcome ?
      ` → ${experience.outcome}` :
      ''

    return `${action}${outcome}`.slice(0, 200)
  }

  /**
   * Generate unique memory ID
   *
   * @returns {string} Memory ID
   */
  generateId() {
    return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
