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

  it('baseline without developer note does not include DEVNOTED', async () => {
    const base = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Please reply normally.' },
    ];
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).includes('/v1/chat/completions')) {
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'final response.' } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: base, tools: [], maxIterations: 1 });
    expect(String(out?.assistant?.content || '')).not.toContain('DEVNOTED:');
  });

  it('developer note can steer to tools (simulated)', async () => {
    const base = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'List something.' },
    ];
    const note = 'use a tool; include TOOL_USED marker';
    const withNote = injectDeveloperNoteBeforeLastUser(base, note);

    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).includes('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body || '{}'));
        const msgs = Array.isArray(body?.messages) ? body.messages : [];
        const hasDev = msgs.some((m) => m.role === 'developer');
        const content = hasDev ? 'TOOL_USED: echo -> ok.' : 'final response.';
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const out = await orchestrateWithTools({ baseUrl: 'http://fake/v1', model: 'core', messages: withNote, tools: [], maxIterations: 1 });
    expect(String(out?.assistant?.content || '')).toContain('TOOL_USED');
  });
});
