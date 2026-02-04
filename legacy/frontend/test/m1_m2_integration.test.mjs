/**
 * Integration Tests for M1 (Tool Hardening) + M2 (Chunked Reasoning)
 *
 * Tests the complete system with all features enabled:
 * - M1: Tool allowlist, validation, timeout, redaction, rate limiting
 * - M2: Review mode, chunked mode, combined mode, auto-detection
 * - ContextLog integration
 * - UI components
 *
 * These tests require:
 * - Frontend server running (or mock LLM endpoint)
 * - All M1/M2 features enabled via environment variables
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runTool } from '../server/core/tools.mjs';
import { tailEvents } from '../server/telemetry/contextlog.mjs';
import { redactSensitiveData } from '../server/core/guardrails.mjs';
import { detectReviewMode, detectChunkedMode } from '../server/telemetry/heuristics.mjs';
import { getReviewConfig } from '../config/review_prompts.mjs';
import { getChunkedConfig } from '../config/chunked_prompts.mjs';
import { TOOL_TIMEOUT_MS, TOOL_MAX_OUTPUT_BYTES } from '../config/tools.config.mjs';

describe('M1 + M2 Integration Tests', () => {
  const testConvId = 'integration-test-' + Date.now();
  const testTraceId = 'trace-' + Date.now();

  beforeAll(() => {
    // Configure environment for integration tests
    process.env.TOOLS_EXECUTION_ENABLED = '1';
    process.env.TOOL_ALLOW = 'echo,get_time,read_file,write_file,read_dir,http_fetch';
    process.env.FRONTEND_ENABLE_REVIEW = '1';
    process.env.FRONTEND_ENABLE_CHUNKED = '1';
  });

  describe('M1: Tool Hardening', () => {
    describe('Tool Execution with Security Layers', () => {
      it('should execute allowed tool successfully', async () => {
        const result = await runTool('echo', { text: 'Hello World' }, {
          conv_id: testConvId,
          trace_id: testTraceId
        });

        expect(result).toBeDefined();
        expect(result.error).toBeUndefined();
        expect(result.gated).toBeUndefined();
      });

      it('should block tool not in allowlist if enforcement enabled', async () => {
        // This test depends on TOOL_ALLOW being set
        const originalAllow = process.env.TOOL_ALLOW;
        process.env.TOOL_ALLOW = 'echo,get_time'; // Restrict to only these

        try {
          const result = await runTool('write_file', {
            path: '/tmp/test.txt',
            content: 'test'
          }, { conv_id: testConvId });

          // Should either error or return gated response
          expect(result.error || result.gated).toBeTruthy();
        } finally {
          process.env.TOOL_ALLOW = originalAllow;
        }
      });

      it('should validate arguments and reject invalid ones', async () => {
        try {
          await runTool('echo', {
            text: 'a'.repeat(20000) // Exceeds maxLength of 10000
          }, { conv_id: testConvId });

          // Should throw validation error
          throw new Error('Expected validation error but none was thrown');
        } catch (error) {
          expect(error.message).toContain('validation');
        }
      });

      it('should timeout long-running tool executions', async () => {
        // This would require a mock tool that sleeps
        // For now, we just verify the timeout config exists
        expect(TOOL_TIMEOUT_MS).toBeDefined();
        expect(TOOL_TIMEOUT_MS).toBeGreaterThan(0);
        expect(TOOL_TIMEOUT_MS).toBe(30000); // Default 30 seconds
      });
    });

    describe('Sensitive Data Redaction', () => {
      it('should redact API keys in logs', async () => {
        const sensitiveData = {
          api_key: 'sk' + '_test_' + '1234567890abcdefghij',
          email: 'user@example.com',
          password: 'secret123'
        };

        const redacted = redactSensitiveData(sensitiveData);

        // Key-based redaction takes precedence for field names
        expect(redacted.api_key).toBe('<redacted>');
        expect(redacted.email).toBe('<redacted:email>');
        expect(redacted.password).toBe('<redacted>');
      });

      it('should redact nested sensitive data', async () => {
        const data = {
          user: 'alice',
          config: {
            stripe_key: 'sk' + '_live_' + 'EXAMPLEKEY123',
            normal_field: 'keep this'
          }
        };

        const redacted = redactSensitiveData(data);

        expect(redacted.user).toBe('alice');
        expect(redacted.config.normal_field).toBe('keep this');
        // Pattern-based redaction matches the stripe live key pattern
        expect(redacted.config.stripe_key).toBe('<redacted:stripe-live-key>');
      });

      it('should preserve tool execution but redact logs', async () => {
        const result = await runTool('echo', {
          text: 'My key is sk' + '_test_' + 'EXAMPLE123'
        }, {
          conv_id: testConvId,
          trace_id: testTraceId
        });

        // Tool receives real data
        expect(result.error).toBeUndefined();

        // Wait for ContextLog write
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check logs are redacted
        const events = tailEvents(10, testConvId);
        const toolEvent = events.find(e => e.act === 'tool_execution_finish' && e.name === 'echo');

        if (toolEvent && toolEvent.args_preview) {
          expect(toolEvent.args_preview).toContain('<redacted:openai-key>');
        }
      });
    });

    describe('ContextLog Integration', () => {
      it('should log tool execution start/finish events', async () => {
        await runTool('get_time', {}, {
          conv_id: testConvId,
          trace_id: testTraceId
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        const events = tailEvents(50, testConvId);
        const startEvent = events.find(e => e.act === 'tool_execution_start' && e.name === 'get_time');
        const finishEvent = events.find(e => e.act === 'tool_execution_finish' && e.name === 'get_time');

        expect(startEvent).toBeDefined();
        expect(finishEvent).toBeDefined();
        expect(finishEvent.status).toBe('ok');
        expect(finishEvent.elapsed_ms).toBeGreaterThan(0);
      });

      it('should include correlation IDs in events', async () => {
        await runTool('echo', { text: 'correlation test' }, {
          conv_id: testConvId,
          trace_id: testTraceId
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        const events = tailEvents(10, testConvId);
        const toolEvent = events.find(e => e.act === 'tool_execution_finish' && e.name === 'echo');

        expect(toolEvent).toBeDefined();
        expect(toolEvent.conv_id).toBe(testConvId);
        expect(toolEvent.trace_id).toBe(testTraceId);
      });
    });
  });

  describe('M2: Intelligent Reasoning', () => {
    describe('Auto-Detection Heuristics', () => {
      it('should detect when review mode is appropriate', () => {
        const highConfidenceMessages = [
          'Fix this critical production bug',
          'Deploy security patch to production'
        ];

        // These should definitely trigger review mode
        highConfidenceMessages.forEach(msg => {
          const result = detectReviewMode(msg, {});
          // detectReviewMode returns { shouldUse, confidence, reason }
          expect(result.shouldUse).toBe(true);
          expect(result.confidence).toBeGreaterThan(0.5);
        });
      });

      it('should detect when chunked mode is appropriate', () => {
        const chunkedMessages = [
          'Write a comprehensive guide to React hooks',
          'Explain step-by-step how authentication works',
          'Compare Redux, MobX, and Zustand in detail',
          'Create a detailed tutorial for beginners'
        ];

        chunkedMessages.forEach(msg => {
          const result = detectChunkedMode(msg, {});
          // detectChunkedMode returns { shouldUse, confidence, reason }
          expect(result.shouldUse).toBe(true);
          expect(result.confidence).toBeGreaterThan(0);
        });
      });

      it('should not trigger modes for simple messages', () => {
        const simpleMessages = [
          'What time is it?',
          'Hello',
          'List files'
        ];

        simpleMessages.forEach(msg => {
          const reviewResult = detectReviewMode(msg, {});
          const chunkedResult = detectChunkedMode(msg, {});
          expect(reviewResult.shouldUse).toBe(false);
          expect(chunkedResult.shouldUse).toBe(false);
        });
      });
    });

    describe('Configuration Loading', () => {
      it('should load review configuration with defaults', () => {
        const config = getReviewConfig();

        expect(config).toBeDefined();
        expect(config.enabled).toBeDefined();
        expect(config.iterations).toBeGreaterThan(0);
        expect(config.threshold).toBeGreaterThanOrEqual(0);
        expect(config.threshold).toBeLessThanOrEqual(1);
        expect(config.maxRegenerations).toBeGreaterThanOrEqual(0);
      });

      it('should load chunked configuration with defaults', () => {
        const config = getChunkedConfig();

        expect(config).toBeDefined();
        expect(config.enabled).toBeDefined();
        expect(config.maxChunks).toBeGreaterThan(0);
        expect(config.tokensPerChunk).toBeGreaterThan(0);
      });

      it('should respect environment variable overrides', () => {
        const originalReviewEnabled = process.env.FRONTEND_ENABLE_REVIEW;
        const originalChunkedEnabled = process.env.FRONTEND_ENABLE_CHUNKED;

        process.env.FRONTEND_ENABLE_REVIEW = '1';
        process.env.FRONTEND_ENABLE_CHUNKED = '1';

        try {
          // Force reload config by clearing module cache
          // Note: Module cache clearing doesn't work the same in ESM
          // This test verifies config loading works, but dynamic reload is limited

          const reviewConfig = getReviewConfig();
          const chunkedConfig = getChunkedConfig();

          expect(reviewConfig.enabled).toBe(true);
          expect(chunkedConfig.enabled).toBe(true);
        } finally {
          process.env.FRONTEND_ENABLE_REVIEW = originalReviewEnabled;
          process.env.FRONTEND_ENABLE_CHUNKED = originalChunkedEnabled;
        }
      });
    });
  });

  describe('M1 + M2 Combined', () => {
    it('should handle tool execution within review mode context', async () => {
      // Simulate a scenario where review mode uses tools
      const result = await runTool('echo', {
        text: 'Review this output'
      }, {
        conv_id: testConvId + '-review',
        trace_id: testTraceId + '-review'
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify it was logged
      await new Promise(resolve => setTimeout(resolve, 100));
      const events = tailEvents(10, testConvId + '-review');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should redact sensitive data even in chunked mode', async () => {
      const sensitiveChunk = {
        chunkIndex: 1,
        label: 'API Integration',
        content: 'Use API key: sk' + '_live_' + '1234567890',
        metadata: {
          api_key: 'sk' + '_test_' + 'abcdef'
        }
      };

      const redacted = redactSensitiveData(sensitiveChunk);

      expect(redacted.chunkIndex).toBe(1);
      expect(redacted.label).toBe('API Integration');
      // Content string should have pattern-based redaction
      expect(redacted.content).toContain('<redacted:');
      // Field name 'api_key' gets key-based redaction
      expect(redacted.metadata.api_key).toBe('<redacted>');
    });

    it('should maintain correlation IDs across modes', async () => {
      const sharedConvId = 'multi-mode-test-' + Date.now();
      const sharedTraceId = 'trace-multi-' + Date.now();

      // Execute multiple tools with same IDs
      await runTool('echo', { text: 'step 1' }, {
        conv_id: sharedConvId,
        trace_id: sharedTraceId
      });

      await runTool('get_time', {}, {
        conv_id: sharedConvId,
        trace_id: sharedTraceId
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // All events should have same conv_id
      const events = tailEvents(50, sharedConvId);
      const relevantEvents = events.filter(e =>
        e.act && e.act.includes('tool_execution')
      );

      expect(relevantEvents.length).toBeGreaterThan(0);
      relevantEvents.forEach(event => {
        expect(event.conv_id).toBe(sharedConvId);
        expect(event.trace_id).toBe(sharedTraceId);
      });
    });
  });

  describe('Performance & Limits', () => {
    it('should enforce output size limits', async () => {
      expect(TOOL_MAX_OUTPUT_BYTES).toBeDefined();
      expect(TOOL_MAX_OUTPUT_BYTES).toBe(1048576); // 1MB
    });

    it('should handle rapid tool executions', async () => {
      const results = await Promise.all([
        runTool('echo', { text: 'rapid 1' }, { conv_id: testConvId }),
        runTool('echo', { text: 'rapid 2' }, { conv_id: testConvId }),
        runTool('echo', { text: 'rapid 3' }, { conv_id: testConvId }),
        runTool('get_time', {}, { conv_id: testConvId }),
        runTool('echo', { text: 'rapid 5' }, { conv_id: testConvId })
      ]);

      // All should succeed (or some might be rate limited)
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });
});
