/**
 * Tests for Reflection Pass (Sprint 6)
 *
 * @module test/reflection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getReflectionConfig,
  buildReflectionCritiquePrompt,
  buildReflectionCorrectionPrompt,
  parseReflectionCritique,
  extractCorrectedContent,
  createReflectionEvent,
  isReflectionEnabled,
  shouldSkipReflection,
  DEFAULT_REFLECTION_CHECKLIST,
} from '../config/reflection_prompts.mjs';

describe('Reflection Pass (Sprint 6)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should return default configuration', () => {
      const config = getReflectionConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('critiqueTokens');
      expect(config).toHaveProperty('correctionTokens');
      expect(config).toHaveProperty('minConfidence');
      expect(config).toHaveProperty('maxIterations');
    });

    it('should respect FRONTEND_REFLECTION_ENABLED env var', () => {
      process.env.FRONTEND_REFLECTION_ENABLED = '1';
      const config = getReflectionConfig();
      expect(config.enabled).toBe(true);

      process.env.FRONTEND_REFLECTION_ENABLED = '0';
      const config2 = getReflectionConfig();
      expect(config2.enabled).toBe(false);
    });

    it('should use default token budgets', () => {
      const config = getReflectionConfig();
      expect(config.critiqueTokens).toBe(256);
      expect(config.correctionTokens).toBe(512);
    });

    it('should use default min confidence', () => {
      const config = getReflectionConfig();
      expect(config.minConfidence).toBe(0.6);
    });

    it('should use default max iterations', () => {
      const config = getReflectionConfig();
      expect(config.maxIterations).toBe(1);
    });

    it('should respect custom token budgets', () => {
      process.env.FRONTEND_REFLECTION_CRITIQUE_TOKENS = '512';
      process.env.FRONTEND_REFLECTION_CORRECTION_TOKENS = '1024';

      const config = getReflectionConfig();
      expect(config.critiqueTokens).toBe(512);
      expect(config.correctionTokens).toBe(1024);
    });
  });

  describe('Critique Prompt Building', () => {
    it('should build critique prompt with default checklist', () => {
      const messages = buildReflectionCritiquePrompt(
        'What is React?',
        'React is a JavaScript library for building user interfaces.'
      );

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include question and response in prompt', () => {
      const question = 'Explain Docker';
      const response = 'Docker is a containerization platform';

      const messages = buildReflectionCritiquePrompt(question, response);
      const userContent = messages.find(m => m.role === 'user')?.content;

      expect(userContent).toContain(question);
      expect(userContent).toContain(response);
    });

    it('should include checklist items', () => {
      const messages = buildReflectionCritiquePrompt('Q', 'A');
      const userContent = messages.find(m => m.role === 'user')?.content;

      // Should contain checklist items
      expect(userContent).toContain('accurate');
      expect(userContent).toContain('address');
    });

    it('should support custom checklist', () => {
      const customChecklist = ['Is this funny?', 'Is this helpful?'];
      const messages = buildReflectionCritiquePrompt('Q', 'A', customChecklist);
      const userContent = messages.find(m => m.role === 'user')?.content;

      expect(userContent).toContain('Is this funny?');
      expect(userContent).toContain('Is this helpful?');
    });

    it('should request confidence score', () => {
      const messages = buildReflectionCritiquePrompt('Q', 'A');
      const userContent = messages.find(m => m.role === 'user')?.content;

      expect(userContent.toLowerCase()).toContain('confidence');
    });
  });

  describe('Correction Prompt Building', () => {
    it('should build correction prompt', () => {
      const messages = buildReflectionCorrectionPrompt(
        'What is Node.js?',
        'Node.js is a runtime.',
        'Too brief, add more detail'
      );

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include original question and response', () => {
      const question = 'Explain GraphQL';
      const response = 'GraphQL is a query language';
      const critique = 'Add examples';

      const messages = buildReflectionCorrectionPrompt(question, response, critique);
      const userContent = messages.find(m => m.role === 'user')?.content;

      expect(userContent).toContain(question);
      expect(userContent).toContain(response);
      expect(userContent).toContain(critique);
    });

    it('should instruct to fix specific issues', () => {
      const critique = 'Missing error handling explanation';
      const messages = buildReflectionCorrectionPrompt('Q', 'A', critique);
      const userContent = messages.find(m => m.role === 'user')?.content;

      expect(userContent).toContain(critique);
    });
  });

  describe('Critique Parsing', () => {
    it('should parse PASS assessment', () => {
      const critiqueText = 'Assessment: PASS\nConfidence: 0.9\nLooks good!';
      const result = parseReflectionCritique(critiqueText);

      expect(result.assessment).toBe('PASS');
      expect(result.needsCorrection).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should parse NEEDS CORRECTION assessment', () => {
      const critiqueText = 'Assessment: NEEDS CORRECTION\nConfidence: 0.8\nMissing examples';
      const result = parseReflectionCritique(critiqueText);

      expect(result.assessment).toBe('NEEDS CORRECTION');
      expect(result.needsCorrection).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should extract confidence score', () => {
      const critiqueText = 'The response is good. Confidence: 0.85';
      const result = parseReflectionCritique(critiqueText);

      expect(result.confidence).toBe(0.85);
    });

    it('should handle missing confidence score', () => {
      const critiqueText = 'PASS - looks good';
      const result = parseReflectionCritique(critiqueText);

      expect(result.confidence).toBe(0.5); // Default
    });

    it('should extract explanation for corrections', () => {
      const critiqueText = 'NEEDS CORRECTION\nExplanation: Missing error handling details';
      const result = parseReflectionCritique(critiqueText);

      expect(result.explanation).toBeTruthy();
      expect(result.explanation).toContain('error handling');
    });

    it('should handle null/undefined input', () => {
      const result1 = parseReflectionCritique(null);
      expect(result1.assessment).toBe('UNKNOWN');
      expect(result1.needsCorrection).toBe(false);

      const result2 = parseReflectionCritique(undefined);
      expect(result2.assessment).toBe('UNKNOWN');
    });

    it('should detect pass keywords', () => {
      const testCases = [
        'Looks good overall',
        'No issues found',
        'This is acceptable',
        'PASS',
      ];

      for (const text of testCases) {
        const result = parseReflectionCritique(text);
        expect(result.needsCorrection).toBe(false);
      }
    });

    it('should detect correction keywords', () => {
      const testCases = [
        'Needs correction - missing details',
        'Has issues with accuracy',
        'Incorrect information',
        'Inaccurate response',
      ];

      for (const text of testCases) {
        const result = parseReflectionCritique(text);
        expect(result.needsCorrection).toBe(true);
      }
    });
  });

  describe('Corrected Content Extraction', () => {
    it('should extract content from code fence', () => {
      const correctionText = '```\nCorrected response here\n```';
      const result = extractCorrectedContent(correctionText);

      expect(result).toBe('Corrected response here');
    });

    it('should extract content from language-tagged fence', () => {
      const correctionText = '```markdown\n# Corrected Heading\n```';
      const result = extractCorrectedContent(correctionText);

      expect(result).toBe('# Corrected Heading');
    });

    it('should return plain text if no fence', () => {
      const correctionText = 'Simple corrected response';
      const result = extractCorrectedContent(correctionText);

      expect(result).toBe('Simple corrected response');
    });

    it('should trim whitespace', () => {
      const correctionText = '\n\n  Response with whitespace  \n\n';
      const result = extractCorrectedContent(correctionText);

      expect(result).toBe('Response with whitespace');
    });

    it('should handle null/undefined input', () => {
      expect(extractCorrectedContent(null)).toBe('');
      expect(extractCorrectedContent(undefined)).toBe('');
    });
  });

  describe('Reflection Events', () => {
    it('should create critique event', () => {
      const event = createReflectionEvent('critique', {
        assessment: 'PASS',
        needsCorrection: false,
        confidence: 0.9,
        elapsed_ms: 150,
        trace_id: 'trace-123',
        conv_id: 'conv-456',
      });

      expect(event.act).toBe('reflection_critique');
      expect(event.actor).toBe('system');
      expect(event.assessment).toBe('PASS');
      expect(event.needs_correction).toBe(false);
      expect(event.confidence).toBe(0.9);
      expect(event.elapsed_ms).toBe(150);
    });

    it('should create correction event', () => {
      const event = createReflectionEvent('correction', {
        applied: true,
        originalLength: 100,
        correctedLength: 150,
        elapsed_ms: 250,
        trace_id: 'trace-123',
        conv_id: 'conv-456',
      });

      expect(event.act).toBe('reflection_correction');
      expect(event.actor).toBe('system');
      expect(event.applied).toBe(true);
      expect(event.original_length).toBe(100);
      expect(event.corrected_length).toBe(150);
    });

    it('should include timestamp', () => {
      const event = createReflectionEvent('critique', {});

      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Skip Conditions', () => {
    it('should skip very short responses', () => {
      const shortResponse = 'OK';
      expect(shouldSkipReflection(shortResponse)).toBe(true);
    });

    it('should not skip normal responses', () => {
      const normalResponse = 'This is a comprehensive response that explains the topic in detail with examples.';
      expect(shouldSkipReflection(normalResponse)).toBe(false);
    });

    it('should skip tool-only responses', () => {
      const response = 'Some response';
      expect(shouldSkipReflection(response, { toolOnly: true })).toBe(true);
    });

    it('should skip if already reviewed', () => {
      const response = 'Some response';
      expect(shouldSkipReflection(response, { reviewMode: true })).toBe(true);
    });

    it('should skip error messages', () => {
      const errorResponse = 'Error: Unable to process request';
      expect(shouldSkipReflection(errorResponse)).toBe(true);

      const failedResponse = 'Failed to complete operation';
      expect(shouldSkipReflection(failedResponse)).toBe(true);
    });

    it('should skip null/undefined responses', () => {
      expect(shouldSkipReflection(null)).toBe(true);
      expect(shouldSkipReflection(undefined)).toBe(true);
      expect(shouldSkipReflection('')).toBe(true);
    });
  });

  describe('Feature Flags', () => {
    it('should check if reflection is enabled', () => {
      process.env.FRONTEND_REFLECTION_ENABLED = '1';
      expect(isReflectionEnabled()).toBe(true);

      process.env.FRONTEND_REFLECTION_ENABLED = '0';
      expect(isReflectionEnabled()).toBe(false);

      delete process.env.FRONTEND_REFLECTION_ENABLED;
      expect(isReflectionEnabled()).toBe(false);
    });
  });

  describe('Default Checklist', () => {
    it('should have default checklist items', () => {
      expect(Array.isArray(DEFAULT_REFLECTION_CHECKLIST)).toBe(true);
      expect(DEFAULT_REFLECTION_CHECKLIST.length).toBeGreaterThan(0);
    });

    it('should cover accuracy, completeness, clarity', () => {
      const checklistText = DEFAULT_REFLECTION_CHECKLIST.join(' ').toLowerCase();

      expect(checklistText).toContain('accurate');
      expect(checklistText).toContain('address');
      expect(checklistText).toContain('clear');
      expect(checklistText).toContain('error');
      expect(checklistText).toContain('complete');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed confidence scores', () => {
      const critiqueText = 'Confidence: invalid\nPASS';
      const result = parseReflectionCritique(critiqueText);

      expect(result.confidence).toBe(0.5); // Should use default
    });

    it('should handle out-of-range confidence scores', () => {
      const critiqueText1 = 'Confidence: 1.5\nPASS';
      const result1 = parseReflectionCritique(critiqueText1);
      // Should either clamp or reject
      expect(result1.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result1.confidence).toBeLessThanOrEqual(1.0);

      const critiqueText2 = 'Confidence: -0.5\nPASS';
      const result2 = parseReflectionCritique(critiqueText2);
      expect(result2.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result2.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle conflicting assessment signals', () => {
      // Contains both PASS and NEEDS CORRECTION
      const critiqueText = 'Overall PASS but needs correction in one area';
      const result = parseReflectionCritique(critiqueText);

      // Should prefer correction signal
      expect(result.needsCorrection).toBe(true);
    });

    it('should handle multiline explanations', () => {
      const critiqueText = 'NEEDS CORRECTION\nExplanation: Multiple issues:\n- Missing examples\n- Unclear wording\n- Incomplete coverage';
      const result = parseReflectionCritique(critiqueText);

      expect(result.explanation).toBeTruthy();
    });
  });
});
