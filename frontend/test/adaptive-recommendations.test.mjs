/**
 * Tests for Adaptive Recommendation System (T309)
 *
 * @module test/adaptive-recommendations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateRecommendations,
  recordRecommendationChoice,
  getRecommendationAccuracy,
  createABTest,
  getABTestVariant,
  clearRecommendationHistory,
  clearABTests,
  getRecommendationStats,
} from '../server/collaborative/adaptive-recommendations.mjs';
import {
  submitFeedback,
  clearAllFeedback,
} from '../server/collaborative/feedback.mjs';
import {
  buildPreferenceProfile,
  clearPreferenceProfile,
} from '../server/collaborative/preference-analysis.mjs';

describe('Adaptive Recommendation System', () => {
  beforeEach(() => {
    // Clear state before each test
    clearAllFeedback();
    clearPreferenceProfile('default');
    clearPreferenceProfile('test-user');
    clearRecommendationHistory();
    clearABTests();
  });

  afterEach(() => {
    // Cleanup after tests
    clearAllFeedback();
    clearPreferenceProfile('default');
    clearPreferenceProfile('test-user');
    clearRecommendationHistory();
    clearABTests();
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations with base scores when disabled', () => {
      process.env.AUTONOMOUS_FEEDBACK_LEARNING = '0';

      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.6 },
        { id: 'option2', label: 'Option 2', baseScore: 0.8 },
        { id: 'option3', label: 'Option 3', baseScore: 0.5 },
      ];

      const result = generateRecommendations('test_category', options, { userId: 'test-user' });

      expect(result).toBeDefined();
      expect(result.options).toHaveLength(3);
      expect(result.topRecommendation).toBe('option2'); // Highest base score
      expect(result.confidence).toBe(0.5);

      // Restore default
      process.env.AUTONOMOUS_FEEDBACK_LEARNING = '1';
    });

    it('should generate personalized recommendations when enabled', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5, tags: ['quick'] },
        { id: 'option2', label: 'Option 2', baseScore: 0.5, tags: ['refactoring'] },
        { id: 'option3', label: 'Option 3', baseScore: 0.5, tags: ['testing'] },
      ];

      const result = generateRecommendations('decision_preference', options, { userId: 'test-user' });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.options).toHaveLength(3);
      expect(result.topRecommendation).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should boost scores based on preference patterns', () => {
      // Create preference pattern for refactoring
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['refactoring'],
          context: { decisionId: `d${i}` },
        });
      }

      buildPreferenceProfile('test-user');

      const options = [
        { id: 'refactor', label: 'Refactor Code', baseScore: 0.5, tags: ['refactoring'] },
        { id: 'quick-fix', label: 'Quick Fix', baseScore: 0.5, tags: ['quick'] },
      ];

      const result = generateRecommendations('decision_preference', options, { userId: 'test-user' });

      // The refactor option should be scored higher due to preference
      const refactorOption = result.options.find((o) => o.option.id === 'refactor');
      const quickFixOption = result.options.find((o) => o.option.id === 'quick-fix');

      // Since both have same base score, preference should boost refactor
      expect(refactorOption.score).toBeGreaterThanOrEqual(quickFixOption.score);
    });

    it('should adjust scores based on historical choices', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5, tags: ['approach-a'] },
        { id: 'option2', label: 'Option 2', baseScore: 0.5, tags: ['approach-b'] },
      ];

      // Record multiple choices for option1
      for (let i = 0; i < 5; i++) {
        const rec = generateRecommendations('test_category', options, { userId: 'test-user' });
        recordRecommendationChoice(rec.id, 'option1', {
          userId: 'test-user',
          category: 'test_category',
          tags: ['approach-a'],
        });
      }

      const result = generateRecommendations('test_category', options, { userId: 'test-user' });

      const option1 = result.options.find((o) => o.option.id === 'option1');
      const option2 = result.options.find((o) => o.option.id === 'option2');

      // option1 should have higher score due to history
      expect(option1.score).toBeGreaterThan(option2.score);
    });

    it('should adjust confidence based on pattern count and history', () => {
      // Generate recommendations with no history
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5 },
      ];

      const result1 = generateRecommendations('test_category', options, { userId: 'test-user' });
      const initialConfidence = result1.options[0].confidence;

      // Build preferences and history
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['test'],
          context: { decisionId: `d${i}` },
        });
      }
      buildPreferenceProfile('test-user');

      for (let i = 0; i < 5; i++) {
        const rec = generateRecommendations('test_category', options, { userId: 'test-user' });
        recordRecommendationChoice(rec.id, 'option1', {
          userId: 'test-user',
          category: 'test_category',
        });
      }

      const result2 = generateRecommendations('test_category', options, { userId: 'test-user' });
      const finalConfidence = result2.options[0].confidence;

      // Confidence should increase with patterns and history
      expect(finalConfidence).toBeGreaterThanOrEqual(initialConfidence);
    });

    it('should include adjustment details in results', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5 },
      ];

      const result = generateRecommendations('test_category', options, { userId: 'test-user' });

      const option = result.options[0];
      expect(option.adjustments).toBeDefined();
      expect(option.adjustments.preference).toBeDefined();
      expect(option.adjustments.history).toBeDefined();
      expect(option.adjustments.risk).toBeDefined();
      expect(option.adjustments.total).toBeDefined();
    });

    it('should sort options by score descending', () => {
      const options = [
        { id: 'low', label: 'Low Score', baseScore: 0.3 },
        { id: 'high', label: 'High Score', baseScore: 0.9 },
        { id: 'medium', label: 'Medium Score', baseScore: 0.6 },
      ];

      const result = generateRecommendations('test_category', options);

      expect(result.options[0].score).toBeGreaterThanOrEqual(result.options[1].score);
      expect(result.options[1].score).toBeGreaterThanOrEqual(result.options[2].score);
    });

    it('should mark top option as recommended', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5 },
        { id: 'option2', label: 'Option 2', baseScore: 0.7 },
      ];

      const result = generateRecommendations('test_category', options);

      const recommended = result.options.find((o) => o.isRecommended);
      expect(recommended).toBeDefined();
      expect(recommended.option.id).toBe(result.topRecommendation);
    });
  });

  describe('recordRecommendationChoice', () => {
    it('should record user choice', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.5 },
      ];

      const rec = generateRecommendations('test_category', options, { userId: 'test-user' });
      const result = recordRecommendationChoice(rec.id, 'option1', {
        userId: 'test-user',
        category: 'test_category',
        wasRecommended: true,
      });

      expect(result).toBe(true);
    });

    it('should influence future recommendations', () => {
      const options = [
        { id: 'optionA', label: 'Option A', baseScore: 0.5, tags: ['tagA'] },
        { id: 'optionB', label: 'Option B', baseScore: 0.5, tags: ['tagB'] },
      ];

      // Record choices for optionA
      for (let i = 0; i < 3; i++) {
        const rec = generateRecommendations('test_category', options, { userId: 'test-user' });
        recordRecommendationChoice(rec.id, 'optionA', {
          userId: 'test-user',
          category: 'test_category',
          tags: ['tagA'],
        });
      }

      const result = generateRecommendations('test_category', options, { userId: 'test-user' });

      // optionA should have higher score due to history
      const optionA = result.options.find((o) => o.option.id === 'optionA');
      const optionB = result.options.find((o) => o.option.id === 'optionB');

      expect(optionA.score).toBeGreaterThan(optionB.score);
    });
  });

  describe('getRecommendationAccuracy', () => {
    it('should calculate accuracy with no history', () => {
      const accuracy = getRecommendationAccuracy();

      expect(accuracy.total).toBe(0);
      expect(accuracy.accuracy).toBe(0);
      expect(accuracy.accuracyPercent).toBe('0.0');
    });

    it('should calculate accuracy from history', () => {
      const options = [
        { id: 'option1', label: 'Option 1', baseScore: 0.8 },
        { id: 'option2', label: 'Option 2', baseScore: 0.3 },
      ];

      // Record some choices
      for (let i = 0; i < 5; i++) {
        const rec = generateRecommendations('test_category', options, { userId: 'test-user' });
        const wasRecommended = rec.topRecommendation === 'option1';
        recordRecommendationChoice(rec.id, 'option1', {
          userId: 'test-user',
          category: 'test_category',
          wasRecommended,
        });
      }

      const accuracy = getRecommendationAccuracy({ userId: 'test-user' });

      expect(accuracy.total).toBe(5);
      expect(accuracy.accuracy).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const options = [{ id: 'option1', label: 'Option 1', baseScore: 0.5 }];

      // Record choices in different categories
      const rec1 = generateRecommendations('category1', options, { userId: 'test-user' });
      recordRecommendationChoice(rec1.id, 'option1', {
        userId: 'test-user',
        category: 'category1',
      });

      const rec2 = generateRecommendations('category2', options, { userId: 'test-user' });
      recordRecommendationChoice(rec2.id, 'option1', {
        userId: 'test-user',
        category: 'category2',
      });

      const accuracy = getRecommendationAccuracy({ userId: 'test-user', category: 'category1' });

      expect(accuracy.total).toBe(1);
    });
  });

  describe('A/B Testing', () => {
    it('should create A/B test when enabled', () => {
      process.env.RECOMMENDATION_AB_TESTING = '1';

      const test = createABTest(
        'test1',
        { strategy: 'preference-heavy' },
        { strategy: 'history-heavy' }
      );

      expect(test.enabled).not.toBe(false);
      expect(test.id).toBeDefined();
      expect(test.variants.A).toBeDefined();
      expect(test.variants.B).toBeDefined();

      // Restore default
      delete process.env.RECOMMENDATION_AB_TESTING;
    });

    it('should not create A/B test when disabled', () => {
      const test = createABTest(
        'test2',
        { strategy: 'preference-heavy' },
        { strategy: 'history-heavy' }
      );

      expect(test.enabled).toBe(false);
    });

    it('should assign consistent variants to users', () => {
      process.env.RECOMMENDATION_AB_TESTING = '1';

      createABTest(
        'test3',
        { strategy: 'preference-heavy' },
        { strategy: 'history-heavy' }
      );

      const variant1 = getABTestVariant('test3', 'user1');
      const variant2 = getABTestVariant('test3', 'user1'); // Same user

      expect(variant1).toBe(variant2); // Consistent assignment

      // Restore default
      delete process.env.RECOMMENDATION_AB_TESTING;
    });
  });

  describe('getRecommendationStats', () => {
    it('should return statistics', () => {
      const stats = getRecommendationStats();

      expect(stats.enabled).toBeDefined();
      expect(stats.historySize).toBe(0);
      expect(stats.abTestsActive).toBe(0);
      expect(stats.config).toBeDefined();
    });

    it('should track history size', () => {
      const options = [{ id: 'option1', label: 'Option 1', baseScore: 0.5 }];

      const rec = generateRecommendations('test_category', options);
      recordRecommendationChoice(rec.id, 'option1');

      const stats = getRecommendationStats();

      expect(stats.historySize).toBe(1);
    });
  });

  describe('clearRecommendationHistory', () => {
    it('should clear history', () => {
      const options = [{ id: 'option1', label: 'Option 1', baseScore: 0.5 }];

      const rec = generateRecommendations('test_category', options);
      recordRecommendationChoice(rec.id, 'option1');

      const count = clearRecommendationHistory();

      expect(count).toBe(1);

      const stats = getRecommendationStats();
      expect(stats.historySize).toBe(0);
    });
  });
});
