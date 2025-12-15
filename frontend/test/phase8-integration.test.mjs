/**
 * Integration Tests for Phase 8: Collaborative Intelligence (T312)
 *
 * Tests the end-to-end integration of Phase 8 features:
 * - Calibration → Feedback → Preference Analysis → Adaptive Recommendations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCalibration,
  getCalibrationStats,
  clearCalibrationHistory,
} from '../server/collaborative/confidence-calibration.mjs';
import {
  submitFeedback,
  getFeedbackStats,
  clearAllFeedback,
} from '../server/collaborative/feedback.mjs';
import {
  analyzeUserPreferences,
  getAdaptiveRecommendation,
  clearUserProfiles,
} from '../server/collaborative/preferences.mjs';

describe('Phase 8 Integration Tests (T312)', () => {
  beforeEach(() => {
    clearCalibrationHistory();
    clearAllFeedback();
    clearUserProfiles();
    process.env.AUTONOMOUS_ENABLE_FEEDBACK = '1';
  });

  describe('Full Collaboration Flow', () => {
    it('should complete full calibration → feedback → preference → adaptive flow', () => {
      // Define option alternatives for recommendations
      const alternatives = [
        { id: 'low', label: 'Safe', description: 'Low risk', pros: [], cons: [], riskLevel: 'low' },
        { id: 'medium', label: 'Balanced', description: 'Medium risk', pros: [], cons: [], riskLevel: 'medium' },
        { id: 'high', label: 'Aggressive', description: 'High risk', pros: [], cons: [], riskLevel: 'high' },
      ];

      // Simulate 10 user decisions with high acceptance rate (90%)
      for (let i = 0; i < 10; i++) {
        const userAccepted = i < 9;
        const recommendedId = 'low';
        const selectedId = userAccepted ? 'low' : 'medium';

        recordCalibration('plan', 0.7, recommendedId, selectedId);
        submitFeedback('decision', {
          rating: userAccepted ? 5 : 3,
          reasoning: i % 2 === 0 ? `Decision ${i + 1} reasoning` : undefined,
        });
      }

      // Analyze user preferences
      const profile = analyzeUserPreferences('test-user-001');

      expect(profile.totalDecisions).toBe(10);
      expect(profile.preferences.length).toBeGreaterThan(0);

      // User accepted 90% → conservative
      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('conservative');
      expect(riskPref.confidence).toBeGreaterThan(0.8);

      // 50% provided reasoning → balanced
      const speedPref = profile.preferences.find((p) => p.category === 'decision_speed');
      expect(speedPref).toBeDefined();
      expect(speedPref.value).toBe('balanced');

      // Get adaptive recommendation
      const recommendation = getAdaptiveRecommendation(alternatives, 'test-user-001');
      expect(recommendation.recommendedId).toBe('low');
      expect(recommendation.confidence).toBeGreaterThan(0.6);
      expect(recommendation.reasoning).toContain('conservative');
      expect(recommendation.userProfile).toBeDefined();

      // Verify calibration stats
      const calibrationStats = getCalibrationStats();
      expect(calibrationStats.sufficient).toBe(true);
      expect(calibrationStats.sampleSize).toBe(10);
      expect(calibrationStats.acceptanceRate).toBe(0.9);

      // Verify feedback stats
      const feedbackStats = getFeedbackStats();
      expect(feedbackStats.total).toBe(10);
      expect(feedbackStats.avgRating).toBeGreaterThan(4);
      expect(feedbackStats.withReasoning).toBe(5);
    });

    it('should handle exploratory user behavior (50% acceptance)', () => {
      const alternatives = [
        { id: 'low', label: 'Low', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'medium', label: 'Med', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
        { id: 'high', label: 'High', description: 'desc', pros: [], cons: [], riskLevel: 'high' },
      ];

      // Simulate 10 decisions with 50% acceptance
      for (let i = 0; i < 10; i++) {
        const selectedId = i % 2 === 0 ? 'low' : 'medium';
        recordCalibration('strategy', 0.65, 'low', selectedId);
        submitFeedback('decision', { rating: 3 + (i % 3) });
      }

      const profile = analyzeUserPreferences('exploratory-user');
      expect(profile.totalDecisions).toBe(10);

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('exploratory');

      const rec = getAdaptiveRecommendation(alternatives, 'exploratory-user');
      expect(['medium', 'high']).toContain(rec.recommendedId);
      expect(rec.reasoning).toContain('exploratory');
    });

    it('should handle aggressive user behavior (20% acceptance)', () => {
      const alternatives = [
        { id: 'low', label: 'Low', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'medium', label: 'Med', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
        { id: 'high', label: 'High', description: 'desc', pros: [], cons: [], riskLevel: 'high' },
      ];

      // Simulate 20 decisions with 20% acceptance
      for (let i = 0; i < 20; i++) {
        const selectedId = i % 5 === 0 ? 'low' : 'high';
        recordCalibration('execution', 0.85, 'low', selectedId);
        submitFeedback('decision', { rating: 3 });
      }

      const profile = analyzeUserPreferences('aggressive-user');
      expect(profile.totalDecisions).toBe(20);

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('aggressive');

      const rec = getAdaptiveRecommendation(alternatives, 'aggressive-user');
      expect(rec.recommendedId).toBe('high');
      expect(rec.reasoning).toContain('aggressive');
    });
  });

  describe('Cross-Module Integration', () => {
    it('should maintain consistency across calibration and feedback', () => {
      // Record multiple calibrations (10 total, 2 accepted, 8 rejected)
      for (let i = 0; i < 10; i++) {
        const selected = i < 2 ? 'opt1' : 'opt2';
        recordCalibration('parameter', 0.75, 'opt1', selected);

        submitFeedback('decision', {
          rating: i < 2 ? 5 : 4,
          reasoning: `Decision ${i + 1} reasoning`,
        });
      }

      // Verify calibration stats show 20% acceptance
      const stats = getCalibrationStats({ type: 'parameter' });
      expect(stats.sufficient).toBe(true);
      expect(stats.acceptanceRate).toBe(0.2); // 20% acceptance

      // Verify feedback was recorded
      const feedbackStats = getFeedbackStats({ category: 'decision' });
      expect(feedbackStats.total).toBe(10);
      expect(feedbackStats.avgRating).toBeGreaterThan(4);
    });

    it('should handle feedback without ratings gracefully', () => {
      // Submit feedback with only reasoning
      const feedback = submitFeedback('system', {
        suggestion: 'Add more detailed explanations',
      });

      expect(feedback.success).toBe(true);

      const stats = getFeedbackStats();
      expect(stats.total).toBe(1);
      expect(stats.withSuggestions).toBe(1);
    });

    it('should adapt recommendations based on accumulated data', () => {
      const alternatives = [
        { id: 'low', label: 'Low', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'high', label: 'High', description: 'desc', pros: [], cons: [], riskLevel: 'high' },
      ];

      // First recommendation with no history
      const rec1 = getAdaptiveRecommendation(alternatives, 'new-user');
      expect(rec1.confidence).toBe(0.5); // Neutral confidence

      // Build up history (conservative)
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.7, 'low', 'low');
      }

      // Second recommendation with history
      const rec2 = getAdaptiveRecommendation(alternatives, 'new-user');
      expect(rec2.recommendedId).toBe('low');
      expect(rec2.confidence).toBeGreaterThan(0.6);
      expect(rec2.reasoning).toContain('conservative');
    });
  });
});
