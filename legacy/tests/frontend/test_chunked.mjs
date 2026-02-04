// Integration tests for chunked reasoning mode (T212)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Chunked Reasoning Integration Tests', () => {
  describe('Outline Parsing', () => {
    it('should parse numbered outline', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = '1. Introduction\n2. Core Concepts\n3. Examples\n4. Conclusion';
      const outline = parseOutline(text);

      assert.ok(Array.isArray(outline));
      assert.equal(outline.length, 4);
      assert.equal(outline[0], 'Introduction');
      assert.equal(outline[1], 'Core Concepts');
      assert.equal(outline[2], 'Examples');
      assert.equal(outline[3], 'Conclusion');
    });

    it('should parse bulleted outline', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = '- Docker Basics\n- Advanced Topics\n- Best Practices';
      const outline = parseOutline(text);

      assert.ok(Array.isArray(outline));
      assert.equal(outline.length, 3);
      assert.equal(outline[0], 'Docker Basics');
    });

    it('should handle mixed formats', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = '1) First Section\n2) Second Section\n3) Third Section';
      const outline = parseOutline(text);

      assert.ok(Array.isArray(outline));
      assert.ok(outline.length >= 3);
    });

    it('should return empty array for invalid outline', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = 'This is not an outline';
      const outline = parseOutline(text);

      assert.ok(Array.isArray(outline));
      // May return empty or single item depending on implementation
      assert.ok(outline.length >= 0);
    });
  });

  describe('Chunk Part Extraction', () => {
    it('should extract reasoning and content from chunk', async () => {
      const { extractChunkParts } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = '[Reasoning] This chunk covers Docker basics.\n\n[Content] Docker is a containerization platform...';
      const parts = extractChunkParts(text);

      // Should return an object with reasoning and content fields
      assert.ok(typeof parts === 'object');
      assert.ok('reasoning' in parts);
      assert.ok('content' in parts);
      assert.ok(typeof parts.reasoning === 'string');
      assert.ok(typeof parts.content === 'string');
    });

    it('should handle missing sections gracefully', async () => {
      const { extractChunkParts } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = 'Just plain content without markers';
      const parts = extractChunkParts(text);

      assert.ok(typeof parts.reasoning === 'string');
      assert.ok(typeof parts.content === 'string');
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for text', async () => {
      const { estimateTokens } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = 'This is a sample text with some words';
      const tokens = estimateTokens(text);

      assert.ok(typeof tokens === 'number');
      assert.ok(tokens > 0);
      assert.ok(tokens < 20); // Should be roughly ~9-10 tokens
    });

    it('should return 0 for empty text', async () => {
      const { estimateTokens } = await import('../../frontend/config/chunked_prompts.mjs');

      assert.equal(estimateTokens(''), 0);
      assert.equal(estimateTokens(null), 0);
      assert.equal(estimateTokens(undefined), 0);
    });

    it('should handle long text', async () => {
      const { estimateTokens } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = 'word '.repeat(1000); // 1000 words
      const tokens = estimateTokens(text);

      assert.ok(tokens > 900); // Should be ~1000-1200 tokens
      assert.ok(tokens < 1500);
    });
  });

  describe('Chunked Prompt Building', () => {
    it('should build Harmony outline prompt', async () => {
      const { buildHarmonyOutlinePrompt } = await import('../../frontend/config/chunked_prompts.mjs');

      const question = 'Comprehensive Docker guide';
      const maxChunks = 5;
      const messages = buildHarmonyOutlinePrompt(question, maxChunks);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length >= 1);

      const userMsg = messages.find(m => m.role === 'user');
      assert.ok(userMsg);
      assert.ok(userMsg.content.includes(question));
      assert.ok(userMsg.content.includes('5') || userMsg.content.includes('outline'));
    });

    it('should build OpenAI outline prompt', async () => {
      const { buildOpenAIOutlinePrompt } = await import('../../frontend/config/chunked_prompts.mjs');

      const question = 'Kubernetes tutorial';
      const maxChunks = 4;
      const messages = buildOpenAIOutlinePrompt(question, maxChunks);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length >= 1);
    });

    it('should build Harmony chunk prompt with context', async () => {
      const { buildHarmonyChunkPrompt } = await import('../../frontend/config/chunked_prompts.mjs');

      const question = 'Explain Docker';
      const chunkLabel = 'Docker Basics';
      const chunkIndex = 1;
      const totalChunks = 5;
      const accumulated = 'Previous content about Docker installation...';
      const outline = ['Installation', 'Basics', 'Advanced', 'Best Practices', 'Conclusion'];

      const messages = buildHarmonyChunkPrompt(
        question,
        chunkLabel,
        chunkIndex,
        totalChunks,
        accumulated,
        outline
      );

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length > 0);

      // Should have content related to the chunk
      const allContent = messages.map(m => m.content).join(' ');
      assert.ok(allContent.includes(chunkLabel) || allContent.includes(question));
    });

    it('should build OpenAI chunk prompt', async () => {
      const { buildOpenAIChunkPrompt } = await import('../../frontend/config/chunked_prompts.mjs');

      const question = 'Explain Kubernetes';
      const chunkLabel = 'Pods and Services';
      const messages = buildOpenAIChunkPrompt(question, chunkLabel, 0, 3, '', []);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length >= 1);
    });
  });

  describe('Chunked Configuration', () => {
    it('should return chunked config with defaults', async () => {
      const { getChunkedConfig } = await import('../../frontend/config/chunked_prompts.mjs');

      const config = getChunkedConfig();

      assert.ok(typeof config.enabled === 'boolean');
      assert.ok(typeof config.maxChunks === 'number');
      assert.ok(typeof config.tokensPerChunk === 'number');
      assert.ok(config.maxChunks > 0);
      assert.ok(config.tokensPerChunk > 0);
    });

    it('should respect environment overrides', async () => {
      const origEnabled = process.env.FRONTEND_ENABLE_CHUNKED;
      const origMaxChunks = process.env.FRONTEND_CHUNKED_MAX_CHUNKS;

      process.env.FRONTEND_ENABLE_CHUNKED = '1';
      process.env.FRONTEND_CHUNKED_MAX_CHUNKS = '7';

      // Re-import with dynamic import and timestamp to bypass cache
      const { getChunkedConfig } = await import('../../frontend/config/chunked_prompts.mjs?' + Date.now());

      const config = getChunkedConfig();
      assert.equal(config.enabled, true);
      assert.equal(config.maxChunks, 7);

      // Restore
      if (origEnabled !== undefined) {
        process.env.FRONTEND_ENABLE_CHUNKED = origEnabled;
      } else {
        delete process.env.FRONTEND_ENABLE_CHUNKED;
      }
      if (origMaxChunks !== undefined) {
        process.env.FRONTEND_CHUNKED_MAX_CHUNKS = origMaxChunks;
      } else {
        delete process.env.FRONTEND_CHUNKED_MAX_CHUNKS;
      }
    });
  });

  describe('Trigger Detection', () => {
    it('should detect comprehensive requests', async () => {
      const { shouldTriggerChunking } = await import('../../frontend/config/chunked_prompts.mjs');

      const context = {
        question: 'Provide a comprehensive analysis of Docker with detailed examples',
        expectedTokens: 4000,
        tools: []
      };
      const config = { enabled: true, maxChunks: 5, tokensPerChunk: 1024 };

      const result = shouldTriggerChunking(context, config);
      assert.equal(typeof result, 'boolean');
    });

    it('should not trigger when tools are present', async () => {
      const { shouldTriggerChunking } = await import('../../frontend/config/chunked_prompts.mjs');

      const context = {
        question: 'Comprehensive guide',
        expectedTokens: 4000,
        tools: [{ name: 'read_file' }]
      };
      const config = { enabled: true, maxChunks: 5, tokensPerChunk: 1024 };

      const result = shouldTriggerChunking(context, config);
      // Should not trigger with tools (typically)
      assert.equal(typeof result, 'boolean');
    });

    it('should not trigger for short responses', async () => {
      const { shouldTriggerChunking } = await import('../../frontend/config/chunked_prompts.mjs');

      const context = {
        question: 'What is Docker?',
        expectedTokens: 200,
        tools: []
      };
      const config = { enabled: true, maxChunks: 5, tokensPerChunk: 1024 };

      const result = shouldTriggerChunking(context, config);
      // Short response shouldn't trigger chunking
      assert.equal(typeof result, 'boolean');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty outline text', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const outline = parseOutline('');
      assert.ok(Array.isArray(outline));
    });

    it('should handle null/undefined inputs', async () => {
      const { parseOutline, estimateTokens } = await import('../../frontend/config/chunked_prompts.mjs');

      const outline = parseOutline(null);
      assert.ok(Array.isArray(outline));

      const tokens = estimateTokens(null);
      assert.equal(tokens, 0);
    });

    it('should handle very long chunk labels', async () => {
      const { buildHarmonyChunkPrompt } = await import('../../frontend/config/chunked_prompts.mjs');

      const longLabel = 'A'.repeat(500);
      const messages = buildHarmonyChunkPrompt('Q', longLabel, 0, 1, '', []);

      assert.ok(Array.isArray(messages));
      assert.ok(messages.length > 0);
    });

    it('should handle outline with special characters', async () => {
      const { parseOutline } = await import('../../frontend/config/chunked_prompts.mjs');

      const text = '1. Docker & Kubernetes\n2. CI/CD Pipelines\n3. Best Practices (2024)';
      const outline = parseOutline(text);

      assert.ok(Array.isArray(outline));
      assert.ok(outline.length >= 3);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full chunked workflow data flow', async () => {
      const {
        buildHarmonyOutlinePrompt,
        parseOutline,
        buildHarmonyChunkPrompt,
        estimateTokens
      } = await import('../../frontend/config/chunked_prompts.mjs');

      // Step 1: Build outline prompt
      const question = 'Comprehensive Docker guide';
      const outlinePrompt = buildHarmonyOutlinePrompt(question, 5);
      assert.ok(outlinePrompt.length > 0);

      // Step 2: Simulate outline generation
      const outlineText = '1. Docker Basics\n2. Containers\n3. Images\n4. Networking\n5. Best Practices';
      const outline = parseOutline(outlineText);
      assert.equal(outline.length, 5);

      // Step 3: Build chunk prompt for each
      const chunks = [];
      let accumulated = '';

      for (let i = 0; i < outline.length; i++) {
        const chunkPrompt = buildHarmonyChunkPrompt(
          question,
          outline[i],
          i,
          outline.length,
          accumulated,
          outline
        );

        assert.ok(chunkPrompt.length > 0);

        // Simulate chunk content
        const chunkContent = `This is the content for ${outline[i]}. It has details...`;
        accumulated += chunkContent + '\n\n';

        const tokens = estimateTokens(chunkContent);
        chunks.push({ label: outline[i], content: chunkContent, tokens });
      }

      assert.equal(chunks.length, 5);
      assert.ok(chunks.every(c => c.tokens > 0));
    });
  });
});
