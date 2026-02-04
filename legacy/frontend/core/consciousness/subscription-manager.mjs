/**
 * @module consciousness/subscription-manager
 * @description Manages GraphQL subscriptions and real-time event streaming
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - graphql-subscriptions (PubSub)
 *
 * Integration points:
 * - Called by: ConsciousnessOrchestrator
 * - Publishes: All consciousness events to GraphQL subscriptions
 *
 * Tests:
 * - unit: __tests__/unit/subscription-manager.test.mjs
 */

import { PubSub } from 'graphql-subscriptions'

/**
 * Subscription event types
 */
export const SUBSCRIPTION_EVENTS = {
  CONSCIOUSNESS_STREAM: 'CONSCIOUSNESS_STREAM',
  CYCLE_START: 'CYCLE_START',
  CYCLE_COMPLETE: 'CYCLE_COMPLETE',
  THOUGHT_GENERATED: 'THOUGHT_GENERATED',
  THOUGHT_PROCESSED: 'THOUGHT_PROCESSED',
  MEMORY_ADDED: 'MEMORY_ADDED',
  MEMORY_PROMOTED: 'MEMORY_PROMOTED',
  DREAM_START: 'DREAM_START',
  DREAM_COMPLETE: 'DREAM_COMPLETE',
  BIAS_DETECTED: 'BIAS_DETECTED',
  VALUE_FORMED: 'VALUE_FORMED',
  VALUE_CHALLENGED: 'VALUE_CHALLENGED',
  PARAMETER_ADJUSTED: 'PARAMETER_ADJUSTED',
  SAVE_POINT_CREATED: 'SAVE_POINT_CREATED',
  ATTENTION_SHIFT: 'ATTENTION_SHIFT',
  TASK_GENERATED: 'TASK_GENERATED'
}

/**
 * SubscriptionManager - Manages real-time consciousness event subscriptions
 */
export class SubscriptionManager {
  /**
   * Create subscription manager
   *
   * @param {object} options - Configuration
   * @param {object} options.pubsub - PubSub instance (optional)
   */
  constructor(options = {}) {
    this.pubsub = options.pubsub || new PubSub()

    this.stats = {
      eventsPublished: 0,
      eventsByType: {}
    }

    // Initialize event counters
    Object.keys(SUBSCRIPTION_EVENTS).forEach(key => {
      this.stats.eventsByType[SUBSCRIPTION_EVENTS[key]] = 0
    })
  }

