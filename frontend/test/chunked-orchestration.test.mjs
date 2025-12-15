/**
 * Tests for Chunked Reasoning Orchestration (T203, T212)
 *
 * @module test/chunked-orchestration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { orchestrateChunked } from '../server.chunked.mjs';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Chunked Reasoning Orchestration (T203)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Outline Generation', () => {
    it('should generate outline with multiple chunks', async () => {
      // Mock outline generation response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '1. Introduction\n2. Main Analysis\n3. Conclusion',
            },
          }],
        }),
      });

      // Mock chunk generation responses
      for (let i = 0; i < 3; i++) {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: `Chunk ${i + 1} content`,
              },
            }],
          }),
        });
      }

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [
          { role: 'user', content: 'Explain quantum computing in detail' },
        ],
        maxChunks: 3,
      });

      expect(result).toBeDefined();
      expect(result.outline).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should handle outline generation failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(
        orchestrateChunked({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test question' }],
        })
      ).rejects.toThrow();
    });

    it('should limit chunks to maxChunks parameter', async () => {
      // Mock outline with many chunks
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '1. One\n2. Two\n3. Three\n4. Four\n5. Five\n6. Six\n7. Seven',
            },
          }],
        }),
      });

      // Mock chunk responses
      for (let i = 0; i < 5; i++) {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: `Chunk ${i + 1}` } }],
          }),
        });
      }

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        maxChunks: 5,
      });

      expect(result.chunks.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Chunk Generation', () => {
    it('should generate individual chunks with reasoning', async () => {
      // Mock outline
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '1. Introduction\n2. Analysis' },
          }],
        }),
      });

      // Mock chunk responses
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Chunk 1 with reasoning and content' },
          }],
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Chunk 2 with reasoning and content' },
          }],
        }),
      });

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks.length).toBe(2);

      // Each chunk should have content
      result.chunks.forEach((chunk, i) => {
        expect(chunk.label).toBeDefined();
        expect(chunk.content).toBeDefined();
        expect(typeof chunk.content).toBe('string');
      });
    });

    it('should handle chunk generation failures', async () => {
      // Mock successful outline
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '1. Test Chunk' },
          }],
        }),
      });

      // Mock failed chunk generation
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      await expect(
        orchestrateChunked({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('Chunk Assembly', () => {
    it('should assemble chunks into final response', async () => {
      // Mock outline
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '1. Part A\n2. Part B' },
          }],
        }),
      });

      // Mock chunks
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Content A' } }],
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Content B' } }],
        }),
      });

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('Harmony Protocol Support', () => {
    it('should use Harmony protocol for Harmony models', async () => {
      // Mock outline with Harmony response format
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            text: '1. Introduction\n2. Main Content',
          }],
        }),
      });

      // Mock chunk responses with Harmony format
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Chunk 1 content here' }],
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Chunk 2 content here' }],
        }),
      });

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'gpt-oss-instruct',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ContextLog Integration', () => {
    it('should log outline and chunk events', async () => {
      // Mock responses
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '1. Test' } }],
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test content' } }],
        }),
      });

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        convId: 'test-conv',
        traceId: 'test-trace',
      });

      expect(result).toBeDefined();
      // Events should be logged (verified through ContextLog in integration tests)
    });
  });

  describe('Configuration', () => {
    it('should respect maxChunks configuration', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '1. Part One\n2. Part Two' },
          }],
        }),
      });

      // Mock chunk responses
      for (let i = 0; i < 2; i++) {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: `Chunk ${i + 1} content here` } }],
          }),
        });
      }

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        maxChunks: 5,
      });

      expect(result.chunks.length).toBe(2); // Outline only had 2 chunks
      expect(result.content).toBeDefined();
    });

    it('should use default configuration when not provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '1. Default' } }],
        }),
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Default content' } }],
        }),
      });

      const result = await orchestrateChunked({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors with retry', async () => {
      // Mock retries (implementation retries on failure)
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(
        orchestrateChunked({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow();
    });

    it('should handle malformed responses with retry', async () => {
      // Mock malformed responses for retries
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}), // Missing choices
      });

      await expect(
        orchestrateChunked({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow();
    });
  });
});
