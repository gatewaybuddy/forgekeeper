/**
 * @testfile consciousness/thought-classifier
 * @description Unit tests for thought classification (deep vs. rote)
 *
 * Coverage:
 * - Complexity scoring
 * - Novelty detection
 * - Creativity assessment
 * - Uncertainty measurement
 * - Stakes evaluation
 * - Tier determination
 * - Learning from outcomes
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ThoughtClassifier } from '../../thought-classifier.mjs'

describe('ThoughtClassifier', () => {
  let classifier

  beforeEach(() => {
    classifier = new ThoughtClassifier({
      threshold: 0.6,
      weights: {
        complexity: 0.25,
        novelty: 0.20,
        creativity: 0.25,
        uncertainty: 0.15,
        stakes: 0.15
      }
    })
  })

  describe('Complexity Scoring', () => {
    it('should score simple commands as low complexity', async () => {
      const thought = {
        content: 'npm install',
        type: 'command'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.complexity).toBeLessThan(0.4)
    })

    it('should score architectural questions as high complexity', async () => {
      const thought = {
        content: 'Design a distributed consensus algorithm considering Byzantine failures and network partitions',
        type: 'architecture'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.complexity).toBeGreaterThan(0.7)
    })

    it('should consider concept count in complexity', async () => {
      const simpleThought = {
        content: 'List files',
        type: 'command'
      }

      const complexThought = {
        content: 'Implement authentication with OAuth2, JWT tokens, refresh token rotation, and CSRF protection',
        type: 'implementation'
      }

      const simple = await classifier.classify(simpleThought, {})
      const complex = await classifier.classify(complexThought, {})

      expect(complex.scores.complexity).toBeGreaterThan(simple.scores.complexity)
    })
  })

  describe('Novelty Detection', () => {
    it('should score first-time tasks as high novelty', async () => {
      const thought = {
        content: 'Implement quantum error correction',
        type: 'implementation'
      }

      const context = {
        recentThoughts: []  // Empty history
      }

      const result = await classifier.classify(thought, context)

      expect(result.scores.novelty).toBeGreaterThan(0.6)
    })

    it('should score repeated tasks as low novelty', async () => {
      const thought = {
        content: 'Run tests',
        type: 'command'
      }

      const context = {
        recentThoughts: [
          { content: 'Run tests', outcome: 'success' },
          { content: 'Run tests', outcome: 'success' },
          { content: 'Run tests', outcome: 'success' }
        ]
      }

      const result = await classifier.classify(thought, context)

      expect(result.scores.novelty).toBeLessThan(0.3)
    })

    it('should detect semantic similarity', async () => {
      const thought = {
        content: 'Execute test suite',
        type: 'command'
      }

      const context = {
        recentThoughts: [
          { content: 'Run unit tests', outcome: 'success' },
          { content: 'Run integration tests', outcome: 'success' }
        ]
      }

      const result = await classifier.classify(thought, context)

      // Should recognize similarity despite different wording
      expect(result.scores.novelty).toBeLessThan(0.5)
    })
  })

  describe('Creativity Assessment', () => {
    it('should score deterministic tasks as low creativity', async () => {
      const thought = {
        content: 'git status',
        type: 'command'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.creativity).toBeLessThan(0.3)
    })

    it('should score open-ended tasks as high creativity', async () => {
      const thought = {
        content: 'Design an elegant API for managing consciousness state transitions',
        type: 'design'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.creativity).toBeGreaterThan(0.7)
    })

    it('should identify creative keywords', async () => {
      const thoughts = [
        { content: 'Design innovative solution', expected: 'high' },
        { content: 'Explore alternative approaches', expected: 'high' },
        { content: 'Copy this file', expected: 'low' }
      ]

      for (const { content, expected } of thoughts) {
        const result = await classifier.classify({ content, type: 'task' }, {})

        if (expected === 'high') {
          expect(result.scores.creativity).toBeGreaterThan(0.5)
        } else {
          expect(result.scores.creativity).toBeLessThan(0.4)
        }
      }
    })
  })

  describe('Uncertainty Measurement', () => {
    it('should score clear tasks as low uncertainty', async () => {
      const thought = {
        content: 'Install package with npm install express',
        type: 'command'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.uncertainty).toBeLessThan(0.4)
    })

    it('should score ambiguous tasks as high uncertainty', async () => {
      const thought = {
        content: 'Fix the thing that is not working properly',
        type: 'bug'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.uncertainty).toBeGreaterThan(0.6)
    })

    it('should detect uncertainty markers', async () => {
      const thought = {
        content: 'Maybe we should possibly try implementing this feature if it makes sense',
        type: 'task'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.uncertainty).toBeGreaterThan(0.5)
    })
  })

  describe('Stakes Assessment', () => {
    it('should score low-impact tasks as low stakes', async () => {
      const thought = {
        content: 'Update README.md',
        type: 'documentation'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.stakes).toBeLessThan(0.4)
    })

    it('should score high-impact tasks as high stakes', async () => {
      const thought = {
        content: 'Implement production authentication system',
        type: 'security'
      }

      const result = await classifier.classify(thought, {})

      expect(result.scores.stakes).toBeGreaterThan(0.7)
    })

    it('should recognize critical keywords', async () => {
      const criticalThoughts = [
        'Modify production database schema',
        'Deploy to production',
        'Implement security authentication'
      ]

      for (const content of criticalThoughts) {
        const result = await classifier.classify({ content, type: 'task' }, {})
        expect(result.scores.stakes).toBeGreaterThan(0.6)
      }
    })
  })

  describe('Tier Determination', () => {
    it('should classify high-scoring thoughts as deep tier', async () => {
      const thought = {
        content: 'Design a novel distributed consensus algorithm',
        type: 'architecture'
      }

      const result = await classifier.classify(thought, {})

      expect(result.tier).toBe('deep')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should classify low-scoring thoughts as rote tier', async () => {
      const thought = {
        content: 'ls -la',
        type: 'command'
      }

      const result = await classifier.classify(thought, {})

      expect(result.tier).toBe('rote')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should use weighted scoring', async () => {
      // Create a thought that scores differently on each dimension
      const thought = {
        content: 'Implement standard CRUD operations',
        type: 'implementation'
      }

      const result = await classifier.classify(thought, {})

      // Verify weighted formula was used
      const weightedScore =
        result.scores.complexity * 0.25 +
        result.scores.novelty * 0.20 +
        result.scores.creativity * 0.25 +
        result.scores.uncertainty * 0.15 +
        result.scores.stakes * 0.15

      expect(Math.abs(result.deepScore - weightedScore)).toBeLessThan(0.01)
    })

    it('should use custom threshold', async () => {
      const customClassifier = new ThoughtClassifier({ threshold: 0.8 })

      const thought = {
        content: 'Moderate complexity task',
        type: 'task'
      }

      const result = await customClassifier.classify(thought, {})

      // With higher threshold, more thoughts should be classified as rote
      expect(result.tier).toBe('rote')
    })
  })

  describe('Confidence Calculation', () => {
    it('should have high confidence for clear decisions', async () => {
      const verySimple = {
        content: 'echo hello',
        type: 'command'
      }

      const result = await classifier.classify(verySimple, {})

      // Should be confidently rote (far from threshold)
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it('should have low confidence for borderline cases', async () => {
      // Engineer a thought to score near threshold (0.6)
      const borderline = {
        content: 'Update the configuration settings',
        type: 'task'
      }

      const result = await classifier.classify(borderline, {})

      // If deepScore is near 0.6, confidence should be lower
      if (Math.abs(result.deepScore - 0.6) < 0.1) {
        expect(result.confidence).toBeLessThan(0.5)
      }
    })
  })

  describe('Reasoning Generation', () => {
    it('should provide clear reasoning for classification', async () => {
      const thought = {
        content: 'Design distributed system architecture',
        type: 'architecture'
      }

      const result = await classifier.classify(thought, {})

      expect(result.reasoning).toBeDefined()
      expect(result.reasoning.length).toBeGreaterThan(20)
      expect(result.reasoning).toMatch(/complexity|novel|creative/i)
    })

    it('should explain tier choice', async () => {
      const thought = {
        content: 'git status',
        type: 'command'
      }

      const result = await classifier.classify(thought, {})

      expect(result.reasoning).toContain(result.tier)
    })
  })

  describe('Learning from Outcomes', () => {
    it('should track classification accuracy', () => {
      const thought = { content: 'test', type: 'task' }
      const classification = {
        tier: 'deep',
        confidence: 0.8
      }
      const outcome = {
        tier: 'deep',  // Actual tier used
        success: true,
        duration: 5000
      }

      classifier.recordOutcome(thought, classification, outcome)

      const stats = classifier.getClassificationStats()

      expect(stats.total).toBe(1)
      expect(stats.correct).toBe(1)
      expect(stats.accuracy).toBe(1.0)
    })

    it('should detect misclassifications', () => {
      const thought = { content: 'test', type: 'task' }
      const classification = {
        tier: 'deep',
        confidence: 0.7
      }
      const outcome = {
        tier: 'rote',  // Actually used rote (override)
        success: true,
        duration: 1000
      }

      classifier.recordOutcome(thought, classification, outcome)

      const stats = classifier.getClassificationStats()

      expect(stats.total).toBe(1)
      expect(stats.correct).toBe(0)
      expect(stats.accuracy).toBe(0.0)
    })

    it('should adapt threshold based on outcomes', () => {
      const initialThreshold = classifier.threshold

      // Record multiple outcomes suggesting threshold is too high
      for (let i = 0; i < 20; i++) {
        classifier.recordOutcome(
          { content: 'task', type: 'task' },
          { tier: 'rote', confidence: 0.7, deepScore: 0.55 },
          { tier: 'deep', success: true, duration: 10000 }  // Should have been deep
        )
      }

      classifier.adaptThreshold()

      // Threshold should decrease
      expect(classifier.threshold).toBeLessThan(initialThreshold)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty thought', async () => {
      const thought = {
        content: '',
        type: 'unknown'
      }

      const result = await classifier.classify(thought, {})

      expect(result).toBeDefined()
      expect(result.tier).toBe('rote')  // Default to rote for empty
    })

    it('should handle missing context', async () => {
      const thought = {
        content: 'Do something',
        type: 'task'
      }

      const result = await classifier.classify(thought, null)

      expect(result).toBeDefined()
    })

    it('should handle special characters', async () => {
      const thought = {
        content: 'Implement $(complex) & |dangerous| > operations',
        type: 'task'
      }

      await expect(
        classifier.classify(thought, {})
      ).resolves.toBeDefined()
    })
  })
})
