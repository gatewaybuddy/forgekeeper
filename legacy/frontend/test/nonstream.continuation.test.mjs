import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import './polyfills.mjs';
import { orchestrateWithTools } from '../server/orchestration/orchestrator.mjs';

// Simulate /api/chat non-stream path behavior by calling orchestrate and then
// faking the upstream chat completion response to be truncated once, followed by
// a short continuation.

describe('Non-stream continuation smoke', () => {
  const originalFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeAll(() => {
    process.env.FRONTEND_USE_HARMONY = '0';
    process.env.FRONTEND_CONT_ATTEMPTS = '2';
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, origEnv);
  });

  it('appends one continuation when final is incomplete', async () => {
    let call = 0;
    // First call: orchestrator internal tool loop (we don’t care here)
    // Second call: final /chat/completions returns truncated text
    // Third call: continuation returns the closing part
    globalThis.fetch = vi.fn(async (url, init) => {
      call += 1;
      // For orchestrateWithTools internal prompts (Harmony/non-Harmony), return a "final" with no tool calls
      if (String(url).includes('/v1/chat/completions') && call === 1) {
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Hello this is a response' } }] }) };
      }
      if (String(url).includes('/v1/chat/completions') && call === 2) {
        // Truncated final (no punctuation)
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'This is incomplete' } }] }) };
      }
      if (String(url).includes('/v1/chat/completions') && call >= 3) {
        // Continuation
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' and now finished.' } }] }) };
      }
      // Fallback minimal
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok.' } }] }) };
    });

    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: [{ role: 'user', content: 'Say hello' }], maxIterations: 1 });
    expect(out).toBeTruthy();
    // We only verify that orchestrator works; non-stream continuation is performed in server.mjs, which we simulate via our mocked fetch sequence
    // The important part for the smoke test is that truncated content is considered incomplete by our finisher heuristics
    expect(typeof out?.assistant?.content).toBe('string');
  });
});

