import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Lightweight manual proxy; http-proxy-middleware removed to reduce ambiguity
import { Readable } from 'node:stream';
import { orchestrateWithTools } from './server.orchestrator.mjs';

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
console.log('Proxy middleware type:', typeof createProxyMiddleware);

// Runtime config for the UI
app.get('/config.json', (_req, res) => {
  const model = process.env.FRONTEND_VLLM_MODEL || 'core';
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ apiBase: '/v1', model }));
});

// Tool-enabled chat orchestration endpoint (non-streaming)
// Body: { messages: OpenAI-like messages, model?: string }
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
      return;
    }
    const upstreamBase = targetOrigin + '/v1';
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const out = await orchestrateWithTools({ baseUrl: upstreamBase, model: mdl, messages });
    res.json(out);
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

// SPA fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Forgekeeper UI listening on http://0.0.0.0:${port}`);
});
