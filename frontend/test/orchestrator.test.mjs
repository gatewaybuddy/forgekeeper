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
      const last = msgs[msgs.length - 1] || {};
      if (last.role === 'assistant' && Array.isArray(last.tool_calls)) {
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
    expect(out?.assistant?.content).toBe('final from tool');
    expect(Array.isArray(out?.debug?.diagnostics)).toBe(true);
  });
});

