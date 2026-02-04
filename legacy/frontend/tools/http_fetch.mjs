// Safe HTTP(S) GET fetch with byte/time limits. Dev-only; gated by env.

const DEFAULT_MAX = Number(process.env.HTTP_FETCH_MAX_BYTES || 64 * 1024);
const DEFAULT_TIMEOUT = Number(process.env.HTTP_FETCH_TIMEOUT_MS || 8000);

export const def = {
  type: 'function',
  function: {
    name: 'http_fetch',
    description: 'Fetch a URL with GET and return up to a byte limit. Gated by FRONTEND_ENABLE_HTTP_FETCH=1.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTP or HTTPS URL to fetch (GET only).' },
        maxBytes: { type: 'integer', description: `Max bytes to read (<= ${DEFAULT_MAX}).` },
        timeout_ms: { type: 'integer', description: `Timeout in ms (<= ${DEFAULT_TIMEOUT}).` },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional request headers (safe subset only).' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    strict: true,
  },
};

function isHttpUrl(u) {
  try { const p = new URL(String(u)); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; }
}

function filterHeaders(h = {}) {
  const out = {};
  const allow = new Set(['accept', 'user-agent', 'accept-language']);
  for (const [k, v] of Object.entries(h || {})) {
    const key = String(k || '').toLowerCase();
    if (!allow.has(key)) continue;
    if (typeof v !== 'string') continue;
    out[key] = v;
  }
  if (!out['accept']) out['accept'] = 'text/plain,application/json;q=0.9,*/*;q=0.8';
  if (!out['user-agent']) out['user-agent'] = 'forgekeeper-tools/0.1';
  return out;
}

function sliceUtf8Bytes(str, maxBytes) {
  if (!str || maxBytes <= 0) return '';
  let bytes = 0;
  let out = '';
  for (const ch of str) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > maxBytes) break;
    bytes += b;
    out += ch;
  }
  return out;
}

export async function run({ url, maxBytes, timeout_ms, headers } = {}) {
  if (process.env.FRONTEND_ENABLE_HTTP_FETCH !== '1') {
    throw new Error('HTTP fetch disabled (set FRONTEND_ENABLE_HTTP_FETCH=1)');
  }
  if (typeof url !== 'string' || !isHttpUrl(url)) throw new Error('url must be an absolute http(s) URL');
  const limit = Math.max(1, Math.min(Number(maxBytes || DEFAULT_MAX), DEFAULT_MAX));
  const to = Math.max(100, Math.min(Number(timeout_ms || DEFAULT_TIMEOUT), DEFAULT_TIMEOUT));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), to);
  const reqHeaders = filterHeaders(headers);
  let resp;
  try {
    resp = await fetch(url, { method: 'GET', headers: reqHeaders, redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  const contentType = (resp?.headers && typeof resp.headers.get === 'function') ? (resp.headers.get('content-type') || '') : '';
  const finalUrl = typeof resp?.url === 'string' ? resp.url : url;

  let truncated = false;
  let text = '';
  let readBytes = 0;

  try {
    const body = resp?.body;
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength) {
          const chunk = decoder.decode(value, { stream: true });
          readBytes += Buffer.byteLength(chunk, 'utf8');
          if (readBytes > limit) {
            text += sliceUtf8Bytes(chunk, Math.max(0, limit - Buffer.byteLength(text, 'utf8')));
            truncated = true;
            break;
          }
          text += chunk;
        }
      }
      // flush decoder if not truncated
      if (!truncated) {
        const rest = decoder.decode();
        if (rest) {
          readBytes += Buffer.byteLength(rest, 'utf8');
          if (readBytes <= limit) text += rest; else truncated = true;
        }
      }
    } else {
      // Fallback: no stream, read full text then slice
      const full = await resp.text();
      const total = Buffer.byteLength(full, 'utf8');
      if (total > limit) {
        text = sliceUtf8Bytes(full, limit);
        truncated = true;
        readBytes = limit;
      } else {
        text = full;
        readBytes = total;
      }
    }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
    return { url, finalUrl, ok: false, status: resp?.status || 0, contentType, bytes: readBytes, truncated, error: msg };
  }

  return {
    url,
    finalUrl,
    ok: !!resp?.ok,
    status: resp?.status || 0,
    contentType,
    bytes: readBytes,
    truncated,
    text,
  };
}

