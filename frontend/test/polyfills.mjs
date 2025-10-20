// Minimal fetch polyfill guard for tests that mock globalThis.fetch
if (typeof fetch === 'undefined') {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
}

