/**
 * @module graphql/resolvers
 * @description GraphQL resolvers for consciousness system queries, mutations, and subscriptions
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 85%
 *
 * Dependencies:
 * - consciousness-engine.mjs (when implemented)
 * - apollo-server.mjs
 *
 * Integration points:
 * - Called by: Apollo Server
 * - Calls: ConsciousnessEngine methods
 * - Publishes: PubSub events for subscriptions
 *
 * Tests:
 * - integration: graphql/__tests__/resolvers.test.mjs
 */

import { PubSub } from 'graphql-subscriptions'

const pubsub = new PubSub()

// Event names for subscriptions
export const EVENTS = {
  CONSCIOUSNESS_STREAM: 'CONSCIOUSNESS_STREAM',
  MEMORY_UPDATE: 'MEMORY_UPDATE',
  DREAM_CYCLE: 'DREAM_CYCLE',
  THOUGHT_STREAM: 'THOUGHT_STREAM',
  BIAS_UPDATE: 'BIAS_UPDATE',
  VALUE_UPDATE: 'VALUE_UPDATE',
  SAVE_POINT_CREATED: 'SAVE_POINT_CREATED'
}

/**
 * GraphQL resolvers
 */
export const resolvers = {
  // ============================================================
  // QUERIES
  // ============================================================
  Query: {
    /**
     * Get current consciousness state
     */
    consciousnessState: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness) {
        throw new Error('Consciousness engine not initialized')
      }

      return consciousness.getState()
    },

    /**
     * Get memories with optional filters
     */
    memories: async (parent, { type, limit = 50, offset = 0, minImportance }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.memoryManager) {
        return []
      }

      return consciousness.memoryManager.getMemories({
        type,
        limit,
        offset,
        minImportance
      })
    },

    /**
     * Search memories by semantic similarity
     */
    searchMemories: async (parent, { query, type, limit = 10 }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.memoryManager) {
        return []
      }

      return consciousness.memoryManager.searchMemories(query, { type, limit })
    },

    /**
     * Get recent thoughts
     */
    recentThoughts: async (parent, { limit = 20, tier, minDuration }, context) => {
      const { consciousness } = context

      if (!consciousness) {
        return []
      }

      return consciousness.getRecentThoughts({ limit, tier, minDuration })
    },

    /**
     * Get thought by ID
     */
    thought: async (parent, { id }, context) => {
      const { consciousness } = context

      if (!consciousness) {
        return null
      }

      return consciousness.getThought(id)
    },

    /**
     * Get dream cycles
     */
    dreamCycles: async (parent, { limit = 10, status }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.dreamEngine) {
        return []
      }

      return consciousness.dreamEngine.getDreamCycles({ limit, status })
    },

    /**
     * Get dream cycle by ID
     */
    dreamCycle: async (parent, { id }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.dreamEngine) {
        return null
      }

      return consciousness.dreamEngine.getDreamCycle(id)
    },

    /**
     * Get all values
     */
    values: async (parent, { minStrength, limit = 50 }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.valueTracker) {
        return []
      }

      return consciousness.valueTracker.getValues({ minStrength, limit })
    },

    /**
     * Get all biases
     */
    biases: async (parent, { status, minRisk, limit = 50 }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.valueTracker) {
        return []
      }

      return consciousness.valueTracker.getBiases({ status, minRisk, limit })
    },

    /**
     * Get save points
     */
    savePoints: async (parent, { limit = 20, milestonesOnly }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.autoCommit) {
        return []
      }

      return consciousness.autoCommit.getSavePoints({ limit, milestonesOnly })
    },

    /**
     * Get budget information
     */
    budget: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.budgetManager) {
        return {
          dailyLimit: 0,
          used: 0,
          remaining: 0,
          percentageUsed: 0,
          resetsAt: new Date().toISOString()
        }
      }

      return consciousness.budgetManager.getBudget()
    },

    /**
     * Get system statistics
     */
    statistics: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness) {
        return {
          totalCycles: 0,
          totalDreamCycles: 0,
          totalThoughts: 0,
          deepTierThoughts: 0,
          roteTierThoughts: 0,
          avgCycleDuration: 0,
          avgDreamDuration: 0,
          totalApiTokensUsed: 0,
          stmMemoriesCreated: 0,
          ltmMemoriesCreated: 0,
          valuesTracked: 0,
          biasesTracked: 0,
          commitsCreated: 0
        }
      }

      return consciousness.getStatistics()
    }
  },

  // ============================================================
  // MUTATIONS
  // ============================================================
  Mutation: {
    /**
     * Start the consciousness engine
     */
    startConsciousness: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness) {
        throw new Error('Consciousness engine not initialized')
      }

      await consciousness.start()

      // Publish event
      pubsub.publish(EVENTS.CONSCIOUSNESS_STREAM, {
        consciousnessStream: {
          type: 'STATE_CHANGE',
          cycle: consciousness.cycleCount,
          data: JSON.stringify({ state: 'THINKING' }),
          timestamp: new Date().toISOString(),
          message: 'Consciousness engine started'
        }
      })

      return consciousness.getState()
    },

    /**
     * Stop the consciousness engine
     */
    stopConsciousness: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness) {
        throw new Error('Consciousness engine not initialized')
      }

      await consciousness.stop()

      // Publish event
      pubsub.publish(EVENTS.CONSCIOUSNESS_STREAM, {
        consciousnessStream: {
          type: 'STATE_CHANGE',
          cycle: consciousness.cycleCount,
          data: JSON.stringify({ state: 'STOPPED' }),
          timestamp: new Date().toISOString(),
          message: 'Consciousness engine stopped'
        }
      })

      return consciousness.getState()
    },

    /**
     * Adjust cycle interval
     */
    adjustCycleInterval: async (parent, { seconds }, context) => {
      const { consciousness } = context

      if (!consciousness) {
        throw new Error('Consciousness engine not initialized')
      }

      const newInterval = seconds * 1000 // Convert to milliseconds
      consciousness.setCycleInterval(newInterval)

      // Publish event
      pubsub.publish(EVENTS.CONSCIOUSNESS_STREAM, {
        consciousnessStream: {
          type: 'PARAMETER_CHANGE',
          cycle: consciousness.cycleCount,
          data: JSON.stringify({ cycleInterval: newInterval }),
          timestamp: new Date().toISOString(),
          message: `Cycle interval adjusted to ${seconds}s`
        }
      })

      return consciousness.getState()
    },

    /**
     * Expand cycle range
     */
    expandCycleRange: async (parent, { minSeconds, maxSeconds }, context) => {
      const { consciousness } = context

      if (!consciousness) {
        throw new Error('Consciousness engine not initialized')
      }

      consciousness.setCycleRange({
        min: minSeconds * 1000,
        max: maxSeconds * 1000
      })

      // Publish event
      pubsub.publish(EVENTS.CONSCIOUSNESS_STREAM, {
        consciousnessStream: {
          type: 'PARAMETER_CHANGE',
          cycle: consciousness.cycleCount,
          data: JSON.stringify({
            cycleRange: { min: minSeconds * 1000, max: maxSeconds * 1000 }
          }),
          timestamp: new Date().toISOString(),
          message: `Cycle range expanded to ${minSeconds}-${maxSeconds}s`
        }
      })

      return consciousness.getState()
    },

    /**
     * Manually trigger a dream cycle
     */
    triggerDreamCycle: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.dreamEngine) {
        throw new Error('Dream engine not available')
      }

      const dreamCycle = await consciousness.dreamEngine.dream(consciousness, 'manual')

      // Publish event
      pubsub.publish(EVENTS.DREAM_CYCLE, {
        dreamCycleEvents: dreamCycle
      })

      return dreamCycle
    },

    /**
     * Swap short-term memory with long-term memory
     */
    swapMemory: async (parent, { stmSlotIndex, ltmMemoryId }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.shortTermMemory) {
        throw new Error('Memory system not available')
      }

      const swappedMemory = await consciousness.shortTermMemory.swap(
        stmSlotIndex,
        ltmMemoryId
      )

      // Publish event
      pubsub.publish(EVENTS.MEMORY_UPDATE, {
        memoryUpdates: swappedMemory
      })

      return swappedMemory
    },

    /**
     * Create a save point (git commit)
     */
    createSavePoint: async (parent, { reason }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.autoCommit) {
        throw new Error('Auto-commit system not available')
      }

      const savePoint = await consciousness.autoCommit.createSavePoint(
        consciousness.cycleCount,
        reason
      )

      // Publish event
      pubsub.publish(EVENTS.SAVE_POINT_CREATED, {
        savePointCreated: savePoint
      })

      return savePoint
    },

    /**
     * Manually challenge a bias
     */
    challengeBias: async (parent, { biasId }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.valueTracker) {
        throw new Error('Value tracker not available')
      }

      const challengedBias = await consciousness.valueTracker.challengeBias(
        biasId,
        consciousness
      )

      // Publish event
      pubsub.publish(EVENTS.BIAS_UPDATE, {
        biasUpdates: challengedBias
      })

      return challengedBias
    },

    /**
     * Promote a short-term memory to long-term
     */
    promoteMemory: async (parent, { memoryId }, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.shortTermMemory) {
        throw new Error('Memory system not available')
      }

      const promotedMemory = await consciousness.shortTermMemory.promoteToLongTerm(
        memoryId
      )

      // Publish event
      pubsub.publish(EVENTS.MEMORY_UPDATE, {
        memoryUpdates: promotedMemory
      })

      return promotedMemory
    },

    /**
     * Reset API budget (for testing)
     */
    resetBudget: async (parent, args, context) => {
      const { consciousness } = context

      if (!consciousness || !consciousness.budgetManager) {
        throw new Error('Budget manager not available')
      }

      return consciousness.budgetManager.reset()
    }
  },

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================
  Subscription: {
    /**
     * Subscribe to consciousness events
     */
    consciousnessStream: {
      subscribe: () => pubsub.asyncIterator([EVENTS.CONSCIOUSNESS_STREAM])
    },

    /**
     * Subscribe to memory updates
     */
    memoryUpdates: {
      subscribe: () => pubsub.asyncIterator([EVENTS.MEMORY_UPDATE])
    },

    /**
     * Subscribe to dream cycle events
     */
    dreamCycleEvents: {
      subscribe: () => pubsub.asyncIterator([EVENTS.DREAM_CYCLE])
    },

    /**
     * Subscribe to thought stream
     */
    thoughtStream: {
      subscribe: () => pubsub.asyncIterator([EVENTS.THOUGHT_STREAM])
    },

    /**
     * Subscribe to bias updates
     */
    biasUpdates: {
      subscribe: () => pubsub.asyncIterator([EVENTS.BIAS_UPDATE])
    },

    /**
     * Subscribe to value updates
     */
    valueUpdates: {
      subscribe: () => pubsub.asyncIterator([EVENTS.VALUE_UPDATE])
    },

    /**
     * Subscribe to save point creation
     */
    savePointCreated: {
      subscribe: () => pubsub.asyncIterator([EVENTS.SAVE_POINT_CREATED])
    }
  }
}

/**
 * Export pubsub for use by consciousness engine
 */
export { pubsub }

/**
 * Helper function to publish events from consciousness engine
 */
export function publishEvent(eventName, data) {
  if (!EVENTS[eventName]) {
    console.warn(`Unknown event: ${eventName}`)
    return
  }

  pubsub.publish(EVENTS[eventName], data)
}
