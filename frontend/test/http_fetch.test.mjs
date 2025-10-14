import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

describe('http_fetch tool', () => {
  const originalFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeAll(() => {
    process.env.FRONTEND_ENABLE_HTTP_FETCH = '1';
    globalThis.fetch = vi.fn(async (url, init) => {
      // Simulate redirect and long body
      const finalUrl = String(url).replace(/\/$/, '') + '/data';
      const bodyText = 'X'.repeat(1000);
      return {
        ok: true,
        status: 200,
        url: finalUrl,
        headers: { get: (k) => (k && k.toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null) },
        // No body stream -> tool will fallback to text() and slice
        text: async () => bodyText,
      };
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, origEnv);
  });

  it('returns truncated text within maxBytes limit', async () => {
    const tool = await import('../tools/http_fetch.mjs');
    const res = await tool.run({ url: 'https://example.com', maxBytes: 64 });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.finalUrl).toMatch(/\/data$/);
    expect(res.contentType).toContain('text/plain');
    expect(res.truncated).toBe(true);
    expect(typeof res.text).toBe('string');
    // 64 bytes of ASCII should be 64 chars
    expect(res.text.length).toBe(64);
  });
});

