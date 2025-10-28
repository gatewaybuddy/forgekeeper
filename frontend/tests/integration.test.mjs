/**
 * Integration Tests for Enhanced Features
 *
 * Tests Phase 1, 2, and 3 integrations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('Enhanced Features Integration', () => {
  describe('Health & Status', () => {
    it('should return health status', async () => {
      const response = await fetch(`${BASE_URL}/api/enhanced/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.features).toBeDefined();
    });

    it('should return feature statistics', async () => {
      const response = await fetch(`${BASE_URL}/api/enhanced/stats`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.phase1).toBeDefined();
      expect(data.phase2).toBeDefined();
      expect(data.phase3).toBeDefined();
    });
  });

  describe('Phase 1: Output Truncation & Events', () => {
    it('should have truncation configured', async () => {
      const response = await fetch(`${BASE_URL}/api/enhanced/stats`);
      const data = await response.json();

      expect(data.phase1.truncation.maxBytes).toBeGreaterThan(0);
      expect(data.phase1.truncation.strategy).toMatch(/head-tail|head-only/);
    });

    it('should report event system enabled', async () => {
      const response = await fetch(`${BASE_URL}/api/enhanced/stats`);
      const data = await response.json();

      expect(data.phase1.events.enabled).toBe(true);
      expect(data.phase1.events.types).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Phase 2: Code Review', () => {
    it('should return available criteria', async () => {
      const response = await fetch(`${BASE_URL}/api/code-review/criteria`);

      if (response.status === 404) {
        console.warn('[Test] Code review endpoints not available (FRONTEND_ENABLE_REVIEW not set)');
        return;
      }

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.criteria).toBeInstanceOf(Array);
      expect(data.criteria.length).toBe(5);

      const criteriaIds = data.criteria.map(c => c.id);
      expect(criteriaIds).toContain('security');
      expect(criteriaIds).toContain('correctness');
      expect(criteriaIds).toContain('performance');
    });

    it('should review code with SQL injection vulnerability', async () => {
      const reviewEnabled = process.env.FRONTEND_ENABLE_REVIEW === '1';

      if (!reviewEnabled) {
        console.warn('[Test] Skipping code review test (FRONTEND_ENABLE_REVIEW not set)');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/code-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: [
            {
              file_path: 'test.js',
              diff: `
+function login(username, password) {
+  const query = \`SELECT * FROM users WHERE username='\${username}' AND password='\${password}'\`;
+  return db.query(query);
+}
              `,
              language: 'javascript',
            },
          ],
          criteria: ['security'],
          conv_id: 'test-integration',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.review).toBeDefined();
      expect(data.review.findings).toBeInstanceOf(Array);

      // Should find SQL injection vulnerability
      const hasSecurityFinding = data.review.findings.some(
        f => f.category === 'security' && f.severity === 'critical'
      );

      expect(hasSecurityFinding).toBe(true);
    }, 30000); // 30 second timeout for LLM call

    it('should review a single file', async () => {
      const reviewEnabled = process.env.FRONTEND_ENABLE_REVIEW === '1';

      if (!reviewEnabled) {
        console.warn('[Test] Skipping file review test');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/code-review/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: 'test.py',
          content: `
import os
import sys

def execute_command(user_input):
    os.system(user_input)  # Command injection vulnerability

execute_command(sys.argv[1])
          `,
          criteria: ['security'],
          conv_id: 'test-integration',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.review).toBeDefined();
      expect(data.stats).toBeDefined();
    }, 30000);
  });

  describe('Phase 3: History Compaction', () => {
    it('should have compaction configured', async () => {
      const response = await fetch(`${BASE_URL}/api/enhanced/stats`);
      const data = await response.json();

      if (!data.phase3.enabled) {
        console.warn('[Test] History compaction disabled');
        return;
      }

      expect(data.phase3.threshold).toBeGreaterThan(0);
      expect(data.phase3.recentKeep).toBeGreaterThan(0);
    });
  });

  describe('Unit Tests (imported)', () => {
    describe('Truncator', () => {
      it('should truncate large outputs', async () => {
        const { OutputTruncator } = await import('../core/orchestrator/truncator.mjs');

        const truncator = new OutputTruncator({
          maxBytes: 100,
          maxLines: 10,
          strategy: 'head-tail',
        });

        const largeOutput = 'x'.repeat(1000);
        const result = truncator.truncate(largeOutput);

        expect(result.truncated).toBe(true);
        expect(result.content.length).toBeLessThan(largeOutput.length);
        expect(result.content).toContain('elided');
      });

      it('should not truncate small outputs', async () => {
        const { OutputTruncator } = await import('../core/orchestrator/truncator.mjs');

        const truncator = new OutputTruncator({
          maxBytes: 1000,
          maxLines: 100,
        });

        const smallOutput = 'Hello, world!';
        const result = truncator.truncate(smallOutput);

        expect(result.truncated).toBe(false);
        expect(result.content).toBe(smallOutput);
      });

      it('should handle UTF-8 correctly', async () => {
        const { OutputTruncator } = await import('../core/orchestrator/truncator.mjs');

        const truncator = new OutputTruncator({
          maxBytes: 100,
          strategy: 'head-tail',
        });

        const unicodeOutput = '你好'.repeat(100);
        const result = truncator.truncate(unicodeOutput);

        expect(result.truncated).toBe(true);
        // Should not contain replacement character (broken UTF-8)
        expect(result.content).not.toContain('\ufffd');
      });
    });

    describe('Event Emitter', () => {
      it('should emit events', async () => {
        const { ContextLogEventEmitter } = await import('../core/services/contextlog-events.mjs');

        const emitter = new ContextLogEventEmitter();
        let emittedEvent = null;

        emitter.on('test_event', (event) => {
          emittedEvent = event;
        });

        await emitter.emit({
          id: 'test-123',
          type: 'test_event',
          ts: new Date().toISOString(),
          conv_id: 'test',
        });

        expect(emittedEvent).not.toBeNull();
        expect(emittedEvent.id).toBe('test-123');
      });

      it('should redact sensitive data', async () => {
        const { ContextLogEventEmitter } = await import('../core/services/contextlog-events.mjs');

        const emitter = new ContextLogEventEmitter();

        const content = 'password: secret123, api_key: abc-def-ghi';
        const redacted = emitter.redactAndTruncate(content, 200);

        expect(redacted).toContain('[REDACTED]');
        expect(redacted).not.toContain('secret123');
        expect(redacted).not.toContain('abc-def-ghi');
      });
    });

    describe('Tool Executor', () => {
      it('should execute tools with consistent interface', async () => {
        const { ToolExecutor } = await import('../core/tools/executor.mjs');

        const mockRegistry = new Map();
        mockRegistry.set('test_tool', {
          name: 'test_tool',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
            required: ['input'],
          },
          execute: async (args) => {
            return `Processed: ${args.input}`;
          },
        });

        const executor = new ToolExecutor({
          toolRegistry: mockRegistry,
          truncatorConfig: { maxBytes: 1000 },
        });

        const toolCall = {
          id: 'call-1',
          function: {
            name: 'test_tool',
            arguments: { input: 'test' },
          },
        };

        const result = await executor.execute(toolCall, {
          convId: 'test',
          turnId: 1,
          cwd: process.cwd(),
        });

        expect(result.content).toBe('Processed: test');
        expect(result.truncated).toBe(false);
        expect(result.elapsedMs).toBeGreaterThan(0);
      });
    });
  });
});

describe('Backward Compatibility', () => {
  it('should not break existing /api/chat endpoint', async () => {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'core',
      }),
    });

    // Should at least not return 500
    expect([200, 400, 503]).toContain(response.status);
  });

  it('should not break /config.json endpoint', async () => {
    const response = await fetch(`${BASE_URL}/config.json`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.model).toBeDefined();
    expect(data.tools).toBeDefined();
  });
});
