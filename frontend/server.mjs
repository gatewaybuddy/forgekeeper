import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Lightweight manual proxy; http-proxy-middleware removed to reduce ambiguity
import { Readable } from 'node:stream';
import { orchestrateWithTools } from './server.orchestrator.mjs';
import { TOOL_DEFS } from './server.tools.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(compression());
// JSON parser only for API routes to avoid interfering with SSE proxying
app.use('/api', express.json({ limit: '1mb' }));
const distDir = path.join(__dirname, 'dist');
const apiBase = process.env.FRONTEND_VLLM_API_BASE || 'http://localhost:8001/v1';
const targetOrigin = apiBase.replace(/\/v1\/?$/, '');
console.log('Proxy target:', targetOrigin);

// Runtime config for the UI
app.get('/config.json', (_req, res) => {
  const model = process.env.FRONTEND_VLLM_MODEL || 'core';
  res.setHeader('Content-Type', 'application/json');
  const tools = Array.isArray(TOOL_DEFS) ? TOOL_DEFS : [];
  const names = tools.map(t => t?.function?.name).filter(Boolean);
  const powershellEnabled = process.env.FRONTEND_ENABLE_POWERSHELL === '1';
  const allow = (process.env.TOOL_ALLOW || '').trim();
  const cwd = process.env.PWSH_CWD || null;
  res.end(JSON.stringify({ apiBase: '/v1', model, tools: { enabled: tools.length > 0, count: tools.length, names, powershellEnabled, allow, cwd } }));
});

// Resolve tool allowlist from env
function resolveAllowedTools() {
  const allow = (process.env.TOOL_ALLOW || '').trim();
  if (!allow) return TOOL_DEFS;
  const set = new Set(
    allow
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return TOOL_DEFS.filter((t) => set.has(t?.function?.name));
}

// in-memory token bucket for basic per-IP rate limiting
const RATE_PER_MIN = Number(process.env.API_RATE_PER_MIN || '60');
const buckets = new Map();
function rateCheck(ip) {
  if (!RATE_PER_MIN || RATE_PER_MIN <= 0) return true;
  const now = Date.now();
  const key = ip || 'unknown';
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: RATE_PER_MIN, reset: now + 60_000 };
    buckets.set(key, b);
  }
  if (now > b.reset) {
    b.tokens = RATE_PER_MIN;
    b.reset = now + 60_000;
  }
  if (b.tokens <= 0) return false;
  b.tokens -= 1;
  return true;
}

// minimal metrics
const metrics = { totalRequests: 0, totalToolCalls: 0, rateLimited: 0, streamRequests: 0 };

