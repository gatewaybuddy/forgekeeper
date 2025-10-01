import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { orchestrateWithTools } from '../server.orchestrator.mjs';

// Mock fetch to simulate one tool call then final answer
const originalFetch = globalThis.fetch;

function mkResponse(obj, ok = true, status = 200, headers = { 'content-type': 'application/json' }) {
  return {
    ok,
    status,
    headers: { get: (k) => headers[k] },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

describe('orchestrateWithTools', () => {
  beforeAll(() => {
    globalThis.fetch = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      const msgs = body.messages || [];
      const hasToolResult = msgs.some((m) => m.role === 'tool');
      if (hasToolResult) {
        // After tool results are appended, respond with final
        return mkResponse({ choices: [{ message: { role: 'assistant', content: 'final from tool' }, finish_reason: 'stop' }] });
      }
      // First call: request a tool
      return mkResponse({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'tc_1', type: 'function', function: { name: 'echo', arguments: JSON.stringify({ text: 'hi' }) } }] }, finish_reason: 'tool_calls' }] });
    });
  });
  afterAll(() => { globalThis.fetch = originalFetch; });

  it('loops on tool_calls and returns final', async () => {
    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: [{ role: 'user', content: 'hello' }] });
    expect(out?.assistant?.content).toContain('final from tool');
    expect(Array.isArray(out?.debug?.diagnostics)).toBe(true);
  });

  it('captures read_dir transcripts in conversation', async () => {
    const priorFetch = globalThis.fetch;
    const stub = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      const msgs = body.messages || [];
      const hasToolResult = msgs.some((m) => m.role === 'tool');
      if (hasToolResult) {
        return mkResponse({ choices: [{ message: { role: 'assistant', content: 'Listed directory.' }, finish_reason: 'stop' }] });
      }
      return mkResponse({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'tc_read_dir', type: 'function', function: { name: 'read_dir', arguments: JSON.stringify({ dir: '.' }) } }]
          },
          finish_reason: 'tool_calls'
        }]
      });
    });
    globalThis.fetch = stub;
    try {
      const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: [{ role: 'user', content: 'What is in the workspace?' }] });
      expect(Array.isArray(out?.messages)).toBe(true);
      const toolMsg = out.messages.find((m) => m.role === 'tool');
      expect(toolMsg).toBeTruthy();
      expect(toolMsg.name).toBe('read_dir');
      const parsed = (() => {
        try { return JSON.parse(toolMsg.content); } catch { return null; }
      })();
      expect(parsed).toBeTruthy();
      expect(Array.isArray(parsed.entries)).toBe(true);
      expect(parsed.entries.length).toBeGreaterThan(0);
      expect(out?.debug?.diagnostics?.[0]?.tools?.[0]?.name).toBe('read_dir');
    } finally {
      globalThis.fetch = priorFetch;
    }
  });
});

