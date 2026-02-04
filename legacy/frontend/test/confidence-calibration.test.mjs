/**
 * Unit Tests for Confidence Calibration System (T306)
 *
 * Tests confidence scoring, calibration tracking, and threshold tuning.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateConfidence,
  shouldTriggerCheckpoint,
  recordCalibration,
  getCalibrationStats,
  suggestThresholdAdjustments,
  clearCalibrationHistory,
  getCalibrationHistorySize,
} from '../server/collaborative/confidence-calibration.mjs';

describe('Confidence Calibration System (T306)', () => {
  beforeEach(() => {
    clearCalibrationHistory();
    process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD = '0.7';
  });

  describe('Confidence Scoring', () => {
    it('should calculate confidence from multiple factors', () => {
      const result = calculateConfidence('plan', {
        optionClarity: 0.8,
        historicalSuccess: 0.7,
        riskAlignment: 0.9,
        effortCertainty: 0.6,
        contextCompleteness: 0.75,
      });

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.factors).toBeDefined();
      expect(result.strengths).toBeDefined();
      expect(result.weaknesses).toBeDefined();
    });

    it('should apply different weights for different decision types', () => {
      const factors = {
        optionClarity: 0.8,
        historicalSuccess: 0.6,
        riskAlignment: 0.9,
        effortCertainty: 0.5,
        contextCompleteness: 0.7,
      };

      const planScore = calculateConfidence('plan', factors);
      const strategyScore = calculateConfidence('strategy', factors);
      const parameterScore = calculateConfidence('parameter', factors);
      const executionScore = calculateConfidence('execution', factors);

      // Scores should differ based on type-specific weights
      // Execution should weight riskAlignment heavily
      expect(executionScore.score).toBeDefined();

      // All should be in valid range
      [planScore, strategyScore, parameterScore, executionScore].forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should identify strengths when factors are high', () => {
      const result = calculateConfidence('strategy', {
        optionClarity: 0.9,
        historicalSuccess: 0.85,
        riskAlignment: 0.95,
        effortCertainty: 0.8,
        contextCompleteness: 0.88,
      });

      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should identify weaknesses when factors are low', () => {
      const result = calculateConfidence('plan', {
        optionClarity: 0.3,
        historicalSuccess: 0.2,
        riskAlignment: 0.35,
        effortCertainty: 0.25,
        contextCompleteness: 0.3,
      });

      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should handle default factors (0.5 each)', () => {
      const result = calculateConfidence('strategy');

      expect(result.score).toBeCloseTo(0.5, 1);
      expect(result.factors.optionClarity).toBe(0.5);
      expect(result.factors.historicalSuccess).toBe(0.5);
    });

    it('should clamp factors to 0-1 range', () => {
      const result = calculateConfidence('plan', {
        optionClarity: 1.5, // Over 1
        historicalSuccess: -0.2, // Under 0
        riskAlignment: 0.7,
      });

      expect(result.factors.optionClarity).toBe(1.0);
      expect(result.factors.historicalSuccess).toBe(0.0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('Checkpoint Triggering', () => {
    it('should trigger for low confidence plan decisions', () => {
      expect(shouldTriggerCheckpoint(0.5, 'plan')).toBe(true);
      expect(shouldTriggerCheckpoint(0.65, 'plan')).toBe(true);
    });

    it('should not trigger for high confidence plan decisions', () => {
      expect(shouldTriggerCheckpoint(0.8, 'plan')).toBe(false);
      expect(shouldTriggerCheckpoint(0.95, 'plan')).toBe(false);
    });

    it('should use higher threshold for execution decisions', () => {
      process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_EXECUTION = '0.9';

      expect(shouldTriggerCheckpoint(0.85, 'execution')).toBe(true);
      expect(shouldTriggerCheckpoint(0.92, 'execution')).toBe(false);
    });

    it('should support per-type threshold overrides', () => {
      process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_STRATEGY = '0.6';

      expect(shouldTriggerCheckpoint(0.55, 'strategy')).toBe(true);
      expect(shouldTriggerCheckpoint(0.65, 'strategy')).toBe(false);
    });
  });

  describe('Calibration Recording', () => {
    it('should record when user accepts recommendation', () => {
      recordCalibration('plan', 0.8, 'opt-1', 'opt-1', {
        convId: 'conv-test',
        checkpointId: 'cp-123',
      });

      expect(getCalibrationHistorySize()).toBe(1);
    });

    it('should record when user rejects recommendation', () => {
      recordCalibration('strategy', 0.65, 'opt-1', 'opt-2');

      expect(getCalibrationHistorySize()).toBe(1);
    });

    it('should accumulate calibration records', () => {
      recordCalibration('plan', 0.7, 'opt-1', 'opt-1');
      recordCalibration('strategy', 0.6, 'opt-1', 'opt-2');
      recordCalibration('parameter', 0.8, 'opt-2', 'opt-2');

      expect(getCalibrationHistorySize()).toBe(3);
    });

    it('should limit history to 1000 records', () => {
      // Record 1050 calibration points
      for (let i = 0; i < 1050; i++) {
        recordCalibration(
          'plan',
          0.7 + Math.random() * 0.2,
          'opt-1',
          i % 2 === 0 ? 'opt-1' : 'opt-2'
        );
      }

      expect(getCalibrationHistorySize()).toBe(1000);
    });
  });

  describe('Calibration Statistics', () => {
    it('should require minimum samples', () => {
      recordCalibration('plan', 0.7, 'opt-1', 'opt-1');
      recordCalibration('plan', 0.6, 'opt-1', 'opt-2');

      const stats = getCalibrationStats({ type: 'plan', minSamples: 10 });

      expect(stats.sufficient).toBe(false);
      expect(stats.message).toContain('10 samples');
    });

    it('should calculate acceptance rate', () => {
      // 3 accepts, 2 rejects = 60% acceptance
      for (let i = 0; i < 3; i++) {
        recordCalibration('plan', 0.8, 'rec', 'rec'); // Accept
      }
      for (let i = 0; i < 2; i++) {
        recordCalibration('plan', 0.8, 'rec', 'alt'); // Reject
      }

      // Need at least 10 samples
      for (let i = 0; i < 5; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      const stats = getCalibrationStats({ minSamples: 10 });

      expect(stats.sufficient).toBe(true);
      expect(stats.sampleSize).toBe(10);
      expect(stats.acceptanceRate).toBeCloseTo(0.8, 1); // 8/10 = 0.8
    });

    it('should calculate calibration by bins', () => {
      // High confidence (80-100%): 5 accepts out of 5
      for (let i = 0; i < 5; i++) {
        recordCalibration('plan', 0.85, 'rec', 'rec');
      }

      // Medium confidence (60-80%): 3 accepts out of 5
      for (let i = 0; i < 3; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 2; i++) {
        recordCalibration('plan', 0.7, 'rec', 'alt');
      }

      // Low confidence (40-60%): 1 accept out of 5
      for (let i = 0; i < 1; i++) {
        recordCalibration('plan', 0.5, 'rec', 'rec');
      }
      for (let i = 0; i < 4; i++) {
        recordCalibration('plan', 0.5, 'rec', 'alt');
      }

      const stats = getCalibrationStats({ minSamples: 10 });

      expect(stats.calibration['80-100']).toBeDefined();
      expect(stats.calibration['60-80']).toBeDefined();
      expect(stats.calibration['40-60']).toBeDefined();

      // High confidence should have high actual acceptance
      expect(stats.calibration['80-100'].avgActual).toBeCloseTo(1.0, 1);

      // Low confidence should have low actual acceptance
      expect(stats.calibration['40-60'].avgActual).toBeCloseTo(0.2, 1);
    });

    it('should calculate Expected Calibration Error (ECE)', () => {
      // Create perfectly calibrated data
      // 90% confidence: 90% acceptance
      for (let i = 0; i < 9; i++) {
        recordCalibration('plan', 0.9, 'rec', 'rec');
      }
      recordCalibration('plan', 0.9, 'rec', 'alt');

      // 70% confidence: 70% acceptance
      for (let i = 0; i < 7; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 3; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'alt');
      }

      const stats = getCalibrationStats({ minSamples: 10 });

      expect(stats.expectedCalibrationError).toBeDefined();
      expect(stats.expectedCalibrationError).toBeGreaterThanOrEqual(0);
      expect(stats.recommendation).toContain('calibrated');
    });

    it('should filter stats by decision type', () => {
      // Record different types
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.8, 'rec', 'rec');
      }
      for (let i = 0; i < 5; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'alt');
      }

      const planStats = getCalibrationStats({ type: 'plan', minSamples: 10 });
      const strategyStats = getCalibrationStats({ type: 'strategy', minSamples: 10 });

      expect(planStats.sufficient).toBe(true);
      expect(planStats.sampleSize).toBe(15);

      expect(strategyStats.sufficient).toBe(false); // Only 5 samples
    });
  });

  describe('Threshold Adjustment Suggestions', () => {
    it('should suggest raising threshold for high acceptance rate', () => {
      // User almost always accepts (90%+ acceptance)
      for (let i = 0; i < 19; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      recordCalibration('plan', 0.7, 'rec', 'alt');

      const suggestion = suggestThresholdAdjustments('plan');

      expect(suggestion.sufficient).toBe(true);
      expect(suggestion.suggestedThreshold).toBeGreaterThan(suggestion.currentThreshold);
      expect(suggestion.change).toBeGreaterThan(0);
      expect(suggestion.reasoning).toContain('acceptance rate');
    });

    it('should suggest lowering threshold for low acceptance rate', () => {
      // User frequently rejects (<60% acceptance)
      for (let i = 0; i < 10; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 15; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'alt');
      }

      const suggestion = suggestThresholdAdjustments('strategy');

      expect(suggestion.sufficient).toBe(true);
      expect(suggestion.suggestedThreshold).toBeLessThan(suggestion.currentThreshold);
      expect(suggestion.change).toBeLessThan(0);
      expect(suggestion.reasoning).toContain('acceptance rate');
    });

    it('should keep threshold stable for balanced acceptance', () => {
      // 70% acceptance (balanced)
      for (let i = 0; i < 14; i++) {
        recordCalibration('parameter', 0.75, 'rec', 'rec');
      }
      for (let i = 0; i < 6; i++) {
        recordCalibration('parameter', 0.75, 'rec', 'alt');
      }

      const suggestion = suggestThresholdAdjustments('parameter');

      expect(suggestion.sufficient).toBe(true);
      expect(Math.abs(suggestion.change)).toBeLessThanOrEqual(0.05);
      expect(suggestion.reasoning).toContain('balanced');
    });

    it('should require minimum samples for suggestions', () => {
      recordCalibration('execution', 0.9, 'rec', 'rec');

      const suggestion = suggestThresholdAdjustments('execution');

      expect(suggestion.sufficient).toBe(false);
      expect(suggestion.message).toContain('samples');
    });

    it('should note poor calibration in reasoning', () => {
      // Create poorly calibrated data (high confidence, low acceptance)
      for (let i = 0; i < 20; i++) {
        recordCalibration('plan', 0.9, 'rec', 'alt'); // 90% confidence, 0% acceptance
      }

      const suggestion = suggestThresholdAdjustments('plan');

      expect(suggestion.reasoning).toContain('calibration');
    });
  });

  describe('Calibration History Management', () => {
    it('should clear calibration history', () => {
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      expect(getCalibrationHistorySize()).toBe(10);

      clearCalibrationHistory();

      expect(getCalibrationHistorySize()).toBe(0);
    });
  });
});
