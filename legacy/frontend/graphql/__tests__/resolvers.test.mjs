/**
 * @testfile graphql/resolvers
 * @description Integration tests for GraphQL resolvers
 *
 * Coverage:
 * - Query resolvers
 * - Mutation resolvers
 * - Context handling
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolvers } from '../resolvers.mjs'

describe('GraphQL Resolvers', () => {
  let mockConsciousness

  beforeEach(() => {
    // Create mock consciousness engine
    mockConsciousness = {
      state: 'idle',
      cycleCount: 0,
      cycleInterval: 900000, // 15 min
      cycleRange: { min: 60000, max: 3600000 },

      getState: vi.fn(() => ({
        id: 'consciousness-1',
        state: mockConsciousness.state,
        currentCycle: mockConsciousness.cycleCount,
        cycleInterval: mockConsciousness.cycleInterval,
        cycleRange: mockConsciousness.cycleRange,
        shortTermMemory: [],
        recentThoughts: [],
        apiTokensRemaining: 1000000,
        apiTokensUsed: 0,
        lastDreamCycle: null,
        cyclesSinceLastDream: 0,
        cognitiveLoad: 0.0,
        uptime: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),

      start: vi.fn(async () => {
        mockConsciousness.state = 'thinking'
      }),

      stop: vi.fn(async () => {
        mockConsciousness.state = 'stopped'
      }),

      setCycleInterval: vi.fn((interval) => {
        mockConsciousness.cycleInterval = interval
      }),

      setCycleRange: vi.fn((range) => {
        mockConsciousness.cycleRange = range
      }),

      getRecentThoughts: vi.fn(() => []),
      getThought: vi.fn(() => null),
      getStatistics: vi.fn(() => ({
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
      })),

      memoryManager: {
        getMemories: vi.fn(() => []),
        searchMemories: vi.fn(() => [])
      },

      dreamEngine: {
        getDreamCycles: vi.fn(() => []),
        getDreamCycle: vi.fn(() => null),
        dream: vi.fn(async () => ({
          id: 'dream-1',
          cycle: 0,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 1000,
          phases: [],
          insights: [],
          status: 'COMPLETED',
          triggerReason: 'manual'
        }))
      },

      valueTracker: {
        getValues: vi.fn(() => []),
        getBiases: vi.fn(() => []),
        challengeBias: vi.fn(async (id) => ({
          id,
          description: 'Test bias',
          sourceCount: 1,
          sourceMemories: [],
          status: 'CHALLENGED',
          discriminatoryRisk: 0.5,
          discriminatoryReasoning: 'Test',
          lastChallenged: new Date().toISOString(),
          challengeCount: 1,
          createdAt: new Date().toISOString(),
          needsValidation: false
        }))
      },

      autoCommit: {
        getSavePoints: vi.fn(() => []),
        createSavePoint: vi.fn(async (cycle, reason) => ({
          id: `save-${cycle}`,
          cycle,
          commitHash: 'abc123',
          message: reason || `cycle-${cycle}: Auto-save`,
          timestamp: new Date().toISOString(),
          filesChanged: [],
          isMilestone: false,
          milestoneTag: null
        }))
      },

      budgetManager: {
        getBudget: vi.fn(() => ({
          dailyLimit: 1000000,
          used: 0,
          remaining: 1000000,
          percentageUsed: 0,
          resetsAt: new Date().toISOString()
        })),
        reset: vi.fn(() => ({
          dailyLimit: 1000000,
          used: 0,
          remaining: 1000000,
          percentageUsed: 0,
          resetsAt: new Date().toISOString()
        }))
      },

      shortTermMemory: {
        swap: vi.fn(async (slotIndex, memoryId) => ({
          id: memoryId,
          summary: 'Swapped memory',
          importance: 0.8,
          emotionalSalience: 0.5,
          timestamp: new Date().toISOString(),
          accessCount: 1,
          type: 'LONG_TERM',
          categories: [],
          novelty: 0.7,
          relatedMemories: [],
          consolidatedAt: null
        })),
        promoteToLongTerm: vi.fn(async (memoryId) => ({
          id: memoryId,
          summary: 'Promoted memory',
          importance: 0.9,
          emotionalSalience: 0.8,
          timestamp: new Date().toISOString(),
          accessCount: 1,
          type: 'CONSOLIDATED',
          categories: [],
          novelty: 0.8,
          relatedMemories: [],
          consolidatedAt: new Date().toISOString()
        }))
      }
    }
  })

  // ============================================================
  // QUERY TESTS
  // ============================================================
  describe('Query.consciousnessState', () => {
    it('should return current consciousness state', async () => {
      const context = { consciousness: mockConsciousness }
      const result = await resolvers.Query.consciousnessState(null, {}, context)

      expect(result).toBeDefined()
      expect(result.state).toBe('idle')
      expect(mockConsciousness.getState).toHaveBeenCalled()
    })

    it('should throw error if consciousness not initialized', async () => {
      const context = { consciousness: null }

      await expect(
        resolvers.Query.consciousnessState(null, {}, context)
      ).rejects.toThrow('Consciousness engine not initialized')
    })
  })

  describe('Query.memories', () => {
    it('should return memories with filters', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { type: 'SHORT_TERM', limit: 10, offset: 0, minImportance: 0.5 }

      const result = await resolvers.Query.memories(null, args, context)

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
      expect(mockConsciousness.memoryManager.getMemories).toHaveBeenCalledWith(args)
    })

    it('should return empty array if memory manager not available', async () => {
      const context = { consciousness: { ...mockConsciousness, memoryManager: null } }
      const result = await resolvers.Query.memories(null, {}, context)

      expect(result).toEqual([])
    })
  })

  describe('Query.budget', () => {
    it('should return budget information', async () => {
      const context = { consciousness: mockConsciousness }
      const result = await resolvers.Query.budget(null, {}, context)

      expect(result).toBeDefined()
      expect(result.dailyLimit).toBe(1000000)
      expect(result.remaining).toBe(1000000)
    })
  })

  // ============================================================
  // MUTATION TESTS
  // ============================================================
  describe('Mutation.startConsciousness', () => {
    it('should start consciousness engine', async () => {
      const context = { consciousness: mockConsciousness }
      const result = await resolvers.Mutation.startConsciousness(null, {}, context)

      expect(mockConsciousness.start).toHaveBeenCalled()
      expect(result.state).toBe('thinking')
    })

    it('should throw error if consciousness not initialized', async () => {
      const context = { consciousness: null }

      await expect(
        resolvers.Mutation.startConsciousness(null, {}, context)
      ).rejects.toThrow('Consciousness engine not initialized')
    })
  })

  describe('Mutation.adjustCycleInterval', () => {
    it('should adjust cycle interval', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { seconds: 30 }

      await resolvers.Mutation.adjustCycleInterval(null, args, context)

      expect(mockConsciousness.setCycleInterval).toHaveBeenCalledWith(30000)
    })
  })

  describe('Mutation.expandCycleRange', () => {
    it('should expand cycle range', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { minSeconds: 5, maxSeconds: 120 }

      await resolvers.Mutation.expandCycleRange(null, args, context)

      expect(mockConsciousness.setCycleRange).toHaveBeenCalledWith({
        min: 5000,
        max: 120000
      })
    })
  })

  describe('Mutation.triggerDreamCycle', () => {
    it('should manually trigger dream cycle', async () => {
      const context = { consciousness: mockConsciousness }
      const result = await resolvers.Mutation.triggerDreamCycle(null, {}, context)

      expect(result).toBeDefined()
      expect(result.status).toBe('COMPLETED')
      expect(mockConsciousness.dreamEngine.dream).toHaveBeenCalledWith(
        mockConsciousness,
        'manual'
      )
    })

    it('should throw error if dream engine not available', async () => {
      const context = {
        consciousness: { ...mockConsciousness, dreamEngine: null }
      }

      await expect(
        resolvers.Mutation.triggerDreamCycle(null, {}, context)
      ).rejects.toThrow('Dream engine not available')
    })
  })

  describe('Mutation.swapMemory', () => {
    it('should swap short-term memory with long-term', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { stmSlotIndex: 0, ltmMemoryId: 'mem-123' }

      const result = await resolvers.Mutation.swapMemory(null, args, context)

      expect(result).toBeDefined()
      expect(result.id).toBe('mem-123')
      expect(mockConsciousness.shortTermMemory.swap).toHaveBeenCalledWith(0, 'mem-123')
    })
  })

  describe('Mutation.createSavePoint', () => {
    it('should create git save point', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { reason: 'Test save' }

      const result = await resolvers.Mutation.createSavePoint(null, args, context)

      expect(result).toBeDefined()
      expect(result.commitHash).toBe('abc123')
    })
  })

  describe('Mutation.challengeBias', () => {
    it('should challenge a bias', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { biasId: 'bias-123' }

      const result = await resolvers.Mutation.challengeBias(null, args, context)

      expect(result).toBeDefined()
      expect(result.status).toBe('CHALLENGED')
      expect(mockConsciousness.valueTracker.challengeBias).toHaveBeenCalled()
    })
  })

  describe('Mutation.promoteMemory', () => {
    it('should promote memory to long-term', async () => {
      const context = { consciousness: mockConsciousness }
      const args = { memoryId: 'mem-456' }

      const result = await resolvers.Mutation.promoteMemory(null, args, context)

      expect(result).toBeDefined()
      expect(result.type).toBe('CONSOLIDATED')
    })
  })

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  describe('Error Handling', () => {
    it('should handle missing consciousness gracefully', async () => {
      const context = {}

      const result = await resolvers.Query.memories(null, {}, context)
      expect(result).toEqual([])
    })

    it('should throw clear errors for required systems', async () => {
      const context = { consciousness: null }

      await expect(
        resolvers.Mutation.startConsciousness(null, {}, context)
      ).rejects.toThrow('Consciousness engine not initialized')
    })
  })
})
