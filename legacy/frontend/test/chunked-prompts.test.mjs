/**
 * Tests for Chunked Prompt Templates and Configuration (T204, T212)
 *
 * @module test/chunked-prompts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildHarmonyOutlinePrompt,
  buildOpenAIOutlinePrompt,
  buildHarmonyChunkPrompt,
  buildOpenAIChunkPrompt,
  parseOutline,
  extractChunkParts,
  getChunkedConfig,
  shouldTriggerChunking,
  estimateTokens,
} from '../config/chunked_prompts.mjs';

describe('Chunked Prompt Templates (T204)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('buildHarmonyOutlinePrompt', () => {
    it('should generate Harmony outline prompt with default maxChunks', () => {
      const messages = buildHarmonyOutlinePrompt('What is machine learning?');

      expect(messages).toBeDefined();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');

      // System message should mention chunking
      expect(messages[0].content).toContain('5 or fewer chunks');
      expect(messages[0].content).toContain('response planner');

      // User message should contain the question
      expect(messages[1].content).toContain('What is machine learning?');
      expect(messages[1].content).toContain('Break this down');
    });

    it('should respect custom maxChunks parameter', () => {
      const messages = buildHarmonyOutlinePrompt('Complex question', 3);

      expect(messages[0].content).toContain('3 or fewer chunks');
    });

    it('should provide formatting instructions', () => {
      const messages = buildHarmonyOutlinePrompt('Test question');

      expect(messages[1].content).toContain('Chunk 1:');
      expect(messages[1].content).toContain('[Label]');
      expect(messages[1].content).toContain('[Description]');
    });
  });

  describe('buildOpenAIOutlinePrompt', () => {
    it('should generate OpenAI outline prompt', () => {
      const messages = buildOpenAIOutlinePrompt('What is AI?');

      expect(messages).toBeDefined();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should have same structure as Harmony prompt', () => {
      const harmonyMessages = buildHarmonyOutlinePrompt('Test', 4);
      const openaiMessages = buildOpenAIOutlinePrompt('Test', 4);

      // Should be structurally identical (current implementation)
      expect(openaiMessages).toEqual(harmonyMessages);
    });
  });

  describe('buildHarmonyChunkPrompt', () => {
    it('should generate basic chunk prompt', () => {
      const messages = buildHarmonyChunkPrompt(
        'What is machine learning?',
        'Introduction',
        0,
        3
      );

      expect(messages).toBeDefined();
      expect(messages.length).toBe(2);

      // System message should indicate chunk position
      expect(messages[0].content).toContain('1 of 3');
      expect(messages[0].content).toContain('Introduction');

      // User message should have the question
      expect(messages[1].content).toContain('What is machine learning?');
      expect(messages[1].content).toContain('Current section to address: Introduction');
    });

    it('should include outline when provided', () => {
      const outline = ['Introduction', 'Main Concepts', 'Conclusion'];
      const messages = buildHarmonyChunkPrompt(
        'Test question',
        'Main Concepts',
        1,
        3,
        '',
        outline
      );

      expect(messages[1].content).toContain('Full outline:');
      expect(messages[1].content).toContain('1. Introduction');
      expect(messages[1].content).toContain('2. Main Concepts');
      expect(messages[1].content).toContain('3. Conclusion');

      // Current chunk should be marked
      expect(messages[1].content).toContain('→ 2. Main Concepts');
    });

    it('should include accumulated response when provided', () => {
      const accumulated = 'Previously, we covered the basics of ML...';
      const messages = buildHarmonyChunkPrompt(
        'Test question',
        'Advanced Topics',
        1,
        2,
        accumulated
      );

      expect(messages[1].content).toContain('Previously written:');
      expect(messages[1].content).toContain(accumulated);
    });

    it('should include Harmony channel instructions', () => {
      const messages = buildHarmonyChunkPrompt('Test', 'Label', 0, 1);

      expect(messages[1].content).toContain('<analysis>');
      expect(messages[1].content).toContain('<final>');
      expect(messages[1].content).toContain('reason about what to include');
    });
  });

  describe('buildOpenAIChunkPrompt', () => {
    it('should generate OpenAI chunk prompt', () => {
      const messages = buildOpenAIChunkPrompt(
        'What is AI?',
        'Introduction',
        0,
        2
      );

      expect(messages).toBeDefined();
      expect(messages.length).toBe(2);
      expect(messages[0].content).toContain('1 of 2');
      expect(messages[1].content).toContain('What is AI?');
    });

    it('should use REASONING: and CONTENT: markers', () => {
      const messages = buildOpenAIChunkPrompt('Test', 'Label', 0, 1);

      expect(messages[1].content).toContain('REASONING:');
      expect(messages[1].content).toContain('CONTENT:');
      expect(messages[0].content).toContain('[Reasoning] followed by [Content]');
    });

    it('should include outline with current marker', () => {
      const outline = ['Part 1', 'Part 2'];
      const messages = buildOpenAIChunkPrompt(
        'Test',
        'Part 2',
        1,
        2,
        '',
        outline
      );

      expect(messages[1].content).toContain('Full outline:');
      expect(messages[1].content).toContain('→ 2. Part 2');
    });
  });

  describe('parseOutline', () => {
    it('should parse "Chunk N: Label - Description" format', () => {
      const outlineText = `
Chunk 1: Introduction - Overview of the topic
Chunk 2: Main Analysis - Detailed examination
Chunk 3: Conclusion - Summary and takeaways
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks).toEqual(['Introduction', 'Main Analysis', 'Conclusion']);
    });

    it('should parse numbered list format', () => {
      const outlineText = `
1. Introduction - Getting started
2. Core Concepts - Main ideas
3. Examples - Practical applications
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks).toEqual(['Introduction', 'Core Concepts', 'Examples']);
    });

    it('should parse numbered list with parentheses', () => {
      const outlineText = `
1) Background Information
2) Technical Details
3) Use Cases
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks).toEqual(['Background Information', 'Technical Details', 'Use Cases']);
    });

    it('should parse bullet list format', () => {
      const outlineText = `
- Introduction
- Main Content
- Conclusion
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks).toEqual(['Introduction', 'Main Content', 'Conclusion']);
    });

    it('should handle mixed formats', () => {
      const outlineText = `
Chunk 1: First Part
2. Second Part - with description
- Third Part
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks.length).toBe(3);
      expect(chunks).toContain('First Part');
      expect(chunks).toContain('Second Part');
      expect(chunks).toContain('Third Part');
    });

    it('should handle empty or invalid input', () => {
      expect(parseOutline('')).toEqual([]);
      expect(parseOutline(null)).toEqual([]);
      expect(parseOutline(undefined)).toEqual([]);
      expect(parseOutline('No valid outline here')).toEqual([]);
    });

    it('should ignore empty lines', () => {
      const outlineText = `
1. First Part

2. Second Part


3. Third Part
      `.trim();

      const chunks = parseOutline(outlineText);

      expect(chunks.length).toBe(3);
    });
  });

  describe('extractChunkParts', () => {
    it('should extract Harmony channels', () => {
      const chunkText = `
<analysis>
This section should cover the introduction and provide context.
</analysis>
<final>
Machine learning is a subset of AI that enables systems to learn from data.
</final>
      `.trim();

      const result = extractChunkParts(chunkText, true);

      expect(result.reasoning).toContain('This section should cover');
      expect(result.content).toContain('Machine learning is a subset');
    });

    it('should extract OpenAI REASONING and CONTENT', () => {
      const chunkText = `
REASONING: We need to explain the core concept first and provide examples.

CONTENT: Neural networks are computational models inspired by biological neurons.
      `.trim();

      const result = extractChunkParts(chunkText, false);

      expect(result.reasoning).toContain('We need to explain');
      expect(result.content).toContain('Neural networks are');
    });

    it('should handle content without reasoning', () => {
      const chunkText = 'Just plain content without any markers.';

      const result = extractChunkParts(chunkText, false);

      expect(result.reasoning).toBe('');
      expect(result.content).toBe(chunkText);
    });

    it('should handle missing final channel in Harmony', () => {
      const chunkText = '<analysis>Some analysis</analysis>';

      const result = extractChunkParts(chunkText, true);

      expect(result.reasoning).toBe('Some analysis');
      expect(result.content).toBe(chunkText); // Falls back to full text when no final tag
    });

    it('should handle empty or invalid input', () => {
      expect(extractChunkParts('', false)).toEqual({ reasoning: '', content: '' });
      expect(extractChunkParts(null, false)).toEqual({ reasoning: '', content: '' });
      expect(extractChunkParts(undefined, false)).toEqual({ reasoning: '', content: '' });
    });

    it('should handle case-insensitive REASONING and CONTENT', () => {
      const chunkText = `
reasoning: This is the reasoning part.
content: This is the content part.
      `.trim();

      const result = extractChunkParts(chunkText, false);

      expect(result.reasoning).toContain('This is the reasoning');
      expect(result.content).toContain('This is the content');
    });
  });

  describe('getChunkedConfig', () => {
    it('should return default configuration', () => {
      // Clear chunked-related env vars
      delete process.env.FRONTEND_ENABLE_CHUNKED;
      delete process.env.FRONTEND_CHUNKED_MAX_CHUNKS;

      const config = getChunkedConfig();

      expect(config.enabled).toBe(false); // Default disabled
      expect(config.maxChunks).toBe(5);
      expect(config.tokensPerChunk).toBe(1024);
      expect(config.autoThreshold).toBe(2048);
      expect(config.autoOutline).toBe(true);
      expect(config.outlineRetries).toBe(2);
      expect(config.outlineTokens).toBe(512);
      expect(config.reviewPerChunk).toBe(false);
    });

    it('should read configuration from environment variables', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '1';
      process.env.FRONTEND_CHUNKED_MAX_CHUNKS = '7';
      process.env.FRONTEND_CHUNKED_TOKENS_PER_CHUNK = '2048';
      process.env.FRONTEND_CHUNKED_AUTO_THRESHOLD = '4096';
      process.env.FRONTEND_CHUNKED_AUTO_OUTLINE = '0';
      process.env.FRONTEND_CHUNKED_OUTLINE_RETRIES = '3';
      process.env.FRONTEND_CHUNKED_OUTLINE_TOKENS = '1024';
      process.env.FRONTEND_CHUNKED_REVIEW_PER_CHUNK = '1';

      const config = getChunkedConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxChunks).toBe(7);
      expect(config.tokensPerChunk).toBe(2048);
      expect(config.autoThreshold).toBe(4096);
      expect(config.autoOutline).toBe(false);
      expect(config.outlineRetries).toBe(3);
      expect(config.outlineTokens).toBe(1024);
      expect(config.reviewPerChunk).toBe(true);
    });
  });

  describe('shouldTriggerChunking', () => {
    it('should return false when disabled', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '0';

      const result = shouldTriggerChunking({ question: 'Test' });

      expect(result).toBe(false);
    });

    it('should trigger on high expected token count', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '1';

      const result = shouldTriggerChunking({
        question: 'Test',
        expectedTokens: 3000,
      });

      expect(result).toBe(true);
    });

    it('should trigger on comprehensive keywords', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '1';

      const keywords = [
        'comprehensive guide',
        'detailed explanation',
        'step by step tutorial',
        'in depth analysis',
        'thorough review',
        'complete guide',
        'explain everything',
        'cover all aspects',
      ];

      for (const keyword of keywords) {
        const result = shouldTriggerChunking({ question: keyword });
        expect(result).toBe(true);
      }
    });

    it('should not trigger on simple questions', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '1';

      const result = shouldTriggerChunking({
        question: 'What is AI?',
        expectedTokens: 100,
      });

      expect(result).toBe(false);
    });

    it('should use custom config when provided', () => {
      const customConfig = {
        enabled: true,
        autoThreshold: 500,
      };

      const result = shouldTriggerChunking(
        { question: 'Test', expectedTokens: 600 },
        customConfig
      );

      expect(result).toBe(true);
    });

    it('should check maxTokens as fallback for expectedTokens', () => {
      process.env.FRONTEND_ENABLE_CHUNKED = '1';

      const result = shouldTriggerChunking({
        question: 'Test',
        maxTokens: 3000,
      });

      expect(result).toBe(true);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for simple text', () => {
      const text = 'This is a test sentence.';
      const tokens = estimateTokens(text);

      // Roughly text.length / 4
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should estimate tokens for longer text', () => {
      const text = 'a'.repeat(1000);
      const tokens = estimateTokens(text);

      expect(tokens).toBe(250); // 1000 / 4
    });

    it('should handle empty or invalid input', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens(undefined)).toBe(0);
    });

    it('should round up for partial tokens', () => {
      const text = 'abc'; // 3 chars = 0.75 tokens
      const tokens = estimateTokens(text);

      expect(tokens).toBe(1); // Math.ceil(3/4) = 1
    });
  });
});
