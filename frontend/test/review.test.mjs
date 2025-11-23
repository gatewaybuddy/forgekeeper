/**
 * Integration tests for self-review mode (T212)
 *
 * @module test/review
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractQualityScore,
  extractCritique,
  buildHarmonyReviewPrompt,
  buildOpenAIReviewPrompt,
  buildRegenerationPrompt,
  getReviewConfig,
  shouldTriggerReview,
} from '../config/review_prompts.mjs';

describe('Self-Review Integration Tests (T212)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Review Score Extraction', () => {
    it('should extract score from standard format', () => {
      const text = 'Quality score: 0.85\nThis is good.';
      const score = extractQualityScore(text);

      expect(score).not.toBeNull();
      expect(score).toBeGreaterThanOrEqual(0.8);
      expect(score).toBeLessThanOrEqual(0.9);
    });

    it('should extract score from alternative format', () => {
      const text = 'Score: 0.7\nNeeds improvement.';
      const score = extractQualityScore(text);

      expect(score).not.toBeNull();
      expect(score).toBeGreaterThanOrEqual(0.6);
      expect(score).toBeLessThanOrEqual(0.8);
    });

    it('should return null for missing score', () => {
      const text = 'This looks great!';
      const score = extractQualityScore(text);

      expect(score).toBeNull();
    });

    it('should handle edge values (0.0 and 1.0)', () => {
      const text1 = 'Quality score: 0.0';
      const score1 = extractQualityScore(text1);
      expect(score1).toBe(0.0);

      const text2 = 'Quality score: 1.0';
      const score2 = extractQualityScore(text2);
      expect(score2).toBe(1.0);
    });
  });

  describe('Critique Extraction', () => {
    it('should extract critique from review text', () => {
      const text = 'Quality score: 0.65\n\nCritique: Missing error handling.';
      const critique = extractCritique(text);

      expect(critique).toBeTruthy();
      expect(critique).toContain('Missing error handling');
    });

    it('should handle missing critique', () => {
      const text = 'Quality score: 0.85';
      const critique = extractCritique(text);

      // Should return either null, empty string, or the full text
      expect(typeof critique === 'string' || critique === null).toBe(true);
    });
  });

  describe('Review Prompt Building', () => {
    it('should build Harmony review prompt', () => {
      const question = 'How does Docker work?';
      const response = 'Docker is a containerization platform...';
      const messages = buildHarmonyReviewPrompt(question, response);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain(question);
      expect(messages[1].content).toContain(response);
    });

    it('should build OpenAI review prompt', () => {
      const question = 'Explain microservices';
      const response = 'Microservices are an architectural pattern...';
      const messages = buildOpenAIReviewPrompt(question, response);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should include custom review questions when provided', () => {
      const custom = ['Is this accurate?', 'Is this complete?'];
      const messages = buildHarmonyReviewPrompt('Q', 'A', custom);

      const userContent = messages.find(m => m.role === 'user')?.content;
      expect(userContent).toContain('Is this accurate?');
      expect(userContent).toContain('Is this complete?');
    });
  });

  describe('Regeneration Prompt Building', () => {
    it('should build regeneration prompt with critique', () => {
      const original = [
        { role: 'user', content: 'Explain Docker' }
      ];
      const critique = 'Missing container details';
      const score = 0.65;

      const messages = buildRegenerationPrompt(original, critique, score);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(original.length);

      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.content).toContain('0.65');
      expect(lastMsg.content).toContain('Missing container details');
    });
  });

  describe('Review Configuration', () => {
    it('should return review config with defaults', () => {
      const config = getReviewConfig();

      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.threshold).toBe('number');
      expect(typeof config.iterations).toBe('number');
      expect(typeof config.mode).toBe('string');
    });

    it('should respect environment overrides', () => {
      process.env.FRONTEND_ENABLE_REVIEW = '1';
      process.env.FRONTEND_REVIEW_THRESHOLD = '0.8';

      const config = getReviewConfig();

      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(0.8);
    });
  });

  describe('Trigger Detection', () => {
    it('should detect when review should trigger (manual mode)', () => {
      const context = { question: 'Test' };
      const result = shouldTriggerReview('manual', context);

      expect(typeof result).toBe('boolean');
    });

    it('should always trigger in always mode', () => {
      const context = {};
      const result = shouldTriggerReview('always', context);

      expect(result).toBe(true);
    });

    it('should never trigger in never mode', () => {
      const context = {};
      const result = shouldTriggerReview('never', context);

      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs gracefully', () => {
      expect(extractQualityScore(null)).toBeNull();
      expect(extractQualityScore(undefined)).toBeNull();

      const critiqueNull = extractCritique(null);
      const critiqueUndef = extractCritique(undefined);

      expect(critiqueNull === null || critiqueNull === '').toBe(true);
      expect(critiqueUndef === null || critiqueUndef === '').toBe(true);
    });

    it('should handle empty strings', () => {
      expect(extractQualityScore('')).toBeNull();

      const critique = extractCritique('');
      expect(critique === null || critique === '').toBe(true);
    });

    it('should handle malformed score text', () => {
      const text = 'Quality score: abc';
      const score = extractQualityScore(text);

      expect(score).toBeNull();
    });

    it('should clamp scores to valid range', () => {
      // Out of range values should either be rejected or clamped
      const text1 = 'Quality score: 1.5';
      const score1 = extractQualityScore(text1);

      if (score1 !== null) {
        expect(score1).toBeLessThanOrEqual(1.0);
      }

      const text2 = 'Quality score: -0.5';
      const score2 = extractQualityScore(text2);

      if (score2 !== null) {
        expect(score2).toBeGreaterThanOrEqual(0.0);
      }
    });
  });
});
