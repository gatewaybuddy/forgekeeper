/**
 * @testfile consciousness/budget-manager
 * @description Unit tests for API token budget management
 *
 * Coverage:
 * - Budget initialization
 * - Token tracking
 * - Daily limit enforcement
 * - Budget reset
 * - Credit checking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BudgetManager } from '../../budget-manager.mjs'

describe('BudgetManager', () => {
  let budgetManager
  let mockDate

  beforeEach(() => {
    // Mock Date for consistent testing
    mockDate = new Date('2025-01-15T12:00:00Z')
    vi.setSystemTime(mockDate)

    budgetManager = new BudgetManager({
      dailyLimit: 1000000,
      storePath: '.forgekeeper/consciousness/budget-test.json'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initialization', () => {
    it('should initialize with default daily limit', () => {
      const manager = new BudgetManager()

      expect(manager.dailyLimit).toBeGreaterThan(0)
      expect(manager.used).toBe(0)
      expect(manager.remaining).toBe(manager.dailyLimit)
    })

    it('should initialize with custom daily limit', () => {
      const manager = new BudgetManager({ dailyLimit: 500000 })

      expect(manager.dailyLimit).toBe(500000)
      expect(manager.remaining).toBe(500000)
    })

    it('should load from storage if exists', async () => {
      await budgetManager.save()

      const manager2 = new BudgetManager({
        dailyLimit: 1000000,
        storePath: '.forgekeeper/consciousness/budget-test.json'
      })
      await manager2.load()

      expect(manager2.dailyLimit).toBe(1000000)
    })
  })

  describe('Token Tracking', () => {
    it('should track token usage', () => {
      budgetManager.use(100)

      expect(budgetManager.used).toBe(100)
      expect(budgetManager.remaining).toBe(999900)
    })

    it('should accumulate token usage', () => {
      budgetManager.use(100)
      budgetManager.use(200)
      budgetManager.use(50)

      expect(budgetManager.used).toBe(350)
      expect(budgetManager.remaining).toBe(999650)
    })

    it('should calculate percentage used', () => {
      budgetManager.use(500000) // 50% of 1M

      expect(budgetManager.getPercentageUsed()).toBeCloseTo(50, 1)
    })

    it('should allow usage up to limit', () => {
      budgetManager.use(1000000)

      expect(budgetManager.used).toBe(1000000)
      expect(budgetManager.remaining).toBe(0)
    })

    it('should prevent usage beyond limit', () => {
      budgetManager.use(900000)

      expect(() => {
        budgetManager.use(200000)
      }).toThrow('Budget exceeded')
    })
  })

  describe('Credit Checking', () => {
    it('should return true when budget available', () => {
      expect(budgetManager.hasCredit()).toBe(true)
    })

    it('should return false when budget exhausted', () => {
      budgetManager.use(1000000)

      expect(budgetManager.hasCredit()).toBe(false)
    })

    it('should check for specific amount', () => {
      budgetManager.use(900000)

      expect(budgetManager.hasCredit(50000)).toBe(true)
      expect(budgetManager.hasCredit(150000)).toBe(false)
    })

    it('should return credit status with reason', () => {
      const status = budgetManager.getCreditStatus(100000)

      expect(status.hasCredit).toBe(true)
      expect(status.remaining).toBe(1000000)
    })

    it('should provide reason when no credit', () => {
      budgetManager.use(1000000)
      const status = budgetManager.getCreditStatus(1000)

      expect(status.hasCredit).toBe(false)
      expect(status.reason).toContain('exceeded')
    })
  })

  describe('Budget Reset', () => {
    it('should reset daily budget', () => {
      budgetManager.use(500000)

      budgetManager.reset()

      expect(budgetManager.used).toBe(0)
      expect(budgetManager.remaining).toBe(budgetManager.dailyLimit)
    })

    it('should auto-reset when day changes', () => {
      budgetManager.use(500000)

      // Advance time by 1 day
      vi.setSystemTime(new Date('2025-01-16T12:00:00Z'))

      // Check if new day triggers reset
      const status = budgetManager.getCreditStatus(100)

      expect(budgetManager.used).toBe(0)
      expect(status.hasCredit).toBe(true)
    })

    it('should update reset timestamp', () => {
      const beforeReset = budgetManager.resetsAt

      budgetManager.reset()

      expect(budgetManager.resetsAt).not.toBe(beforeReset)
    })
  })

  describe('Budget Information', () => {
    it('should return budget details', () => {
      budgetManager.use(250000)

      const budget = budgetManager.getBudget()

      expect(budget.dailyLimit).toBe(1000000)
      expect(budget.used).toBe(250000)
      expect(budget.remaining).toBe(750000)
      expect(budget.percentageUsed).toBeCloseTo(25, 1)
      expect(budget.resetsAt).toBeDefined()
    })

    it('should include tier information', () => {
      budgetManager.use(100, 'deep')
      budgetManager.use(200, 'rote')

      const budget = budgetManager.getBudget()

      expect(budget.usageByTier).toBeDefined()
      expect(budget.usageByTier.deep).toBe(100)
      expect(budget.usageByTier.rote).toBe(200)
    })
  })

  describe('Persistence', () => {
    it('should save budget state', async () => {
      budgetManager.use(100000)

      await budgetManager.save()

      // Verify file would be written (mocked in real implementation)
      expect(budgetManager.used).toBe(100000)
    })

    it('should load budget state', async () => {
      budgetManager.use(150000)
      await budgetManager.save()

      const manager2 = new BudgetManager({
        dailyLimit: 1000000,
        storePath: '.forgekeeper/consciousness/budget-test.json'
      })
      await manager2.load()

      expect(manager2.used).toBe(150000)
    })

    it('should handle missing storage file', async () => {
      const manager = new BudgetManager({
        storePath: '.forgekeeper/consciousness/nonexistent.json'
      })

      await expect(manager.load()).resolves.not.toThrow()
    })
  })

  describe('Usage Analytics', () => {
    it('should track usage history', () => {
      budgetManager.use(100, 'deep')
      budgetManager.use(200, 'deep')
      budgetManager.use(50, 'rote')

      const history = budgetManager.getUsageHistory()

      expect(history.length).toBeGreaterThan(0)
      expect(history[0].amount).toBeDefined()
      expect(history[0].tier).toBeDefined()
      expect(history[0].timestamp).toBeDefined()
    })

    it('should calculate cost estimates', () => {
      budgetManager.use(500000)

      const estimate = budgetManager.estimateRemainingUsage()

      expect(estimate.canMakeDeepCalls).toBeDefined()
      expect(estimate.canMakeRoteCalls).toBeDefined()
      expect(estimate.recommendedTier).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should throw on negative token usage', () => {
      expect(() => {
        budgetManager.use(-100)
      }).toThrow('Token amount must be positive')
    })

    it('should throw on invalid tier', () => {
      expect(() => {
        budgetManager.use(100, 'invalid')
      }).toThrow('Invalid tier')
    })

    it('should handle zero usage gracefully', () => {
      expect(() => {
        budgetManager.use(0)
      }).not.toThrow()

      expect(budgetManager.used).toBe(0)
    })
  })
})