  /**
   * Wire up consciousness engine events
   *
   * @param {object} consciousnessEngine - ConsciousnessEngine instance
   */
  wireConsciousnessEngine(consciousnessEngine) {
    // Cycle events
    consciousnessEngine.on('cycle-start', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.CYCLE_START, {
        cycle: data.cycle,
        timestamp: new Date().toISOString()
      })
    })

    consciousnessEngine.on('cycle-complete', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.CYCLE_COMPLETE, {
        cycle: data.cycle,
        duration: data.duration,
        success: data.success,
        steps: data.steps,
        timestamp: data.timestamp
      })

      // Also publish to general consciousness stream
      this.publishEvent(SUBSCRIPTION_EVENTS.CONSCIOUSNESS_STREAM, {
        type: 'cycle-complete',
        data
      })
    })

    // Dream events
    consciousnessEngine.on('dream-start', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.DREAM_START, {
        cycle: data.cycle,
        timestamp: new Date().toISOString()
      })
    })

    consciousnessEngine.on('dream-complete', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.DREAM_COMPLETE, {
        cycle: data.cycle,
        duration: data.duration,
        memoriesConsolidated: data.memoriesConsolidated,
        timestamp: new Date().toISOString()
      })
    })

    // Parameter events
    consciousnessEngine.on('parameters-adjusted', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.PARAMETER_ADJUSTED, {
        type: data.type,
        description: data.description,
        before: data.before,
        after: data.after,
        timestamp: new Date().toISOString()
      })
    })

    // Save point events
    consciousnessEngine.on('save-point-created', (data) => {
      this.publishEvent(SUBSCRIPTION_EVENTS.SAVE_POINT_CREATED, {
        commitHash: data.commitHash,
        cycle: data.cycle,
        message: data.message,
        timestamp: data.timestamp
      })
    })

    console.log('[SubscriptionManager] Wired to ConsciousnessEngine')
  }

  /**
   * Publish thought generated event
   *
   * @param {object} thought - Generated thought
   */
  publishThoughtGenerated(thought) {
    this.publishEvent(SUBSCRIPTION_EVENTS.THOUGHT_GENERATED, {
      content: thought.content,
      type: thought.type,
      source: thought.source,
      priority: thought.priority,
      timestamp: thought.generatedAt || new Date().toISOString()
    })
  }

  /**
   * Publish thought processed event
   *
   * @param {object} thought - Original thought
   * @param {object} result - Processing result
   */
  publishThoughtProcessed(thought, result) {
    this.publishEvent(SUBSCRIPTION_EVENTS.THOUGHT_PROCESSED, {
      thought: thought.content?.slice(0, 100),
      tier: result.tier,
      duration: result.duration,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish memory added event
   *
   * @param {object} memory - Memory
   */
  publishMemoryAdded(memory) {
    this.publishEvent(SUBSCRIPTION_EVENTS.MEMORY_ADDED, {
      id: memory.id,
      summary: memory.summary,
      importance: memory.importance,
      timestamp: memory.timestamp
    })
  }

  /**
   * Publish memory promoted event
   *
   * @param {object} memory - Memory
   * @param {object} evaluation - Consolidation evaluation
   */
  publishMemoryPromoted(memory, evaluation) {
    this.publishEvent(SUBSCRIPTION_EVENTS.MEMORY_PROMOTED, {
      id: memory.id,
      summary: memory.summary,
      promotionScore: evaluation.promotionScore,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish bias detected event
   *
   * @param {object} bias - Bias detection result
   */
  publishBiasDetected(bias) {
    this.publishEvent(SUBSCRIPTION_EVENTS.BIAS_DETECTED, {
      biasType: bias.biasType,
      confidence: bias.confidence,
      valueId: bias.valueId,
      reasoning: bias.reasoning,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish value formed event
   *
   * @param {object} value - Newly formed value
   */
  publishValueFormed(value) {
    this.publishEvent(SUBSCRIPTION_EVENTS.VALUE_FORMED, {
      id: value.id,
      category: value.category,
      content: value.content,
      incidents: value.incidents,
      timestamp: value.formedAt
    })
  }

  /**
   * Publish value challenged event
   *
   * @param {object} challenge - Challenge details
   */
  publishValueChallenged(challenge) {
    this.publishEvent(SUBSCRIPTION_EVENTS.VALUE_CHALLENGED, {
      valueId: challenge.valueId,
      category: challenge.category,
      biasDetected: challenge.biasDetected,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish attention shift event
   *
   * @param {string} focusArea - New focus area
   * @param {number} weight - Focus weight
   */
  publishAttentionShift(focusArea, weight) {
    this.publishEvent(SUBSCRIPTION_EVENTS.ATTENTION_SHIFT, {
      focusArea,
      weight,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish task generated event
   *
   * @param {object} task - Generated task
   */
  publishTaskGenerated(task) {
    this.publishEvent(SUBSCRIPTION_EVENTS.TASK_GENERATED, {
      title: task.title,
      type: task.type,
      priority: task.priority,
      source: task.source,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Publish event to subscribers
   *
   * @param {string} eventType - Event type
   * @param {object} payload - Event payload
   */
  publishEvent(eventType, payload) {
    this.pubsub.publish(eventType, {
      [this.eventToFieldName(eventType)]: payload
    })

    this.stats.eventsPublished++
    this.stats.eventsByType[eventType]++
  }

  /**
   * Convert event type to GraphQL field name
   *
   * @param {string} eventType - Event type
   * @returns {string} Field name
   */
  eventToFieldName(eventType) {
    // Convert CONSCIOUSNESS_STREAM -> consciousnessStream
    return eventType
      .split('_')
      .map((part, i) => i === 0
        ? part.toLowerCase()
        : part.charAt(0) + part.slice(1).toLowerCase()
      )
      .join('')
  }

  /**
   * Get PubSub instance for GraphQL resolvers
   *
   * @returns {object} PubSub instance
   */
  getPubSub() {
    return this.pubsub
  }

  /**
   * Get async iterator for subscription
   *
   * @param {string} eventType - Event type
   * @returns {object} Async iterator
   */
  asyncIterator(eventType) {
    return this.pubsub.asyncIterator([eventType])
  }

  /**
   * Get statistics
   *
   * @returns {object} Statistics
   */
  getStats() {
    return {
      ...this.stats
    }
  }
}
