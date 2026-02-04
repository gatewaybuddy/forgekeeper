/**
 * @testfile consciousness/system-integration
 * @description Integration tests for full consciousness system wiring
 *
 * Validates:
 * - GraphQL → Resolvers → System
 * - Thought classification → Inference routing
 * - Budget enforcement → Tier selection
 * - Memory management → STM ↔ LTM
 * - End-to-end thought processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ThoughtClassifier } from '../../thought-classifier.mjs'
import { BudgetManager } from '../../budget-manager.mjs'
import { InferenceManager } from '../../inference-manager.mjs'
import { ShortTermMemory } from '../../short-term-memory.mjs'
import { MemorySummarizer } from '../../memory-summarizer.mjs'
import { resolvers } from '../../../graphql/resolvers.mjs'

describe('Consciousness System Integration', () => {
  let budgetManager
  let classifier
  let inferenceManager
  let shortTermMemory
  let summarizer
  let mockDeepProvider
  let mockRoteProvider

  beforeEach(() => {
    // Set up the complete system
    budgetManager = new BudgetManager({ dailyLimit: 1000000 })
    classifier = new ThoughtClassifier({ threshold: 0.6 })

    mockDeepProvider = {
      generate: vi.fn(async () => ({
        text: 'Deep reasoning result',
        tokensUsed: 1000
      }))
    }

    mockRoteProvider = {
      generate: vi.fn(async () => ({
        text: 'Rote processing result',
        tokensUsed: 0
      }))
    }

    inferenceManager = new InferenceManager({
      deepProvider: mockDeepProvider,
      roteProvider: mockRoteProvider,
      budgetManager,
      classifier
    })

    summarizer = new MemorySummarizer({ inferenceManager })
    shortTermMemory = new ShortTermMemory({ slots: 5 })
  })

  describe('Thought Processing Pipeline', () => {
    it('should process simple thought through complete pipeline', async () => {
      const thought = {
        content: 'ls -la',
        type: 'command'
      }

      // 1. Classify
      const classification = await classifier.classify(thought, {})
      expect(classification.tier).toBe('rote')

      // 2. Process through inference
      const result = await inferenceManager.process(thought, {})
      expect(result.tier).toBe('rote')
      expect(mockRoteProvider.generate).toHaveBeenCalled()

      // 3. Summarize
      const summary = await summarizer.summarize({
        content: thought.content,
        outcome: 'success'
      })
      expect(summary.summary).toBeDefined()

      // 4. Add to STM
      await shortTermMemory.add(summary)
      expect(shortTermMemory.buffer.length).toBe(1)
    })

    it('should process complex thought requiring deep tier', async () => {
      const thought = {
        content: 'Design a distributed consensus algorithm considering Byzantine failures',
        type: 'architecture'
      }

      // 1. Classify (should be deep)
      const classification = await classifier.classify(thought, {})
      expect(classification.tier).toBe('deep')
      expect(classification.scores.complexity).toBeGreaterThan(0.6)

      // 2. Check budget
      expect(budgetManager.hasCredit(2000)).toBe(true)

      // 3. Process through inference
      const result = await inferenceManager.process(thought, {})
      expect(result.tier).toBe('deep')
      expect(mockDeepProvider.generate).toHaveBeenCalled()

      // 4. Budget should be updated
      expect(budgetManager.used).toBe(1000)
    })
  })

  describe('Budget-Driven Tier Selection', () => {
    it('should fallback to rote when budget exceeded', async () => {
      // Exhaust budget
      budgetManager.use(1000000)

      const thought = {
        content: 'Complex architectural decision',
        type: 'architecture'
      }

      // Classify as deep
      const classification = await classifier.classify(thought, {})
      expect(classification.tier).toBe('deep')

      // But process as rote due to budget
      const result = await inferenceManager.process(thought, {})
      expect(result.tier).toBe('rote')
      expect(result.budgetOverride).toBe(true)
      expect(mockRoteProvider.generate).toHaveBeenCalled()
    })
  })

  describe('Memory Management Integration', () => {
    it('should evict and promote when STM full', async () => {
      // Fill STM to capacity
      for (let i = 0; i < 5; i++) {
        const summary = await summarizer.summarize({
          content: `Task ${i}`,
          outcome: 'success'
        })
        await shortTermMemory.add(summary)
      }

      expect(shortTermMemory.buffer.length).toBe(5)

      // Add one more - should trigger eviction
      const newSummary = await summarizer.summarize({
        content: 'New task',
        outcome: 'success'
      })
      await shortTermMemory.add(newSummary)

      // Still 5 slots (one evicted)
      expect(shortTermMemory.buffer.length).toBe(5)
      expect(shortTermMemory.evictionHistory.length).toBe(1)
    })

    it('should track access patterns for intelligent eviction', async () => {
      // Add memories
      const mem1 = await summarizer.summarize({ content: 'Task 1', outcome: 'success' })
      const mem2 = await summarizer.summarize({ content: 'Task 2', outcome: 'success' })

      await shortTermMemory.add(mem1)
      await shortTermMemory.add(mem2)

      // Access mem1 multiple times
      await shortTermMemory.getRelevant('Task 1')
      await shortTermMemory.getRelevant('Task 1')
      await shortTermMemory.getRelevant('Task 1')

      // Fill buffer to force eviction
      for (let i = 3; i <= 5; i++) {
        const mem = await summarizer.summarize({ content: `Task ${i}`, outcome: 'success' })
        await shortTermMemory.add(mem)
      }

      // Add one more to trigger eviction
      const mem6 = await summarizer.summarize({ content: 'Task 6', outcome: 'success' })
      await shortTermMemory.add(mem6)

      // mem1 should still be in buffer (high access count)
      const mem1InBuffer = shortTermMemory.buffer.some(m =>
        m.summary.includes('Task 1')
      )
      expect(mem1InBuffer).toBe(true)
    })
  })

  describe('Classification Learning', () => {
    it('should improve classification through feedback', () => {
      const initialStats = classifier.getClassificationStats()
      expect(initialStats.total).toBe(0)

      // Record outcomes
      const thought = { content: 'Task', type: 'task' }
      const classification = { tier: 'deep', confidence: 0.7, deepScore: 0.65 }
      const outcome = { tier: 'deep', success: true, duration: 5000 }

      classifier.recordOutcome(thought, classification, outcome)

      const stats = classifier.getClassificationStats()
      expect(stats.total).toBe(1)
      expect(stats.correct).toBe(1)
      expect(stats.accuracy).toBe(1.0)
    })

    it('should adapt threshold based on misclassifications', () => {
      const initialThreshold = classifier.threshold

      // Record many misclassifications suggesting threshold too high
      for (let i = 0; i < 25; i++) {
        classifier.recordOutcome(
          { content: 'task', type: 'task' },
          { tier: 'rote', confidence: 0.7, deepScore: 0.55 },
          { tier: 'deep', success: true, duration: 10000 }
        )
      }

      classifier.adaptThreshold()

      // Threshold should decrease
      expect(classifier.threshold).toBeLessThan(initialThreshold)
    })
  })

  describe('GraphQL Integration', () => {
    it('should wire resolvers to consciousness system', async () => {
      const mockConsciousness = {
        budgetManager,
        inferenceManager,
        shortTermMemory,
        getState: () => ({
          id: 'consciousness-1',
          state: 'thinking',
          currentCycle: 42,
          cycleInterval: 900000,
          cycleRange: { min: 60000, max: 3600000 },
          shortTermMemory: shortTermMemory.buffer,
          recentThoughts: [],
          apiTokensRemaining: budgetManager.remaining,
          apiTokensUsed: budgetManager.used,
          lastDreamCycle: null,
          cyclesSinceLastDream: 0,
          cognitiveLoad: 0.3,
          uptime: 120000,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }

      const context = { consciousness: mockConsciousness }

      // Test query
      const state = await resolvers.Query.consciousnessState(null, {}, context)
      expect(state.state).toBe('thinking')
      expect(state.currentCycle).toBe(42)

      // Test budget query
      const budget = await resolvers.Query.budget(null, {}, context)
      expect(budget.dailyLimit).toBe(1000000)
    })
  })

  describe('Error Resilience', () => {
    it('should handle provider failures gracefully', async () => {
      // Make deep provider fail
      mockDeepProvider.generate.mockRejectedValue(new Error('API timeout'))

      const thought = {
        content: 'Complex task',
        type: 'architecture'
      }

      // Should fallback to rote
      const result = await inferenceManager.process(thought, {})
      expect(result.tier).toBe('rote')
      expect(result.fallbackReason).toContain('timeout')
    })

    it('should handle classification errors', async () => {
      // Create a classifier that fails
      const brokenClassifier = {
        classify: vi.fn().mockRejectedValue(new Error('Classification failed'))
      }

      const brokenManager = new InferenceManager({
        deepProvider: mockDeepProvider,
        roteProvider: mockRoteProvider,
        classifier: brokenClassifier,
        budgetManager
      })

      const thought = { content: 'Task', type: 'task' }

      // Should default to rote on classification error
      const result = await brokenManager.process(thought, {})
      expect(result.tier).toBe('rote')
    })
  })

  describe('Performance Tracking', () => {
    it('should track statistics across components', async () => {
      // Process multiple thoughts
      const thoughts = [
        { content: 'Simple command', type: 'command' },
        { content: 'Complex architecture', type: 'architecture' },
        { content: 'Another command', type: 'command' }
      ]

      for (const thought of thoughts) {
        await inferenceManager.process(thought, {})
      }

      const stats = inferenceManager.getStats()
      expect(stats.totalCalls).toBe(3)
      expect(stats.deepCalls).toBeGreaterThan(0)
      expect(stats.roteCalls).toBeGreaterThan(0)
    })
  })

  describe('Data Flow Validation', () => {
    it('should maintain data integrity through pipeline', async () => {
      const originalThought = {
        content: 'Implement feature X',
        type: 'implementation'
      }

      // Process through system
      const classification = await classifier.classify(originalThought, {})
      const result = await inferenceManager.process(originalThought, {})
      const summary = await summarizer.summarize({
        content: originalThought.content,
        outcome: 'success'
      })

      // Verify data flow
      expect(classification.tier).toBeDefined()
      expect(result.tier).toBe(classification.tier)
      expect(summary.summary).toContain('Implement') || expect(summary.summary).toContain('feature')
    })
  })
})
