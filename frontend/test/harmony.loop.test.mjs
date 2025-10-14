import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { orchestrateWithTools } from '../server.orchestrator.mjs';

describe('Harmony tool loop breaker and incomplete continue', () => {
  const originalFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeAll(() => {
    process.env.FRONTEND_USE_HARMONY = '1';
    process.env.FRONTEND_HARMONY_TOOLS = '1';
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, origEnv);
  });

  it('breaks duplicate tool-call loop and continues to final', async () => {
    let iter = 0;
    globalThis.fetch = vi.fn(async (_url, _init) => {
      iter += 1;
      if (iter === 1) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ text: '<tool_call>{"name":"echo","arguments":{"text":"hello"}}</tool_call>' }] }) };
      }
      if (iter === 2) {
        // Duplicate call again
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ text: '<tool_call>{"name":"echo","arguments":{"text":"hello"}}</tool_call>' }] }) };
      }
      // Final short answer without punctuation -> auto-continue kicks in once
      if (iter === 3) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ text: 'Final answer' , finish_reason: 'stop' }] }) };
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ text: ' now.' , finish_reason: 'stop' }] }) };
    });

    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'oss-harmony', messages: [{ role: 'user', content: 'Say hello using echo tool.' }], maxIterations: 5 });
    expect(typeof out?.assistant?.content).toBe('string');
    expect(out.assistant.content.length).toBeGreaterThan(0);
    expect(Array.isArray(out?.debug?.toolsUsed)).toBe(true);
  });
});
