import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { injectDeveloperNoteBeforeLastUser } from '../src/lib/convoUtils';
import { orchestrateWithTools } from '../server.orchestrator.mjs';

describe('Stop & Revise E2E smoke', () => {
  const originalFetch = globalThis.fetch;

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('developer note influences final', async () => {
    const base = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Please reply normally.' },
    ];
    const note = 'prepend DEVNOTED: to the answer';
    const withNote = injectDeveloperNoteBeforeLastUser(base, note);

    globalThis.fetch = vi.fn(async (url, init) => {
      // Simulate a plain chat completion server that echoes developer note if present
      if (String(url).includes('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body || '{}'));
        const msgs = Array.isArray(body?.messages) ? body.messages : [];
        const dev = msgs.find((m) => m.role === 'developer');
        const prefix = dev?.content?.includes('DEVNOTED') || dev?.content?.includes('prepend DEVNOTED') ? 'DEVNOTED: ' : '';
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: `${prefix}final response.` } }] })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: withNote, tools: [], maxIterations: 1 });
    expect(out).toBeTruthy();
    expect(String(out?.assistant?.content || '')).toContain('DEVNOTED:');
  });
});

