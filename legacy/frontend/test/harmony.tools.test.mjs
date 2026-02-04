import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { orchestrateWithTools } from '../server/orchestration/orchestrator.mjs';

describe('Harmony tool-call loop', () => {
  const originalFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeAll(() => {
    process.env.FRONTEND_USE_HARMONY = '1';
    process.env.FRONTEND_HARMONY_TOOLS = '1';
    // Stub fetch: first call returns a <tool_call>, second returns final
    let counter = 0;
    globalThis.fetch = vi.fn(async (_url, init) => {
      counter += 1;
      const body = JSON.parse(init.body);
      if (counter === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ choices: [{ text: '<tool_call>{"name":"echo","arguments":{"text":"hi"}}</tool_call>', finish_reason: 'stop' }] }),
          text: async () => ''
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ choices: [{ text: 'Final answer: hi', finish_reason: 'stop' }] }),
        text: async () => ''
      };
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, origEnv);
  });

  it('executes a Harmony tool call and returns final', async () => {
    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'oss-harmony', messages: [{ role: 'user', content: 'Say hi using echo.' }] });
    expect(out?.assistant?.content).toMatch(/final answer/i);
    expect(Array.isArray(out?.debug?.diagnostics)).toBe(true);
  });
});