// JSONL audit for tools
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
const auditDir = path.join(process.cwd(), '.forgekeeper');
const auditFile = path.join(auditDir, 'tools_audit.jsonl');
function auditTool(rec) {
  try {
    mkdirSync(auditDir, { recursive: true });
    fs.appendFile(auditFile, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n', () => {});
  } catch {}
}

// Tool-enabled chat orchestration endpoint (non-streaming)
// Body: { messages: OpenAI-like messages, model?: string }
app.post('/api/chat', async (req, res) => {
  try {
    metrics.totalRequests += 1;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
    if (!rateCheck(ip)) {
      metrics.rateLimited += 1;
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
      return;
    }
    const upstreamBase = targetOrigin + '/v1';
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const allowed = resolveAllowedTools();
    const out = await orchestrateWithTools({ baseUrl: upstreamBase, model: mdl, messages, tools: allowed });
    try {
      // accumulate tool metrics + audit
      const diags = out?.debug?.diagnostics || [];
      for (const step of diags) {
        if (Array.isArray(step.tools)) {
          metrics.totalToolCalls += step.tools.length;
          for (const t of step.tools) {
            auditTool({ name: t?.name || null, args: t?.args || null, iter: step.iter || 0, ip });
          }
        }
      }
    } catch {}
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// Admin: runtime toggle for tools (danger: no auth; intended for local dev only)
app.get('/api/tools/config', async (_req, res) => {
  try {
    const powershellEnabled = process.env.FRONTEND_ENABLE_POWERSHELL === '1';
    const allow = (process.env.TOOL_ALLOW || '').trim();
    const cwd = process.env.PWSH_CWD || null;
    res.json({ powershellEnabled, allow, cwd });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

app.post('/api/tools/config', async (req, res) => {
  try {
    const { powershellEnabled, allow, cwd } = req.body || {};
    if (typeof powershellEnabled === 'boolean') {
      process.env.FRONTEND_ENABLE_POWERSHELL = powershellEnabled ? '1' : '0';
    }
    if (typeof allow === 'string') {
      process.env.TOOL_ALLOW = allow;
    }
    if (typeof cwd === 'string' || cwd === null) {
      if (cwd === null || cwd.trim() === '') delete process.env.PWSH_CWD;
      else process.env.PWSH_CWD = cwd;
    }
    res.json({ ok: true, powershellEnabled: process.env.FRONTEND_ENABLE_POWERSHELL === '1', allow: (process.env.TOOL_ALLOW || '').trim(), cwd: process.env.PWSH_CWD || null });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// Proxy endpoints implemented below

// Fallback proxy that forwards any /v1/* request using fetch (supports SSE)
app.all('/v1/*', async (req, res) => {
  try {
    const url = targetOrigin + req.originalUrl;
    const hdrs = {};
    // Pass through common headers
    ['authorization', 'content-type', 'accept'].forEach((k) => {
      if (req.headers[k]) hdrs[k] = req.headers[k];
    });
    const init = { method: req.method, headers: hdrs };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req;
      init.duplex = 'half';
    }
    const upstream = await fetch(url, init);
    res.status(upstream.status);
    // Mirror key headers
    ['content-type', 'cache-control', 'transfer-encoding', 'connection'].forEach((k) => {
      const v = upstream.headers.get(k);
      if (v) res.setHeader(k, v);
    });
    if (upstream.body) {
      // Pipe the web stream to Node response (supports SSE)
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream', message: String(e) });
  }
});

// Explicit health endpoints (in case proxy mount misses)
app.get('/health', async (_req, res) => {
  try {
    const r = await fetch(targetOrigin + '/health');
    res.status(r.status);
    const text = await r.text();
    res.end(text);
  } catch (e) {
    res.status(502).json({ error: 'upstream', message: String(e) });
  }
});
app.get('/healthz', async (_req, res) => {
  try {
    const r = await fetch(targetOrigin + '/healthz');
    if (r.status === 404) {
      // vLLM often exposes only /health
      const r2 = await fetch(targetOrigin + '/health');
      res.status(r2.status).end(await r2.text());
      return;
    }
    res.status(r.status).end(await r.text());
  } catch (e) {
    res.status(502).json({ error: 'upstream', message: String(e) });
  }
});

app.use(express.static(distDir, { index: 'index.html', maxAge: '1h', fallthrough: true }));

app.get('/health-ui', (_req, res) => {
  res.json({ status: 'ok', port, distExists: true, apiProxyTarget: targetOrigin });
});

app.get('/metrics', (_req, res) => {
  res.json(metrics);
});

// Streaming final turn after tool orchestration
// Body: { messages, model }
app.post('/api/chat/stream', async (req, res) => {
  try {
    metrics.streamRequests += 1;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
    if (!rateCheck(ip)) {
      metrics.rateLimited += 1;
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
      return;
    }
    const upstreamBase = targetOrigin + '/v1';
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const allowed = resolveAllowedTools();
    // First: run tool loop non-streaming to produce convo with tool results
    const out = await orchestrateWithTools({ baseUrl: upstreamBase, model: mdl, messages, tools: allowed });
    const convo = Array.isArray(out?.messages) ? out.messages : messages;

    // Now: stream the final turn from upstream
    const url = upstreamBase.replace(/\/$/, '') + '/chat/completions';
    const isIncomplete = (text) => {
      if (!text) return true;
      const t = String(text).trim();
      if (t.length < 32) return true;
      const terminals = '.!?"”’›»}]`';
      const last = t.slice(-1);
      if (!terminals.includes(last)) return true;
      const ticks = (t.match(/```/g) || []).length;
      return (ticks % 2 === 1);
    };
    const body = { model: mdl, messages: convo, temperature: 0.0, stream: true, max_tokens: 1024 };
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => '');
      res.status(502).json({ error: 'upstream', message: txt });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    try {
      res.write('event: fk-orchestration\n');
      res.write('data: ' + JSON.stringify({ messages: convo, debug: out?.debug || null }) + '\n\n');
    } catch {}
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalContent = '';
    // proxy SSE while tracking final content; delay forwarding [DONE]
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          // hold [DONE] until after optional fallback
          continue;
        }
        try {
          const chunk = JSON.parse(data);
          const choice = chunk?.choices?.[0];
          const delta = choice?.delta || {};
          const text = typeof delta.content === 'string' ? delta.content : '';
          if (text) finalContent += text;
        } catch {}
        // forward chunk
        res.write(line + '\n\n');
      }
    }
    // simple heuristic: if no content or extremely short, do a one-shot continuation
    if (isIncomplete(finalContent)) {
      try {
        const contBody = { model: mdl, messages: [...convo, { role: 'user', content: 'Continue.' }], temperature: 0.0, stream: false, max_tokens: 512 };
        const cont = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contBody) });
        if (cont.ok) {
          const j = await cont.json();
          const c = j?.choices?.[0];
          const msg = c?.message || c;
          const appended = (typeof msg?.content === 'string') ? msg.content : (Array.isArray(msg?.content) ? msg.content.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || p?.value || ''))).join('') : '');
          if (appended) {
            // announce continuation to UI
            res.write('event: fk-debug\n');
            res.write('data: ' + JSON.stringify({ continued: true }) + '\n\n');
            const out = { choices: [{ index: 0, delta: { content: appended } }] };
            res.write('data: ' + JSON.stringify(out) + '\n\n');
          }
        }
      } catch {}
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// SPA fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Forgekeeper UI listening on http://0.0.0.0:${port}`);
});


// Tools metadata endpoint for UI discovery/debug
app.get('/api/tools', (_req, res) => {
  try {
    const tools = Array.isArray(TOOL_DEFS) ? TOOL_DEFS : [];
    const names = tools.map(t => t?.function?.name).filter(Boolean);
    res.json({ enabled: tools.length > 0, count: tools.length, names, defs: tools });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

