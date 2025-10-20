import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Lightweight manual proxy; http-proxy-middleware removed to reduce ambiguity
import { Readable } from 'node:stream';
import { orchestrateWithTools } from './server.orchestrator.mjs';
import { getToolDefs, reloadTools, writeToolFile } from './server.tools.mjs';
import { buildHarmonySystem, buildHarmonyDeveloper, toolsToTypeScript, renderHarmonyConversation, renderHarmonyMinimal, extractHarmonyFinalStrict } from './server.harmony.mjs';
import { isProbablyIncomplete as isIncompleteHeuristic, incompleteReason } from './server.finishers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
// Force safe defaults if unset to handle GPT-OSS Harmony mismatch
if (!process.env.FRONTEND_USE_HARMONY) process.env.FRONTEND_USE_HARMONY = '1';
// Enable Harmony tool injection by default (can be disabled by setting to '0')
if (!process.env.FRONTEND_HARMONY_TOOLS) process.env.FRONTEND_HARMONY_TOOLS = '1';

app.use(compression());
// JSON parser only for API routes to avoid interfering with SSE proxying
app.use('/api', express.json({ limit: '1mb' }));
const distDir = path.join(__dirname, 'dist');
const apiBase = process.env.FRONTEND_VLLM_API_BASE || 'http://localhost:8001/v1';
const targetOrigin = apiBase.replace(/\/v1\/?$/, '');
console.log('Proxy target:', targetOrigin);

// Runtime config for the UI
app.get('/config.json', async (_req, res) => {
  const model = process.env.FRONTEND_VLLM_MODEL || 'core';
  res.setHeader('Content-Type', 'application/json');
  const tools = await getToolDefs().catch(() => []);
  const names = Array.isArray(tools) ? tools.map(t => t?.function?.name).filter(Boolean) : [];
  const powershellEnabled = process.env.FRONTEND_ENABLE_POWERSHELL === '1';
  const bashEnabled = process.env.FRONTEND_ENABLE_BASH === '1';
  const httpFetchEnabled = process.env.FRONTEND_ENABLE_HTTP_FETCH === '1';
  const selfUpdateEnabled = process.env.FRONTEND_ENABLE_SELF_UPDATE === '1';
  const allow = (process.env.TOOL_ALLOW || '').trim();
  const cwd = process.env.PWSH_CWD || null;
  // Detect if /app/tools is a separate mount (bind-mounted) and repo mount
  let storage = { path: '/app/tools', bindMounted: false };
  let repo = { root: process.env.REPO_ROOT || '/workspace', bindMounted: false };
  try {
    const s = fs.statSync('/app/tools');
    const p = fs.statSync('/app');
    if (s && p && typeof s.dev === 'number' && typeof p.dev === 'number') {
      storage.bindMounted = s.dev !== p.dev;
    }
  } catch {}
  try {
    const rs = fs.statSync(repo.root);
    const ap = fs.statSync('/app');
    if (rs && ap && typeof rs.dev === 'number' && typeof ap.dev === 'number') {
      repo.bindMounted = rs.dev !== ap.dev;
    }
  } catch {}
  const repoWrite = {
    enabled: process.env.FRONTEND_ENABLE_REPO_WRITE === '1',
    root: repo.root,
    allowed: (process.env.REPO_WRITE_ALLOW || 'frontend/Dockerfile,docker-compose.yml').split(',').map(s => s.trim()).filter(Boolean),
    maxBytes: Number(process.env.REPO_WRITE_MAX_BYTES || 128 * 1024),
  };
  const isGptOss = (s) => { try { const n = String(s||'').toLowerCase(); return n.includes('gpt-oss') || n.includes('gpt_oss') || n.includes('gptoss') || n.includes('oss-') || n.includes('harmony'); } catch { return false; } };
  const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') || isGptOss(model);
  const harmonyToolsEnabled = process.env.FRONTEND_HARMONY_TOOLS === '1';
  const httpFetch = {
    enabled: httpFetchEnabled,
    maxBytes: Number(process.env.HTTP_FETCH_MAX_BYTES || 64 * 1024),
    timeoutMs: Number(process.env.HTTP_FETCH_TIMEOUT_MS || 8000),
  };
  res.end(JSON.stringify({ apiBase: '/v1', model, useHarmony, harmonyToolsEnabled, tools: { enabled: Array.isArray(tools) && tools.length > 0, count: Array.isArray(tools) ? tools.length : 0, names, powershellEnabled, bashEnabled, httpFetchEnabled, selfUpdateEnabled, allow, cwd, storage, repo, repoWrite, httpFetch } }));
});

