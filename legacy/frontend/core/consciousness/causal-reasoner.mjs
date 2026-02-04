/**
 * @module consciousness/causal-reasoner
 * @description Builds and analyzes causal relationships and chains
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 86%
 *
 * Dependencies:
 * - None (standalone reasoning)
 *
 * Integration points:
 * - Called by: ConsciousnessEngine for causal analysis
 * - Uses: Memory patterns to infer causality
 *
 * Tests:
 * - unit: __tests__/unit/causal-reasoner.test.mjs
 */

/**
 * Causal relationship types
 */
const CAUSAL_TYPES = {
  DIRECT: 'direct',           // A directly causes B
  INDIRECT: 'indirect',       // A causes B through intermediary
  CONDITIONAL: 'conditional', // A causes B only if C
  PROBABILISTIC: 'probabilistic', // A increases probability of B
  PREVENTIVE: 'preventive'    // A prevents B
}

/**
 * CausalReasoner - Builds and analyzes cause-effect relationships
 */
export class CausalReasoner {
  /**
   * Create causal reasoner
   *
   * @param {object} options - Configuration
   * @param {number} options.minConfidence - Min confidence for causal link (default: 0.6)
   * @param {number} options.minOccurrences - Min co-occurrences (default: 3)
   */
  constructor(options = {}) {
    this.minConfidence = options.minConfidence || 0.6
    this.minOccurrences = options.minOccurrences || 3

    // Causal graph: Map<cause, Array<{effect, type, confidence, evidence}>>
    this.causalGraph = new Map()

    // Causal chains: sequences of causes
    this.causalChains = []

    this.stats = {
      totalRelationships: 0,
      relationshipsByType: {},
      chainsDiscovered: 0
    }
  }

