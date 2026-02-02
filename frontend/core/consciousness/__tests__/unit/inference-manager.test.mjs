/**
 * @testfile consciousness/inference-manager
 * @description Unit tests for dual-tier inference management
 *
 * Coverage:
 * - Thought classification
 * - Tier routing (deep vs. rote)
 * - Budget enforcement
 * - Fallback logic
 * - Error handling
 * - Cost tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InferenceManager } from '../../inference-manager.mjs'

describe('InferenceManager', () => {
  let inferenceManager
  let mockDeepProvider
  let mockRoteProvider
  let mockBudgetManager
  let mockClassifier

  beforeEach(() => {
    // Mock deep tier provider (API)
    mockDeepProvider = {
      generate: vi.fn(async (prompt, options) => ({
        text: 'Deep reasoning response',
        tokensUsed: 1000
      }))
    }

    // Mock rote tier provider (local)
    mockRoteProvider = {
      generate: vi.fn(async (prompt, options) => ({
        text: 'Rote processing response',
        tokensUsed: 0  // Free
      }))
    }

    // Mock budget manager
    mockBudgetManager = {
      hasCredit: vi.fn(() => true),
      use: vi.fn(),
      getCreditStatus: vi.fn(() => ({
        hasCredit: true,
        remaining: 1000000
      }))
    }

    // Mock classifier
    mockClassifier = {
      classify: vi.fn(async (thought, context) => ({
        tier: 'deep',
        confidence: 0.8,
        scores: {
          complexity: 0.7,
          novelty: 0.6,
          creativity: 0.8,
          uncertainty: 0.5,
          stakes: 0.6
        },
        reasoning: 'High complexity and creativity',
        deepScore: 0.7
      })),
      recordOutcome: vi.fn()
    }

    inferenceManager = new InferenceManager({
      deepProvider: mockDeepProvider,
      roteProvider: mockRoteProvider,
      budgetManager: mockBudgetManager,
      classifier: mockClassifier
    })
  })

  describe('Initialization', () => {
    it('should initialize with providers', () => {
      expect(inferenceManager.deepTier).toBeDefined()
      expect(inferenceManager.roteTier).toBeDefined()
      expect(inferenceManager.classifier).toBeDefined()
      expect(inferenceManager.budgetManager).toBeDefined()
    })

    it('should initialize cost tracking', () => {
      const stats = inferenceManager.getStats()

      expect(stats.totalCalls).toBe(0)
      expect(stats.deepCalls).toBe(0)
      expect(stats.roteCalls).toBe(0)
      expect(stats.totalCost).toBe(0)
    })
  })

  describe('Tier Routing', () => {
    it('should route deep thoughts to deep tier', async () => {
      const thought = {
        content: 'Design distributed consensus algorithm',
        type: 'architecture'
      }

      const result = await inferenceManager.process(thought, {})

      expect(mockClassifier.classify).toHaveBeenCalled()
      expect(mockDeepProvider.generate).toHaveBeenCalled()
      expect(mockRoteProvider.generate).not.toHaveBeenCalled()
      expect(result.tier).toBe('deep')
    })

    it('should route rote thoughts to rote tier', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        tier: 'rote',
        confidence: 0.9,
        scores: {},
        reasoning: 'Simple command',
        deepScore: 0.2
      })

      const thought = {
        content: 'ls -la',
        type: 'command'
      }

      const result = await inferenceManager.process(thought, {})

      expect(mockRoteProvider.generate).toHaveBeenCalled()
      expect(mockDeepProvider.generate).not.toHaveBeenCalled()
      expect(result.tier).toBe('rote')
    })

    it('should respect classifier recommendation', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        tier: 'deep',
        confidence: 0.95,
        scores: {},
        reasoning: 'Novel complex task',
        deepScore: 0.85
      })

      const thought = {
        content: 'Implement novel algorithm',
        type: 'implementation'
      }

      const result = await inferenceManager.process(thought, {})

      expect(result.tier).toBe('deep')
      expect(result.classification.tier).toBe('deep')
    })
  })

  describe('Budget Enforcement', () => {
    it('should fallback to rote when budget exceeded', async () => {
      mockBudgetManager.hasCredit.mockReturnValue(false)
      mockBudgetManager.getCreditStatus.mockReturnValue({
        hasCredit: false,
        remaining: 0
      })

      const thought = {
        content: 'Complex task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {})

      // Should use rote despite deep classification
      expect(mockRoteProvider.generate).toHaveBeenCalled()
      expect(mockDeepProvider.generate).not.toHaveBeenCalled()
      expect(result.tier).toBe('rote')
      expect(result.budgetOverride).toBe(true)
    })

    it('should use deep tier when budget available', async () => {
      mockBudgetManager.hasCredit.mockReturnValue(true)

      const thought = {
        content: 'Complex task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {})

      expect(mockDeepProvider.generate).toHaveBeenCalled()
      expect(result.budgetOverride).toBeUndefined()
    })

    it('should track budget usage', async () => {
      const thought = {
        content: 'Complex task',
        type: 'task'
      }

      await inferenceManager.process(thought, {})

      expect(mockBudgetManager.use).toHaveBeenCalledWith(1000, 'deep')
    })

    it('should not charge for rote tier', async () => {
      mockClassifier.classify.mockResolvedValueOnce({
        tier: 'rote',
        confidence: 0.9,
        scores: {},
        reasoning: 'Simple',
        deepScore: 0.2
      })

      const thought = {
        content: 'Simple task',
        type: 'command'
      }

      await inferenceManager.process(thought, {})

      // Rote tier uses 0 tokens
      expect(mockBudgetManager.use).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should retry on provider failure', async () => {
      mockDeepProvider.generate
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce({
          text: 'Success on retry',
          tokensUsed: 1000
        })

      const thought = {
        content: 'Complex task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {})

      expect(mockDeepProvider.generate).toHaveBeenCalledTimes(2)
      expect(result.text).toBe('Success on retry')
    })

    it('should fallback to rote after max retries', async () => {
      mockDeepProvider.generate.mockRejectedValue(new Error('API down'))

      const thought = {
        content: 'Complex task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {}, { maxRetries: 2 })

      expect(mockDeepProvider.generate).toHaveBeenCalledTimes(2)
      expect(mockRoteProvider.generate).toHaveBeenCalled()
      expect(result.tier).toBe('rote')
      expect(result.fallbackReason).toContain('error')
    })

    it('should handle classification errors gracefully', async () => {
      mockClassifier.classify.mockRejectedValue(new Error('Classification failed'))

      const thought = {
        content: 'Task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {})

      // Should default to rote on classification error
      expect(mockRoteProvider.generate).toHaveBeenCalled()
      expect(result.tier).toBe('rote')
    })
  })

  describe('Context Building', () => {
    it('should pass context to classifier', async () => {
      const thought = {
        content: 'Task',
        type: 'task'
      }

      const context = {
        recentThoughts: [
          { content: 'Previous task', outcome: 'success' }
        ]
      }

      await inferenceManager.process(thought, context)

      expect(mockClassifier.classify).toHaveBeenCalledWith(
        thought,
        expect.objectContaining({
          recentThoughts: context.recentThoughts
        })
      )
    })

    it('should include budget status in context', async () => {
      mockBudgetManager.getCreditStatus.mockReturnValue({
        hasCredit: true,
        remaining: 500000,
        percentageUsed: 50
      })

      const thought = {
        content: 'Task',
        type: 'task'
      }

      await inferenceManager.process(thought, {})

      expect(mockClassifier.classify).toHaveBeenCalledWith(
        thought,
        expect.objectContaining({
          budgetStatus: expect.any(Object)
        })
      )
    })
  })

  describe('Outcome Recording', () => {
    it('should record successful outcomes', async () => {
      const thought = {
        content: 'Task',
        type: 'task'
      }

      const result = await inferenceManager.process(thought, {})

      expect(mockClassifier.recordOutcome).toHaveBeenCalledWith(
        thought,
        expect.objectContaining({ tier: 'deep' }),
        expect.objectContaining({
          tier: 'deep',
          success: true
        })
      )
    })

    it('should record failed outcomes', async () => {
      mockDeepProvider.generate.mockRejectedValue(new Error('Failed'))

      const thought = {
        content: 'Task',
        type: 'task'
      }

      try {
        await inferenceManager.process(thought, {}, { maxRetries: 0, noFallback: true })
      } catch (error) {
        // Expected to throw
      }

      expect(mockClassifier.recordOutcome).toHaveBeenCalledWith(
        thought,
        expect.any(Object),
        expect.objectContaining({
          success: false
        })
      )
    })
  })

  describe('Statistics', () => {
    it('should track total calls', async () => {
      const thought = {
        content: 'Task',
        type: 'task'
      }

      await inferenceManager.process(thought, {})
      await inferenceManager.process(thought, {})

      const stats = inferenceManager.getStats()

      expect(stats.totalCalls).toBe(2)
    })

    it('should track tier distribution', async () => {
      // Deep call
      await inferenceManager.process({ content: 'Deep task', type: 'task' }, {})

      // Rote call
      mockClassifier.classify.mockResolvedValueOnce({
        tier: 'rote',
        confidence: 0.9,
        scores: {},
        reasoning: 'Simple',
        deepScore: 0.2
      })
      await inferenceManager.process({ content: 'Simple task', type: 'command' }, {})

      const stats = inferenceManager.getStats()

      expect(stats.deepCalls).toBe(1)
      expect(stats.roteCalls).toBe(1)
    })

    it('should track total cost', async () => {
      await inferenceManager.process({ content: 'Task 1', type: 'task' }, {})
      await inferenceManager.process({ content: 'Task 2', type: 'task' }, {})

      const stats = inferenceManager.getStats()

      expect(stats.totalCost).toBe(2000) // 2 * 1000 tokens
    })

    it('should calculate average duration', async () => {
      await inferenceManager.process({ content: 'Task', type: 'task' }, {})

      const stats = inferenceManager.getStats()

      expect(stats.avgDuration).toBeGreaterThan(0)
    })
  })

  describe('Provider Configuration', () => {
    it('should accept custom providers', () => {
      const customDeep = {
        generate: vi.fn()
      }

      const manager = new InferenceManager({
        deepProvider: customDeep,
        roteProvider: mockRoteProvider
      })

      expect(manager.deepTier.provider).toBe(customDeep)
    })

    it('should configure provider options', () => {
      const manager = new InferenceManager({
        deepProvider: mockDeepProvider,
        roteProvider: mockRoteProvider,
        deepOptions: {
          model: 'claude-sonnet-4-5',
          temperature: 0.7
        }
      })

      expect(manager.deepTier.options.model).toBe('claude-sonnet-4-5')
    })
  })
})