// Resolve tool allowlist from env
async function resolveAllowedTools() {
  const defs = await getToolDefs().catch(() => []);
  const allow = (process.env.TOOL_ALLOW || '').trim();
  if (!allow) return defs;
  const set = new Set(allow.split(',').map((s) => s.trim()).filter(Boolean));
  return defs.filter((t) => set.has(t?.function?.name));
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
const metrics = { totalRequests: 0, totalToolCalls: 0, rateLimited: 0, streamRequests: 0, continuations: { total: 0, short: 0, punct: 0, fence: 0 }, contHistory: [] };

// JSONL audit for tools
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
const auditDir = path.join(process.cwd(), '.forgekeeper');
const auditFile = path.join(auditDir, 'tools_audit.jsonl');
import { redactPreview, truncatePreview } from './server.guardrails.mjs';
import { appendEvent, tailEvents } from './server.contextlog.mjs';
function auditTool(rec) {
  try {
    mkdirSync(auditDir, { recursive: true });
    const safe = { ...rec };
    if (typeof safe.args === 'object' && safe.args) safe.args = undefined;
    if (safe.args_preview == null && rec.args != null) safe.args_preview = redactPreview(rec.args);
    if (safe.result_preview == null && typeof rec.preview === 'string') safe.result_preview = truncatePreview(rec.preview);
    fs.appendFile(auditFile, JSON.stringify({ ts: new Date().toISOString(), ...safe }) + '\n', () => {});
  } catch {}
}

// Tool-enabled chat orchestration endpoint (non-streaming)
// Body: { messages: OpenAI-like messages, model?: string }
function estimateTokenPlan(messages, fallback) {
  try {
    const hardMax = Number(process.env.FRONTEND_MAX_TOKENS || '4096');
    const hardCont = Number(process.env.FRONTEND_CONT_TOKENS || Math.floor(hardMax * 0.5));
    const msgs = Array.isArray(messages) ? messages : [];
    const firstUser = msgs.find(m => m && m.role === 'user');
    const lastUser = [...msgs].reverse().find(m => m && m.role === 'user');
    const text = String((firstUser && firstUser.content) || '').toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    const longHints = /(novella|chapter|chapters|book|long\s+story|epic|act\s+\d|scene\s+\d)/i.test(text);
    const shortHints = /(summary|tl;dr|brief|concise)/i.test(text);
    const outlineHints = /(outline|bulleted|bullet|list|steps|step-by-step)/i.test(text);
    // Aim high by default; let upstream cap if needed
    let maxOut = hardMax;
    if (shortHints && words < 60) maxOut = Math.min(hardMax, 1536);
    if (outlineHints && !longHints) maxOut = Math.min(hardMax, Math.max(2048, Math.floor(words * 8)));
    let contOut = Math.min(hardMax, Math.max(1024, Math.floor(maxOut * 0.66), hardCont));
    let contMax = longHints ? 4 : 3;
    if (lastUser && /continue\.?$/.test(String(lastUser.content || '').toLowerCase().trim())) contMax = Math.max(contMax, 4);
    return { maxOut, contOut, contMax };
  } catch {
    const hardMax = Number(process.env.FRONTEND_MAX_TOKENS || '4096');
    const hardCont = Number(process.env.FRONTEND_CONT_TOKENS || Math.floor(hardMax * 0.5));
    return fallback || { maxOut: hardMax, contOut: hardCont, contMax: 4 };
  }
}

// Use shared finisher heuristics for both paths

app.post('/api/chat', async (req, res) => {
  try {
    metrics.totalRequests += 1;
    const traceId = crypto.randomUUID();
    const convId = (typeof req.body?.conv_id === 'string' && req.body.conv_id.trim()) ? req.body.conv_id.trim() : null;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
    if (!rateCheck(ip)) {
      metrics.rateLimited += 1;
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    const { messages, model, max_tokens, cont_tokens, cont_attempts, auto_tokens, temperature, top_p, presence_penalty, frequency_penalty } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
      return;
    }
    const upstreamBase = targetOrigin + '/v1';
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const allowed = await resolveAllowedTools();
    const plan = (auto_tokens === true || typeof max_tokens !== 'number') ? estimateTokenPlan(messages) : { maxOut: max_tokens };
    // Optionally inject a short quality hint as a developer note based on recent telemetry
    let preMessages = messages;
    try {
      if (String(process.env.PROMPTING_HINTS_ENABLED || '0') === '1') {
        const stats = getWindowStats(Number(process.env.PROMPTING_HINTS_MINUTES || '10'));
        const hint = buildPromptHints(stats);
        if (hint) {
          preMessages = [...messages];
          // Insert before the last user message
          let lastUser = -1; for (let i = preMessages.length - 1; i >= 0; i--) { if (preMessages[i]?.role === 'user') { lastUser = i; break; } }
          const dev = { role: 'developer', content: hint };
          if (lastUser >= 0) preMessages.splice(lastUser, 0, dev); else preMessages.splice(1, 0, dev);
        }
      }
    } catch {}
    const out = await orchestrateWithTools({
      baseUrl: upstreamBase,
      model: mdl,
      messages: preMessages,
      tools: allowed,
      maxIterations: 4,
      maxTokens: plan.maxOut,
      traceId,
      temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
      topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
      presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
      frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
    });
    if (!out.debug) out.debug = {};
    out.debug.tokenPlan = plan;
    try {
      // accumulate tool metrics + audit
      const diags = out?.debug?.diagnostics || [];
      for (const step of diags) {
        if (Array.isArray(step.tools)) {
          metrics.totalToolCalls += step.tools.length;
          for (const t of step.tools) {
            const argsPrev = redactPreview(t?.args || {});
            const resPrev = truncatePreview(t?.preview || '');
            const rec = { name: t?.name || null, iter: step.iter || 0, ip, ms: t?.ms || null, args_preview: argsPrev, result_preview: resPrev, error: t?.error || null };
            auditTool({ ...rec });
            appendEvent({ actor: 'assistant', act: 'tool_call', conv_id: convId, trace_id: traceId, iter: step.iter || 0, name: t?.name || null, status: t?.error ? 'error' : 'ok', elapsed_ms: t?.ms || null, args_preview: argsPrev, result_preview: resPrev });
          }
        }
        if (step?.autoExecuted) {
          auditTool({ name: step.autoExecuted, iter: step.iter || 0, ip, autoExecuted: true });
          appendEvent({ actor: 'assistant', act: 'tool_call', conv_id: convId, trace_id: traceId, iter: step.iter || 0, name: step.autoExecuted, status: 'ok', auto: true });
        }
      }
    } catch {}
    try {
      if (!out.debug) out.debug = {};
      const content = (typeof out?.assistant?.content === 'string') ? out.assistant.content : '';
      if (content) {
        appendEvent({ actor: 'assistant', act: 'message', conv_id: convId, trace_id: traceId, content_preview: truncatePreview(content), status: 'ok' });
      }
      // Unified incomplete detection + auto continuation (non-stream path)
      let continued = 0;
      const contInfo = [];
      let reason = incompleteReason(content);
      const maxOut = (typeof plan.maxOut === 'number' && plan.maxOut > 0) ? plan.maxOut : Number(process.env.FRONTEND_MAX_TOKENS || '1536');
      const contOut = (typeof cont_tokens === 'number' && cont_tokens > 0)
        ? cont_tokens
        : Number(process.env.FRONTEND_CONT_TOKENS || Math.floor(maxOut * 0.5));
      const envRaw = process.env.FRONTEND_CONT_ATTEMPTS;
      const envDefault = (envRaw == null || String(envRaw).trim() === '') ? 2 : Math.max(0, Math.min(6, Number(envRaw) || 0));
      const reqCont = (typeof cont_attempts === 'number' && cont_attempts >= 0) ? cont_attempts : undefined;
      const contMax = Math.max(0, Math.min(6, (reqCont ?? envDefault)));
      const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') || /gpt[-_]?oss|oss-|harmony/i.test(mdl);
      const url = useHarmony ? (targetOrigin.replace(/\/$/, '') + '/v1/completions') : (upstreamBase.replace(/\/$/, '') + '/chat/completions');
      let finalContent = content || '';
      while (isIncompleteHeuristic(finalContent) && continued < contMax) {
        const started = Date.now();
        try {
          const contBody = useHarmony
            ? { model: mdl, prompt: renderHarmonyMinimal([...Array.isArray(out?.messages) ? out.messages : messages, { role: 'user', content: 'Continue and finish the last sentence. If a code block is open, close it with ```.' }]), max_tokens: contOut, temperature: 0.0, stream: false }
            : { model: mdl, messages: [...(Array.isArray(out?.messages) ? out.messages : messages), { role: 'user', content: 'Continue and finish the last sentence (and close any unfinished code block).' }], max_tokens: contOut, temperature: 0.0, stream: false };
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contBody) });
          if (!r.ok) break;
          const j = await r.json();
          const choice = j?.choices?.[0];
          let appended = '';
          if (useHarmony) appended = String(choice?.text || '');
          else {
            const msg = choice?.message || choice;
            appended = typeof msg?.content === 'string' ? msg.content : (Array.isArray(msg?.content) ? msg.content.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || p?.value || ''))).join('') : '');
          }
          if (!appended) break;
          finalContent += appended;
          out.assistant = out.assistant || {};
          out.assistant.content = finalContent;
          continued += 1;
          const elapsed_ms = Date.now() - started;
          const rsn = reason || incompleteReason(finalContent) || 'incomplete';
          contInfo.push({ attempt: continued, reason: rsn, elapsed_ms, bytes: Buffer.byteLength(appended, 'utf8') });
          appendEvent({ actor: 'assistant', act: 'auto_continue', conv_id: convId, trace_id: traceId, attempt: continued, reason: rsn, elapsed_ms });
        } catch {
          break;
        }
      }
      if (continued > 0) {
        out.debug.continuedTotal = continued;
        out.debug.continuations = contInfo;
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
    const bashEnabled = process.env.FRONTEND_ENABLE_BASH === '1';
    const httpFetchEnabled = process.env.FRONTEND_ENABLE_HTTP_FETCH === '1';
    const allow = (process.env.TOOL_ALLOW || '').trim();
    const cwd = process.env.PWSH_CWD || null;
    const bashCwd = process.env.BASH_CWD || null;
    const httpFetch = {
      enabled: httpFetchEnabled,
      maxBytes: Number(process.env.HTTP_FETCH_MAX_BYTES || 64 * 1024),
      timeoutMs: Number(process.env.HTTP_FETCH_TIMEOUT_MS || 8000),
    };
    res.json({ powershellEnabled, bashEnabled, httpFetchEnabled, httpFetch, allow, cwd, bashCwd });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

app.post('/api/tools/config', async (req, res) => {
  try {
    const { powershellEnabled, bashEnabled, httpFetchEnabled, allow, cwd, bashCwd } = req.body || {};
    if (typeof powershellEnabled === 'boolean') {
      process.env.FRONTEND_ENABLE_POWERSHELL = powershellEnabled ? '1' : '0';
    }
    if (typeof bashEnabled === 'boolean') {
      process.env.FRONTEND_ENABLE_BASH = bashEnabled ? '1' : '0';
    }
    if (typeof httpFetchEnabled === 'boolean') {
      process.env.FRONTEND_ENABLE_HTTP_FETCH = httpFetchEnabled ? '1' : '0';
    }
    if (typeof allow === 'string') {
      process.env.TOOL_ALLOW = allow;
    }
    if (typeof cwd === 'string' || cwd === null) {
      if (cwd === null || cwd.trim() === '') delete process.env.PWSH_CWD;
      else process.env.PWSH_CWD = cwd;
    }
    if (typeof bashCwd === 'string' || bashCwd === null) {
      if (bashCwd === null || bashCwd.trim() === '') delete process.env.BASH_CWD;
      else process.env.BASH_CWD = bashCwd;
    }
    res.json({
      ok: true,
      powershellEnabled: process.env.FRONTEND_ENABLE_POWERSHELL === '1',
      bashEnabled: process.env.FRONTEND_ENABLE_BASH === '1',
      httpFetchEnabled: process.env.FRONTEND_ENABLE_HTTP_FETCH === '1',
      allow: (process.env.TOOL_ALLOW || '').trim(),
      cwd: process.env.PWSH_CWD || null,
      bashCwd: process.env.BASH_CWD || null,
      httpFetch: {
        enabled: process.env.FRONTEND_ENABLE_HTTP_FETCH === '1',
        maxBytes: Number(process.env.HTTP_FETCH_MAX_BYTES || 64 * 1024),
        timeoutMs: Number(process.env.HTTP_FETCH_TIMEOUT_MS || 8000),
      }
    });
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

// Task suggestions — Telemetry‑Driven Task Generator (flag-gated but harmless)
app.get('/api/tasks/suggest', async (req, res) => {
  try {
    const win = Math.max(5, Math.min(480, parseInt(String(req.query.window_min || process.env.TASKGEN_WINDOW_MIN || '60'), 10) || 60));
    const out = suggestTasks(win);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error', message: e?.message || String(e) });
  }
});

// Self-diagnostics endpoint: checks env, mounts, upstream health, tools
app.get('/api/diagnose', async (_req, res) => {
  const results = { ok: true, warnings: [], errors: [], env: {}, mounts: {}, upstream: {}, tools: {}, metrics };
  try {
    results.env = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      FRONTEND_VLLM_API_BASE: process.env.FRONTEND_VLLM_API_BASE || null,
      FRONTEND_VLLM_MODEL: process.env.FRONTEND_VLLM_MODEL || null,
      FRONTEND_ENABLE_POWERSHELL: process.env.FRONTEND_ENABLE_POWERSHELL || '0',
      FRONTEND_ENABLE_BASH: process.env.FRONTEND_ENABLE_BASH || '0',
      REPO_ROOT: process.env.REPO_ROOT || '/workspace',
    };
    const checkMount = (p) => { try { const s = fs.statSync(p); return { exists: true, isDir: s.isDirectory?.() ?? true, dev: s.dev ?? null }; } catch (e) { return { exists: false, error: String(e) }; } };
    const canWrite = (p) => { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; } };
    results.mounts = {
      tools: { path: '/app/tools', ...checkMount('/app/tools'), writable: canWrite('/app/tools') },
      workspace: { path: process.env.REPO_ROOT || '/workspace', ...checkMount(process.env.REPO_ROOT || '/workspace'), writable: canWrite(process.env.REPO_ROOT || '/workspace') },
    };
    try {
      const defs = await getToolDefs().catch(() => []);
      results.tools = { count: Array.isArray(defs) ? defs.length : 0, names: Array.isArray(defs) ? defs.map(d => d?.function?.name).filter(Boolean) : [] };
    } catch {}
    try {
      const hu = await fetch(targetOrigin + '/healthz').catch(() => null);
      if (hu && hu.status !== 404) results.upstream.healthz = { status: hu.status };
      const h = await fetch(targetOrigin + '/health').catch(() => null);
      results.upstream.health = h ? { status: h.status } : { error: 'no_response' };
      const m = await fetch(targetOrigin + '/v1/models').catch(() => null);
      if (m) results.upstream.models = { status: m.status };
    } catch (e) { results.errors.push('Upstream check failed: ' + String(e)); results.ok = false; }
  } catch (e) { results.ok = false; results.errors.push(String(e)); }
  res.json(results);
});

// Self-update routes
app.post('/api/tools/reload', async (_req, res) => {
  try {
    if (process.env.FRONTEND_ENABLE_SELF_UPDATE !== '1') return res.status(403).json({ error: 'forbidden', message: 'Self-update disabled' });
    const out = await reloadTools();
    res.json({ ok: true, count: out.count });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

app.post('/api/tools/write', async (req, res) => {
  try {
    if (process.env.FRONTEND_ENABLE_SELF_UPDATE !== '1') return res.status(403).json({ error: 'forbidden', message: 'Self-update disabled' });
    const { name, code } = req.body || {};
    const info = await writeToolFile(String(name || ''), String(code || ''));
    const out = await reloadTools();
    res.json({ ok: true, path: info.path, loaded: out.count });
  } catch (e) {
    res.status(400).json({ error: 'bad_request', message: e?.message || String(e) });
  }
});

// Harmony debug endpoint: compare raw vs extracted final
app.post('/api/harmony/debug', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const p = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : 'Say exactly: Hello.';
    const rendered = renderHarmonyMinimal([{ role: 'user', content: p }]);
    const url = targetOrigin.replace(/\/$/, '') + '/v1/completions';
    const body = { model: process.env.FRONTEND_VLLM_MODEL || process.env.FRONTEND_MODEL || 'core', prompt: rendered, max_tokens: 128, temperature: Number(process.env.FRONTEND_TEMP || '0.2'), stop: ['<|end|>', '<|channel|>', '<|return|>'] };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const raw = j?.choices?.[0]?.text || '';
    const extracted = extractHarmonyFinalStrict(raw);
    res.json({ rendered, raw: raw?.slice(0, 800) || '', extracted });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// Repo read/write endpoints (dev only) used by the editor panel
function resolveRepoSafe(rel) {
  const base = path.resolve(process.env.REPO_ROOT || '/workspace');
  const full = path.resolve(base, String(rel || '.'));
  const back = path.relative(base, full);
  if (back.startsWith('..') || path.isAbsolute(back)) throw new Error('Path escapes repo root');
  return { base, full };
}

function isRepoWriteAllowed(p) {
  const allow = (process.env.REPO_WRITE_ALLOW || 'frontend/Dockerfile,docker-compose.yml')
    .split(',').map(s => s.trim()).filter(Boolean);
  return allow.includes(p);
}

app.get('/api/repo/read', async (req, res) => {
  try {
    if (process.env.FRONTEND_ENABLE_REPO_WRITE !== '1') return res.status(403).json({ error: 'forbidden', message: 'Repo write disabled' });
    const rel = String(req.query.path || '');
    if (!isRepoWriteAllowed(rel)) return res.status(400).json({ error: 'bad_request', message: 'Path not allowed' });
    const { full } = resolveRepoSafe(rel);
    const data = fs.readFileSync(full, 'utf8');
    res.json({ path: rel, content: data });
  } catch (e) {
    res.status(400).json({ error: 'bad_request', message: e?.message || String(e) });
  }
});

app.post('/api/repo/write', async (req, res) => {
  try {
    if (process.env.FRONTEND_ENABLE_REPO_WRITE !== '1') return res.status(403).json({ error: 'forbidden', message: 'Repo write disabled' });
    const rel = String(req.body?.path || '');
    const content = String(req.body?.content || '');
    if (!isRepoWriteAllowed(rel)) return res.status(400).json({ error: 'bad_request', message: 'Path not allowed' });
    const maxBytes = Number(process.env.REPO_WRITE_MAX_BYTES || 128 * 1024);
    if (Buffer.byteLength(content, 'utf8') > maxBytes) return res.status(400).json({ error: 'bad_request', message: `Content exceeds limit (${maxBytes} bytes)` });
    const { full } = resolveRepoSafe(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    res.json({ ok: true, path: rel, bytes: Buffer.byteLength(content, 'utf8') });
  } catch (e) {
    res.status(400).json({ error: 'bad_request', message: e?.message || String(e) });
  }
});

// Streaming final turn after tool orchestration
// Body: { messages, model }
app.post('/api/chat/stream', async (req, res) => {
  try {
    metrics.streamRequests += 1;
    const traceId = crypto.randomUUID();
    const convId = (typeof req.body?.conv_id === 'string' && req.body.conv_id.trim()) ? req.body.conv_id.trim() : null;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
    if (!rateCheck(ip)) {
      metrics.rateLimited += 1;
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
      return;
    }
    const { messages, model, max_tokens, cont_tokens, cont_attempts, auto_tokens, temperature, top_p, presence_penalty, frequency_penalty } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
      return;
    }
    const upstreamBase = targetOrigin + '/v1';
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const allowed = await resolveAllowedTools();
    // First: run tool loop non-streaming to produce convo with tool results
    const plan = (auto_tokens === true || typeof max_tokens !== 'number') ? estimateTokenPlan(messages) : { maxOut: max_tokens, contOut: cont_tokens, contMax: cont_attempts };
    const out = await orchestrateWithTools({
      baseUrl: upstreamBase,
      model: mdl,
      messages,
      tools: allowed,
      maxIterations: 4,
      maxTokens: plan.maxOut,
      traceId,
      temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
      topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
      presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
      frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
    });
    const convo = Array.isArray(out?.messages) ? out.messages : preMessages;

    // Now: stream the final turn from upstream (or fallback to Harmony non-stream)
    const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') || /gpt[-_]?oss|oss-|harmony/i.test(mdl);
    const url = useHarmony ? (targetOrigin.replace(/\/$/, '') + '/v1/completions') : (upstreamBase.replace(/\/$/, '') + '/chat/completions');
    const isIncomplete = (text) => isIncompleteHeuristic(text);
    const maxOut = (typeof plan.maxOut === 'number' && plan.maxOut > 0) ? plan.maxOut : 1536;
    const contOut = (typeof plan.contOut === 'number' && plan.contOut > 0)
      ? plan.contOut
      : Number(process.env.FRONTEND_CONT_TOKENS || '1024');
    const envRaw = process.env.FRONTEND_CONT_ATTEMPTS;
    const envDefault = (envRaw == null || String(envRaw).trim() === '') ? 2 : Math.max(0, Math.min(6, Number(envRaw) || 0));
    const reqCont = (typeof plan.contMax === 'number' && plan.contMax >= 0) ? plan.contMax : undefined;
    const contMax = Math.max(0, Math.min(6, (reqCont ?? envDefault)));
    if (useHarmony) {
      // Render via orchestrator non-stream and emit fk-final
      const nonStream = await orchestrateWithTools({ baseUrl: upstreamBase, model: mdl, messages: convo, tools: [], maxIterations: 1, maxTokens: maxOut });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      try {
        const debug = nonStream?.debug || {};
        res.write('event: fk-orchestration\n');
        res.write('data: ' + JSON.stringify({ messages: nonStream?.messages || messages, debug }) + '\n\n');
        const content = typeof nonStream?.assistant?.content === 'string' ? nonStream.assistant.content : '';
        const reasoning = typeof nonStream?.assistant?.reasoning === 'string' ? nonStream.assistant.reasoning : null;
        res.write('event: fk-final\n');
        res.write('data: ' + JSON.stringify({ content, reasoning }) + '\n\n');
      } catch {}
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    const body = {
      model: mdl,
      messages: convo,
      temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : Number(process.env.FRONTEND_TEMP || '0.0'),
      top_p: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : Number(process.env.FRONTEND_TOP_P || '0.4'),
      presence_penalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : Number(process.env.FRONTEND_PRESENCE_PENALTY || '0.0'),
      frequency_penalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : Number(process.env.FRONTEND_FREQUENCY_PENALTY || '0.2'),
      stream: true,
      max_tokens: maxOut,
    };
    if (!useHarmony) {
      body.stop = ['\nUSER:', '\nUser:', '\nASSISTANT:', '\nAssistant:'];
    }
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
    // Prepare orchestration payload; emit after first delta to avoid confusing simple SSE clients
    let sentOrchestration = false;
    let orchestrationPayload = null;
    try {
      const debug = out?.debug || {};
      debug.tokenPlan = { maxOut, contOut, contMax };
      orchestrationPayload = { messages: convo, debug };
    } catch {}
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalContent = '';
    let finalReasoning = '';
    const extractPartText = (part) => {
      if (!part) return '';
      if (typeof part === 'string') return part;
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      if (typeof part.value === 'string') return part.value;
      return '';
    };
    const extractDelta = (choice) => {
      // Normalize upstream chunk into separate reasoning/content strings
      try {
        const d = choice?.delta || {};
        let r = '';
        let c = '';
        if (typeof d.reasoning_content === 'string') r += d.reasoning_content;
        else if (Array.isArray(d.reasoning_content)) r += d.reasoning_content.map(extractPartText).join('');
        if (typeof d.content === 'string') c += d.content;
        else if (Array.isArray(d.content)) c += d.content.map(extractPartText).join('');
        // Some providers place text at choice level
        if (!r && !c) {
          const msg = choice?.message || {};
          if (typeof msg?.reasoning_content === 'string') r += msg.reasoning_content;
          else if (Array.isArray(msg?.reasoning_content)) r += msg.reasoning_content.map(extractPartText).join('');
          if (typeof msg?.content === 'string') c += msg.content;
          else if (Array.isArray(msg?.content)) c += msg.content.map(extractPartText).join('');
        }
        // Fallback to completions-style `text`
        if (!r && !c && typeof choice?.text === 'string') c = choice.text;
        return { r, c };
      } catch { return { r: '', c: '' }; }
    };
    // proxy SSE while tracking final content; normalize deltas if needed
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
        if (data === '[DONE]') { continue; }
        try {
          const chunk = JSON.parse(data);
          const choice = chunk?.choices?.[0];
          const { r, c } = extractDelta(choice);
          if (r) finalReasoning += r;
          if (c) finalContent += c;
          if (r || c) {
            if (!sentOrchestration && orchestrationPayload) {
              try {
                res.write('event: fk-orchestration\n');
                res.write('data: ' + JSON.stringify(orchestrationPayload) + '\n\n');
              } catch {}
              sentOrchestration = true;
            }
            const delta = {};
            if (r) delta.reasoning_content = r;
            if (c) delta.content = c;
            const out = { choices: [{ index: (choice?.index ?? 0), delta }] };
            res.write('data: ' + JSON.stringify(out) + '\n\n');
          } else {
            // Pass through other events untouched (e.g., tool_calls)
            res.write(line + '\n\n');
          }
        } catch {
          res.write(line + '\n\n');
        }
      }
    }
    // If the upstream produced no deltas, still emit orchestration once
    if (!sentOrchestration && orchestrationPayload) {
      try {
        res.write('event: fk-orchestration\n');
        res.write('data: ' + JSON.stringify(orchestrationPayload) + '\n\n');
      } catch {}
      sentOrchestration = true;
    }
    // Heuristic continuation loop: try additional turns if incomplete
    let attempts = 0;
    const contInfo = [];
    while (isIncomplete(finalContent) && attempts < contMax) {
      try {
        const contBody = { model: mdl, messages: [...convo, { role: 'user', content: 'Continue and finish the last sentence (and close any unfinished code block).' }], temperature: 0.0, stream: false, max_tokens: contOut };
        const cont = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contBody) });
        if (!cont.ok) break;
        const j = await cont.json();
        const c = j?.choices?.[0];
        const msg = c?.message || c;
        const appended = (typeof msg?.content === 'string') ? msg.content : (Array.isArray(msg?.content) ? msg.content.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || p?.value || ''))).join('') : '');
        if (!appended) break;
        // announce continuation and stream the appended chunk
        const rsn = incompleteReason(finalContent) || 'incomplete';
        res.write('event: fk-debug\n');
        res.write('data: ' + JSON.stringify({ continued: true, reason: rsn, attempt: attempts + 1 }) + '\n\n');
        const out = { choices: [{ index: 0, delta: { content: appended } }] };
        res.write('data: ' + JSON.stringify(out) + '\n\n');
        finalContent += appended;
        attempts += 1;
        contInfo.push({ attempt: attempts, reason: rsn });
        try { appendEvent({ actor: 'assistant', act: 'auto_continue', conv_id: convId, trace_id: traceId, attempt: attempts, reason: rsn }); } catch {}
        try { metrics.continuations.total += 1; if (metrics.continuations[rsn] != null) metrics.continuations[rsn] += 1; metrics.contHistory.push({ t: Date.now(), reason: rsn }); if (metrics.contHistory.length > 300) metrics.contHistory.splice(0, metrics.contHistory.length - 300); } catch {}
        try { metrics.continuations.total += 1; if (metrics.continuations[rsn] != null) metrics.continuations[rsn] += 1; metrics.contHistory.push({ t: Date.now(), reason: rsn }); if (metrics.contHistory.length > 300) metrics.contHistory.splice(0, metrics.contHistory.length - 300); } catch {}
        try { metrics.continuations.total += 1; if (metrics.continuations[rsn] != null) metrics.continuations[rsn] += 1; } catch {}
        try { metrics.continuations.total += 1; if (metrics.continuations[rsn] != null) metrics.continuations[rsn] += 1; } catch {}
      } catch {
        break;
      }
    }
    try {
      // Emit a final normalized event as a safety net for clients
      const debug = orchestrationPayload?.debug || {};
      if (attempts > 0) {
        try { debug.continuedTotal = attempts; debug.continuations = contInfo; } catch {}
      }
      res.write('event: fk-final\n');
      res.write('data: ' + JSON.stringify({ content: finalContent || null, reasoning: finalReasoning || null, debug }) + '\n\n');
      const final = (finalContent || '').trim();
      if (final) appendEvent({ actor: 'assistant', act: 'message', conv_id: convId, trace_id: traceId, content_preview: truncatePreview(final), status: 'ok' });
    } catch {}
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// Tail ContextLog (dev only)
app.get('/api/ctx/tail', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(500, parseInt(String(req.query.n || '50'), 10) || 50));
    const conv = String(req.query.conv_id || '').trim() || null;
    const rows = tailEvents(n, conv);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error', message: e?.message || String(e) });
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

// Tail tool audit for debugging (dev only)
app.get('/api/tools/audit', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(Number(req.query?.n || 50), 500));
    const text = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const last = lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    res.json({ count: last.length, items: last });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