  /**
   * Analyze events to infer causal relationships
   *
   * @param {array} events - Time-ordered events
   * @returns {array} Discovered causal relationships
   */
  analyzeEvents(events) {
    const relationships = []

    // Sort by timestamp
    const sorted = events.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // Look for temporal patterns (A before B)
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const timeDiff = new Date(sorted[j].timestamp).getTime() -
                        new Date(sorted[i].timestamp).getTime()

        // Events within 1 hour might be causally related
        if (timeDiff < 60 * 60 * 1000) {
          const relationship = this.inferCausalRelationship(
            sorted[i],
            sorted[j],
            timeDiff,
            events
          )

          if (relationship) {
            relationships.push(relationship)
            this.addToGraph(relationship)
          }
        } else {
          break // Too far apart temporally
        }
      }
    }

    // Build causal chains
    this.buildCausalChains()

    return relationships
  }

  /**
   * Infer causal relationship between two events
   *
   * @param {object} cause - Potential cause event
   * @param {object} effect - Potential effect event
   * @param {number} timeDiff - Time difference (ms)
   * @param {array} allEvents - All events for context
   * @returns {object|null} Causal relationship or null
   */
  inferCausalRelationship(cause, effect, timeDiff, allEvents) {
    // Calculate co-occurrence frequency
    const coOccurrences = this.countCoOccurrences(cause, effect, allEvents)

    if (coOccurrences < this.minOccurrences) {
      return null
    }

    // Calculate confidence based on multiple factors
    const confidence = this.calculateCausalConfidence(
      cause,
      effect,
      timeDiff,
      coOccurrences,
      allEvents
    )

    if (confidence < this.minConfidence) {
      return null
    }

    // Determine causal type
    const causalType = this.determineCausalType(cause, effect, timeDiff, allEvents)

    return {
      id: `causal-${cause.id || cause.type}-${effect.id || effect.type}`,
      cause: {
        id: cause.id,
        type: cause.type,
        description: this.describeEvent(cause)
      },
      effect: {
        id: effect.id,
        type: effect.type,
        description: this.describeEvent(effect)
      },
      causalType,
      confidence,
      timeDiff,
      coOccurrences,
      evidence: this.gatherEvidence(cause, effect, allEvents)
    }
  }

  /**
   * Count how often cause and effect co-occur
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {array} events - All events
   * @returns {number} Co-occurrence count
   */
  countCoOccurrences(cause, effect, events) {
    let count = 0

    for (let i = 0; i < events.length - 1; i++) {
      if (this.eventsMatch(events[i], cause)) {
        // Look for effect in next few events
        for (let j = i + 1; j < Math.min(i + 10, events.length); j++) {
          if (this.eventsMatch(events[j], effect)) {
            count++
            break
          }
        }
      }
    }

    return count
  }

  /**
   * Check if two events match (same type/category)
   *
   * @param {object} event1 - First event
   * @param {object} event2 - Second event
   * @returns {boolean} True if match
   */
  eventsMatch(event1, event2) {
    return event1.type === event2.type &&
           event1.category === event2.category
  }

  /**
   * Calculate causal confidence score
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {number} timeDiff - Time difference
   * @param {number} coOccurrences - Co-occurrence count
   * @param {array} allEvents - All events
   * @returns {number} Confidence 0-1
   */
  calculateCausalConfidence(cause, effect, timeDiff, coOccurrences, allEvents) {
    let confidence = 0

    // Factor 1: Temporal proximity (40%)
    // Closer in time = higher confidence
    const proximityScore = Math.max(0, 1 - (timeDiff / (60 * 60 * 1000)))
    confidence += proximityScore * 0.4

    // Factor 2: Co-occurrence frequency (30%)
    const frequencyScore = Math.min(coOccurrences / 10, 1.0)
    confidence += frequencyScore * 0.3

    // Factor 3: Conditional probability (20%)
    // P(effect | cause) vs P(effect)
    const conditionalProb = this.calculateConditionalProbability(cause, effect, allEvents)
    confidence += conditionalProb * 0.2

    // Factor 4: Absence of confounds (10%)
    const confoundScore = this.checkForConfounds(cause, effect, allEvents)
    confidence += confoundScore * 0.1

    return Math.min(confidence, 1.0)
  }

  /**
   * Calculate conditional probability P(effect | cause)
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {array} events - All events
   * @returns {number} Probability 0-1
   */
  calculateConditionalProbability(cause, effect, events) {
    const causeCount = events.filter(e => this.eventsMatch(e, cause)).length
    if (causeCount === 0) return 0

    const bothCount = this.countCoOccurrences(cause, effect, events)
    return bothCount / causeCount
  }

  /**
   * Check for confounding variables
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {array} events - All events
   * @returns {number} Score 0-1 (higher = fewer confounds)
   */
  checkForConfounds(cause, effect, events) {
    // Simple heuristic: if other events often appear between cause and effect,
    // there might be confounds
    let intermediateCount = 0
    let totalPairs = 0

    for (let i = 0; i < events.length - 2; i++) {
      if (this.eventsMatch(events[i], cause)) {
        for (let j = i + 1; j < Math.min(i + 10, events.length); j++) {
          if (this.eventsMatch(events[j], effect)) {
            totalPairs++
            // Count intermediate events
            intermediateCount += (j - i - 1)
            break
          }
        }
      }
    }

    if (totalPairs === 0) return 0.5

    const avgIntermediates = intermediateCount / totalPairs
    return Math.max(0, 1 - (avgIntermediates / 5))
  }

  /**
   * Determine type of causal relationship
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {number} timeDiff - Time difference
   * @param {array} events - All events
   * @returns {string} Causal type
   */
  determineCausalType(cause, effect, timeDiff, events) {
    // Very close in time = direct
    if (timeDiff < 5 * 60 * 1000) { // 5 minutes
      return CAUSAL_TYPES.DIRECT
    }

    // Check if there are intermediate events
    const hasIntermediates = this.checkForIntermediates(cause, effect, events)
    if (hasIntermediates) {
      return CAUSAL_TYPES.INDIRECT
    }

    // Check conditional probability
    const condProb = this.calculateConditionalProbability(cause, effect, events)
    if (condProb < 0.7) {
      return CAUSAL_TYPES.PROBABILISTIC
    }

    return CAUSAL_TYPES.DIRECT
  }

  /**
   * Check for intermediate events in causal chain
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {array} events - All events
   * @returns {boolean} True if intermediates exist
   */
  checkForIntermediates(cause, effect, events) {
    // Look for common event types between cause and effect
    for (let i = 0; i < events.length - 2; i++) {
      if (this.eventsMatch(events[i], cause)) {
        for (let j = i + 1; j < Math.min(i + 10, events.length); j++) {
          if (this.eventsMatch(events[j], effect)) {
            // Found cause-effect pair, check for intermediates
            if (j - i > 1) {
              return true
            }
          }
        }
      }
    }

    return false
  }

  /**
   * Gather evidence for causal relationship
   *
   * @param {object} cause - Cause event
   * @param {object} effect - Effect event
   * @param {array} events - All events
   * @returns {array} Evidence items
   */
  gatherEvidence(cause, effect, events) {
    const evidence = []

    // Find actual occurrences
    for (let i = 0; i < events.length - 1; i++) {
      if (this.eventsMatch(events[i], cause)) {
        for (let j = i + 1; j < Math.min(i + 10, events.length); j++) {
          if (this.eventsMatch(events[j], effect)) {
            evidence.push({
              causeTime: events[i].timestamp,
              effectTime: events[j].timestamp,
              timeDiff: new Date(events[j].timestamp).getTime() -
                       new Date(events[i].timestamp).getTime()
            })
            break
          }
        }
      }
    }

    return evidence.slice(0, 5) // Keep top 5
  }

  /**
   * Describe event for display
   *
   * @param {object} event - Event
   * @returns {string} Description
   */
  describeEvent(event) {
    if (event.description) return event.description
    if (event.content) return event.content.slice(0, 50)
    return `${event.type} event`
  }

  /**
   * Add relationship to causal graph
   *
   * @param {object} relationship - Causal relationship
   */
  addToGraph(relationship) {
    const causeKey = relationship.cause.type

    if (!this.causalGraph.has(causeKey)) {
      this.causalGraph.set(causeKey, [])
    }

    this.causalGraph.get(causeKey).push({
      effect: relationship.effect.type,
      type: relationship.causalType,
      confidence: relationship.confidence,
      evidence: relationship.evidence.length
    })

    this.stats.totalRelationships++
    this.stats.relationshipsByType[relationship.causalType] =
      (this.stats.relationshipsByType[relationship.causalType] || 0) + 1
  }

  /**
   * Build causal chains (A → B → C)
   */
  buildCausalChains() {
    const chains = []

    // Find chains of length 2-4
    for (const [cause, effects] of this.causalGraph.entries()) {
      for (const effect of effects) {
        // Check if effect is also a cause
        if (this.causalGraph.has(effect.effect)) {
          const chain = {
            id: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            steps: [
              { event: cause, type: 'cause' },
              { event: effect.effect, type: 'intermediate' }
            ],
            confidence: effect.confidence
          }

          // Extend chain
          const secondEffects = this.causalGraph.get(effect.effect)
          for (const secondEffect of secondEffects) {
            chain.steps.push({
              event: secondEffect.effect,
              type: 'effect'
            })
            chain.confidence = Math.min(chain.confidence, secondEffect.confidence)
          }

          if (chain.steps.length >= 3) {
            chains.push(chain)
          }
        }
      }
    }

    this.causalChains = chains
    this.stats.chainsDiscovered = chains.length
  }

  /**
   * Get causal explanation for event
   *
   * @param {object} event - Event to explain
   * @returns {array} Potential causes
   */
  getCauses(event) {
    const causes = []

    for (const [cause, effects] of this.causalGraph.entries()) {
      for (const effect of effects) {
        if (effect.effect === event.type) {
          causes.push({
            cause,
            confidence: effect.confidence,
            type: effect.type
          })
        }
      }
    }

    return causes.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get potential effects of event
   *
   * @param {object} event - Event
   * @returns {array} Potential effects
   */
  getEffects(event) {
    const effects = this.causalGraph.get(event.type) || []
    return effects.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get causal chains involving event
   *
   * @param {string} eventType - Event type
   * @returns {array} Chains
   */
  getChainsInvolving(eventType) {
    return this.causalChains.filter(chain =>
      chain.steps.some(step => step.event === eventType)
    )
  }

  /**
   * Predict likely effects of event
   *
   * @param {object} event - Event
   * @returns {array} Predictions
   */
  predictEffects(event) {
    const effects = this.getEffects(event)

    return effects.map(effect => ({
      event: effect.effect,
      probability: effect.confidence,
      type: effect.type,
      reasoning: this.generateReasoning(event.type, effect.effect, effect.confidence)
    }))
  }

  /**
   * Generate reasoning for causal relationship
   *
   * @param {string} cause - Cause type
   * @param {string} effect - Effect type
   * @param {number} confidence - Confidence
   * @returns {string} Reasoning
   */
  generateReasoning(cause, effect, confidence) {
    const percentage = Math.round(confidence * 100)
    return `Based on observed patterns, ${cause} leads to ${effect} with ${percentage}% confidence`
  }

  /**
   * Get all causal relationships
   *
   * @param {object} filters - Filters
   * @returns {array} Relationships
   */
  getAllRelationships(filters = {}) {
    const relationships = []

    for (const [cause, effects] of this.causalGraph.entries()) {
      for (const effect of effects) {
        if (filters.minConfidence && effect.confidence < filters.minConfidence) {
          continue
        }

        if (filters.type && effect.type !== filters.type) {
          continue
        }

        relationships.push({
          cause,
          effect: effect.effect,
          type: effect.type,
          confidence: effect.confidence
        })
      }
    }

    return relationships.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      graphNodes: this.causalGraph.size
    }
  }

  /**
   * Export causal graph
   *
   * @returns {object} Graph data
   */
  exportGraph() {
    return {
      nodes: Array.from(this.causalGraph.keys()).map(key => ({ id: key })),
      edges: this.getAllRelationships(),
      chains: this.causalChains
    }
  }

  /**
   * Clear causal graph
   */
  clear() {
    this.causalGraph.clear()
    this.causalChains = []
    this.stats = {
      totalRelationships: 0,
      relationshipsByType: {},
      chainsDiscovered: 0
    }
  }
}
