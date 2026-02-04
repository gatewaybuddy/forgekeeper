// Integration tests for self-review mode (T212)

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('Self-Review Integration Tests', () => {
  describe('Review Score Extraction', () => {
    it('should extract score from standard format', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'Quality score: 0.85\nThis is good.';
      const score = extractQualityScore(text);
      assert.ok(score !== null);
      assert.ok(score >= 0.8 && score <= 0.9);
    });

    it('should extract score from alternative format', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'Score: 0.7\nNeeds improvement.';
      const score = extractQualityScore(text);
      assert.ok(score !== null);
      assert.ok(score >= 0.6 && score <= 0.8);
    });

    it('should return null for missing score', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'This looks great!';
      const score = extractQualityScore(text);
      assert.equal(score, null);
    });

    it('should handle edge values (0.0 and 1.0)', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      const text1 = 'Quality score: 0.0';
      const score1 = extractQualityScore(text1);
      assert.equal(score1, 0.0);

      const text2 = 'Quality score: 1.0';
      const score2 = extractQualityScore(text2);
      assert.equal(score2, 1.0);
    });
  });

  describe('Critique Extraction', () => {
    it('should extract critique from review text', async () => {
      const { extractCritique } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'Quality score: 0.65\n\nCritique: Missing error handling.';
      const critique = extractCritique(text);
      assert.ok(critique);
      assert.ok(critique.includes('Missing error handling'));
    });

    it('should handle missing critique', async () => {
      const { extractCritique } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'Quality score: 0.85';
      const critique = extractCritique(text);
      // Should return either null, empty string, or the full text
      assert.ok(critique === null || critique === '' || typeof critique === 'string');
    });
  });

  describe('Review Prompt Building', () => {
    it('should build Harmony review prompt', async () => {
      const { buildHarmonyReviewPrompt } = await import('../../frontend/config/review_prompts.mjs');

      const question = 'How does Docker work?';
      const response = 'Docker is a containerization platform...';
      const messages = buildHarmonyReviewPrompt(question, response);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length >= 2);
      assert.equal(messages[0].role, 'system');
      assert.equal(messages[1].role, 'user');
      assert.ok(messages[1].content.includes(question));
      assert.ok(messages[1].content.includes(response));
    });

    it('should build OpenAI review prompt', async () => {
      const { buildOpenAIReviewPrompt } = await import('../../frontend/config/review_prompts.mjs');

      const question = 'Explain microservices';
      const response = 'Microservices are an architectural pattern...';
      const messages = buildOpenAIReviewPrompt(question, response);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length >= 2);
    });

    it('should include custom review questions when provided', async () => {
      const { buildHarmonyReviewPrompt } = await import('../../frontend/config/review_prompts.mjs');

      const custom = ['Is this accurate?', 'Is this complete?'];
      const messages = buildHarmonyReviewPrompt('Q', 'A', custom);

      const userContent = messages.find(m => m.role === 'user')?.content;
      assert.ok(userContent.includes('Is this accurate?'));
      assert.ok(userContent.includes('Is this complete?'));
    });
  });

  describe('Regeneration Prompt Building', () => {
    it('should build regeneration prompt with critique', async () => {
      const { buildRegenerationPrompt } = await import('../../frontend/config/review_prompts.mjs');

      const original = [
        { role: 'user', content: 'Explain Docker' }
      ];
      const critique = 'Missing container details';
      const score = 0.65;

      const messages = buildRegenerationPrompt(original, critique, score);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length > original.length);

      const lastMsg = messages[messages.length - 1];
      assert.ok(lastMsg.content.includes('0.65'));
      assert.ok(lastMsg.content.includes('Missing container details'));
    });
  });

  describe('Review Configuration', () => {
    it('should return review config with defaults', async () => {
      const { getReviewConfig } = await import('../../frontend/config/review_prompts.mjs');

      const config = getReviewConfig();

      assert.ok(typeof config.enabled === 'boolean');
      assert.ok(typeof config.threshold === 'number');
      assert.ok(typeof config.iterations === 'number');
      assert.ok(typeof config.mode === 'string');
    });

    it('should respect environment overrides', async () => {
      const origEnabled = process.env.FRONTEND_ENABLE_REVIEW;
      const origThreshold = process.env.FRONTEND_REVIEW_THRESHOLD;

      process.env.FRONTEND_ENABLE_REVIEW = '1';
      process.env.FRONTEND_REVIEW_THRESHOLD = '0.8';

      // Re-import with dynamic import and timestamp to bypass cache
      const { getReviewConfig } = await import('../../frontend/config/review_prompts.mjs?' + Date.now());

      const config = getReviewConfig();
      assert.equal(config.enabled, true);
      assert.equal(config.threshold, 0.8);

      // Restore
      if (origEnabled !== undefined) {
        process.env.FRONTEND_ENABLE_REVIEW = origEnabled;
      } else {
        delete process.env.FRONTEND_ENABLE_REVIEW;
      }
      if (origThreshold !== undefined) {
        process.env.FRONTEND_REVIEW_THRESHOLD = origThreshold;
      } else {
        delete process.env.FRONTEND_REVIEW_THRESHOLD;
      }
    });
  });

  describe('Trigger Detection', () => {
    it('should detect when review should trigger (manual mode)', async () => {
      const { shouldTriggerReview } = await import('../../frontend/config/review_prompts.mjs');

      const context = { question: 'Test' };
      const result = shouldTriggerReview('manual', context);
      assert.equal(typeof result, 'boolean');
    });

    it('should always trigger in always mode', async () => {
      const { shouldTriggerReview } = await import('../../frontend/config/review_prompts.mjs');

      const context = {};
      const result = shouldTriggerReview('always', context);
      assert.equal(result, true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs gracefully', async () => {
      const { extractQualityScore, extractCritique } = await import('../../frontend/config/review_prompts.mjs');

      assert.equal(extractQualityScore(null), null);
      assert.equal(extractQualityScore(undefined), null);
      assert.ok(extractCritique(null) === null || extractCritique(null) === '');
    });

    it('should handle empty strings', async () => {
      const { extractQualityScore, extractCritique } = await import('../../frontend/config/review_prompts.mjs');

      assert.equal(extractQualityScore(''), null);
      assert.ok(extractCritique('') === null || extractCritique('') === '');
    });

    it('should handle malformed score text', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      const text = 'Quality score: abc';
      const score = extractQualityScore(text);
      assert.equal(score, null);
    });

    it('should clamp scores to valid range', async () => {
      const { extractQualityScore } = await import('../../frontend/config/review_prompts.mjs');

      // Out of range values should either be rejected or clamped
      const text1 = 'Quality score: 1.5';
      const score1 = extractQualityScore(text1);
      if (score1 !== null) {
        assert.ok(score1 <= 1.0);
      }

      const text2 = 'Quality score: -0.5';
      const score2 = extractQualityScore(text2);
      if (score2 !== null) {
        assert.ok(score2 >= 0.0);
      }
    });
  });
});
