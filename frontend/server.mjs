import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Lightweight manual proxy; http-proxy-middleware removed to reduce ambiguity
import { Readable } from 'node:stream';
import { orchestrateWithTools } from './server.orchestrator.mjs';
import { orchestrateWithReview } from './server.review.mjs';
import { orchestrateChunked } from './server.chunked.mjs';
import { getToolDefs, reloadTools, writeToolFile, getToolErrorStats, getAllToolErrorStats, clearToolErrors, getToolRegressionStats, getAllToolRegressionStats, clearToolRegressionStats, getToolResourceUsage, getAllToolResourceUsage, clearToolResourceUsage } from './server.tools.mjs';
import { buildHarmonySystem, buildHarmonyDeveloper, toolsToTypeScript, renderHarmonyConversation, renderHarmonyMinimal, extractHarmonyFinalStrict } from './server.harmony.mjs';
import { isProbablyIncomplete as isIncompleteHeuristic, incompleteReason } from './server.finishers.mjs';
import { getReviewConfig } from './config/review_prompts.mjs';
import { getChunkedConfig, shouldTriggerChunking } from './config/chunked_prompts.mjs';
// Enhanced Features Integration (Phase 1-3)
import { setupEnhancedFeatures, getEnhancedOrchestrator } from './server.enhanced-integration.mjs';
import { createAutonomousAgent } from './core/agent/autonomous.mjs';
import { createExecutor } from './core/tools/executor.mjs';
import { createSessionMemory } from './core/agent/session-memory.mjs'; // [Day 10]
import { UserPreferenceSystem } from './core/agent/user-preferences.mjs'; // [Phase 5 Option D]
import { createEpisodicMemory } from './core/agent/episodic-memory.mjs'; // [Phase 5 Option A]
import { createPatternLearner } from './core/agent/pattern-learner.mjs'; // [T310]
import { createResilientLLMClient } from './core/agent/resilient-llm-client.mjs'; // LLM retry with health checks
import fs2 from 'node:fs/promises'; // [Day 10] For checkpoint file operations
import tasksRouter from './server.tasks.mjs'; // TGT Task API router
import * as autoPR from './server.auto-pr.mjs'; // SAPL (Safe Auto-PR Loop)
import * as promptingHints from './server.prompting-hints.mjs'; // MIP (Metrics-Informed Prompting)
import { runThoughtWorld } from './server.thought-world.mjs'; // Multi-agent consensus mode

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tool approval storage (codex.plan Phase 1, T203)
// Maps tool_name -> { code, timestamp, approved: false }
const pendingTools = new Map();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
// Force safe defaults if unset to handle GPT-OSS Harmony mismatch
if (!process.env.FRONTEND_USE_HARMONY) process.env.FRONTEND_USE_HARMONY = '1';
// Enable Harmony tool injection by default (can be disabled by setting to '0')
if (!process.env.FRONTEND_HARMONY_TOOLS) process.env.FRONTEND_HARMONY_TOOLS = '1';

app.use(compression());

// Setup enhanced features (Phase 1-3) - async initialization
(async () => {
  try {
    await setupEnhancedFeatures(app);
  } catch (error) {
    console.error('[Enhanced Features] Failed to initialize:', error);
  }
})();

// JSON parser only for API routes to avoid interfering with SSE proxying
app.use('/api', express.json({ limit: '1mb' }));

// Mount TGT Task API router (Week 6-9 implementation)
app.use('/api/tasks', tasksRouter);

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
  // M2: Self-review and chunked reasoning feature flags
  const reviewConfig = getReviewConfig();
  const reviewEnabled = reviewConfig.enabled;
  const chunkedEnabled = (process.env.FRONTEND_ENABLE_CHUNKED || '0') === '1';
  res.end(JSON.stringify({ apiBase: '/v1', model, useHarmony, harmonyToolsEnabled, reviewEnabled, chunkedEnabled, tools: { enabled: Array.isArray(tools) && tools.length > 0, count: Array.isArray(tools) ? tools.length : 0, names, powershellEnabled, bashEnabled, httpFetchEnabled, selfUpdateEnabled, allow, cwd, storage, repo, repoWrite, httpFetch } }));
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
const metrics = { totalRequests: 0, totalToolCalls: 0, rateLimited: 0, streamRequests: 0, continuations: { total: 0, short: 0, punct: 0, fence: 0 }, contHistory: [], circuit: { failures: 0 } };

// JSONL audit for tools
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
const auditDir = path.join(process.cwd(), '.forgekeeper');
const auditFile = path.join(auditDir, 'tools_audit.jsonl');
import { redactPreview, truncatePreview } from './server.guardrails.mjs';
import { appendEvent, tailEvents } from './server.contextlog.mjs';
import { execSync } from 'node:child_process';
import { suggestTasks, buildPromptHints, getWindowStats } from './server.taskgen.mjs';
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

// Secrets storage (local dev only). Tokens are never logged.
const secretsDir = path.join(process.cwd(), '.forgekeeper', 'secrets');
const ghTokenFile = path.join(secretsDir, 'gh_token');
function readGhToken() {
  try { if (fs.existsSync(ghTokenFile)) return fs.readFileSync(ghTokenFile, 'utf8').trim(); }
  catch {}
  return null;
}
function writeGhToken(tok) {
  try { fs.mkdirSync(secretsDir, { recursive: true }); fs.writeFileSync(ghTokenFile, String(tok), { encoding: 'utf8', mode: 0o600 }); return true; } catch { return false; }
}

// Optional upstream circuit-breaker stub (flag-gated)
const circuit = (() => {
  const enabled = () => String(process.env.UPSTREAM_CB_ENABLED || '0') === '1';
  let fails = [];
  let openUntil = 0;
  const now = () => Date.now();
  const windowMs = () => Number(process.env.UPSTREAM_CB_WINDOW_MS || 30000);
  const threshold = () => Math.max(1, Number(process.env.UPSTREAM_CB_THRESHOLD || 3));
  const openMs = () => Number(process.env.UPSTREAM_CB_OPEN_MS || 20000);
  function prune() { const t = now(); fails = fails.filter(ts => t - ts <= windowMs()); metrics.circuit.failures = fails.length; }
  return {
    enabled,
    isOpen() { return enabled() && now() < openUntil; },
    noteFailure(where, status) { try { const t = now(); fails.push(t); prune(); if (fails.length >= threshold()) openUntil = t + openMs(); appendEvent({ actor: 'assistant', act: 'circuit', event: 'failure', where, status, opens_ms: Math.max(0, openUntil - t) }); } catch {} },
    noteSuccess() { prune(); },
    info() { prune(); return { enabled: enabled(), open: this.isOpen(), failures: fails.length, openUntil, windowMs: windowMs(), threshold: threshold(), openMs: openMs() }; },
  };
})();

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
    if (circuit.isOpen()) {
      const inf = circuit.info();
      res.setHeader('Retry-After', Math.ceil(Math.max(0, (inf.openUntil - Date.now())) / 1000));
      return res.status(503).json({ error: 'circuit_open', retry_after_ms: Math.max(0, inf.openUntil - Date.now()) });
    }
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
    // Determine which orchestrator to use
    const useEnhanced = process.env.FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR === '1';
    const enhancedOrchestrator = useEnhanced ? await getEnhancedOrchestrator() : null;

    // M2: Use review orchestrator if enabled
    const reviewConfig = getReviewConfig();
    // M2: Use chunked orchestrator if enabled
    const chunkedConfig = getChunkedConfig();
    const lastUserMsg = [...preMessages].reverse().find(m => m?.role === 'user');
    const lastContent = String(lastUserMsg?.content || '');
    const reviewContext = {
      question: lastContent,
      response: null, // Will be filled after initial generation
      error: false,
      hasError: false,
      tools: allowed, // Pass tools array so review mode can decide based on tool availability
    };
    const chunkedContext = {
      question: lastContent,
      expectedTokens: plan.maxOut,
      maxTokens: plan.maxOut,
      tools: allowed,
    };

    // Determine if chunking should be triggered
    const useChunked = chunkedConfig.enabled && shouldTriggerChunking(chunkedContext, chunkedConfig) && (!allowed || allowed.length === 0);

    // Choose orchestrator: Enhanced > Chunked > Review > Standard
    let out;
    if (enhancedOrchestrator && useEnhanced) {
      out = await enhancedOrchestrator({
        baseUrl: upstreamBase,
        model: mdl,
        messages: preMessages,
        tools: allowed,
        maxIterations: 4,
        maxTokens: plan.maxOut,
        temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
        topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
        presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
        frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
        traceId,
        convId,
        enablePhase1: true,
        enablePhase3: process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1',
      });
    } else if (useChunked) {
      // Use chunked orchestration for long text-only responses
      console.log('[server] Using chunked orchestration');
      out = await orchestrateChunked({
        baseUrl: upstreamBase,
        model: mdl,
        messages: preMessages,
        maxTokens: chunkedConfig.tokensPerChunk,
        convId,
        traceId,
        config: chunkedConfig,
      });
    } else if (reviewConfig.enabled) {
      out = await orchestrateWithReview({
        orchestrator: orchestrateWithTools,
        baseUrl: upstreamBase,
        model: mdl,
        messages: preMessages,
        tools: allowed,
        maxIterations: 4,
        maxTokens: plan.maxOut,
        traceId,
        convId,
        temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
        topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
        presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
        frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
        context: reviewContext,
      });
    } else {
      out = await orchestrateWithTools({
        baseUrl: upstreamBase,
        model: mdl,
        messages: preMessages,
        tools: allowed,
        maxIterations: 4,
        maxTokens: plan.maxOut,
        traceId,
        convId,
        tailEventsFn: tailEvents,
        appendEventFn: appendEvent,
        temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
        topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
        presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
        frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
      });
    }
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
    try { appendEvent({ actor: 'assistant', act: 'upstream_error', where: 'chat_nonstream', message: e?.message || String(e) }); } catch {}
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
    try { circuit.noteFailure('chat_nonstream', 500); } catch {}
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
    try { appendEvent({ actor: 'assistant', act: 'upstream_error', where: 'proxy_v1', message: String(e) }); } catch {}
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
    try { appendEvent({ actor: 'assistant', act: 'upstream_error', where: 'health', message: String(e) }); } catch {}
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
    try { appendEvent({ actor: 'assistant', act: 'upstream_error', where: 'healthz', message: String(e) }); } catch {}
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


// DEPRECATED: Task suggestions endpoint moved to server.tasks.mjs router
// The mounted router (line 54) provides comprehensive TGT implementation with Week 6-9 features.
// This old endpoint is kept commented for reference.
/*
app.get('/api/tasks/suggest', async (req, res) => {
  try {
    const enabled = String(process.env.TASKGEN_ENABLED || '0') === '1';
    if (!enabled) return res.status(403).json({ ok: false, error: 'disabled' });
    const win = Math.max(5, Math.min(480, parseInt(String(req.query.window_min || process.env.TASKGEN_WINDOW_MIN || '60'), 10) || 60));
    const out = suggestTasks(win);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error', message: e?.message || String(e) });
  }
});
*/

// Auto‑PR preview (allowlist enforcement; dry‑run default)
app.post('/api/auto_pr/preview', async (req, res) => {
  try {
    const enabled = String(process.env.AUTO_PR_ENABLED || '0') === '1';
    const dryrun = String(process.env.AUTO_PR_DRYRUN || '1') === '1';
    const allow = (process.env.AUTO_PR_ALLOW || 'README.md,docs/,forgekeeper/.env.example,frontend/test/').split(',').map(s=>s.trim()).filter(Boolean);
    const { title, body, files, edits, labels } = req.body || {};
    const requested = Array.isArray(files) ? files.map(String) : [];
    const allowed = requested.filter(p => allow.some(rule => p === rule || p.startsWith(rule)));
    const blocked = requested.filter(p => !allowed.includes(p));
    const envLabels = (process.env.AUTO_PR_LABELS || 'docs').split(',').map(s=>s.trim()).filter(Boolean);
    const reqLabels = Array.isArray(labels) ? labels.map(String) : [];
    const lbls = [...new Set([...envLabels, ...reqLabels])].filter(Boolean);
    const appendPreviews = [];
    try {
      if (Array.isArray(edits)) {
        for (const ed of edits) {
          const p = String(ed?.path || '');
          const text = String(ed?.appendText || '');
          if (!p || !text) continue;
          if (!allow.some(rule => p === rule || p.startsWith(rule))) continue;
          // Build a tiny unified diff preview using last 50 lines of current file (if exists)
          let beforeTail = '';
          let beforeLines = [];
          try {
            const full = path.resolve(process.env.REPO_ROOT || '/workspace', p);
            if (fs.existsSync(full)) {
              const data = fs.readFileSync(full, 'utf8');
              const all = data.split(/\r?\n/);
              beforeLines = all.slice(Math.max(0, all.length - 50));
              beforeTail = beforeLines.join('\n');
            }
          } catch {}
          const preview = text.slice(0, 400);
          const appendedLines = text.split(/\r?\n/);
          const header = `--- a/${p}\n+++ b/${p}\n@@ append @@`;
          const context = beforeLines.map(l=>` ${l}`).join('\n');
          const adds = appendedLines.map(l=>`+${l}`).join('\n');
          const diff = `${header}\n${context}${context? '\n' : ''}${adds}`;
          appendPreviews.push({ path: p, bytes: Buffer.byteLength(text, 'utf8'), preview, diff });
        }
      }
    } catch {}
    res.json({ ok: true, enabled, dryrun, preview: { title: String(title||'Update docs'), body: String(body||'Generated by TGT'), files: allowed, labels: lbls, appendPreviews }, blocked });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error', message: e?.message || String(e) });
  }
});

// Auto‑PR create (flag‑gated). Supports committing existing changes in allowed files, or simple append edits.
app.post('/api/auto_pr/create', async (req, res) => {
  try {
    const enabled = String(process.env.AUTO_PR_ENABLED || '0') === '1';
    const dryrun = String(process.env.AUTO_PR_DRYRUN || '1') === '1';
    if (!enabled || dryrun) return res.status(403).json({ ok: false, error: 'disabled' });
    const allow = (process.env.AUTO_PR_ALLOW || 'README.md,docs/,forgekeeper/.env.example,frontend/test/').split(',').map(s=>s.trim()).filter(Boolean);
    const repoRoot = process.env.REPO_ROOT || '/workspace';
    const { title, body, files, edits, labels } = req.body || {};
    const requested = Array.isArray(files) ? files.map(String) : [];
    const allowed = requested.filter(p => allow.some(rule => p === rule || p.startsWith(rule)));
    const blocked = requested.filter(p => !allowed.includes(p));
    if (blocked.length > 0) return res.status(400).json({ ok: false, error: 'blocked_files', blocked });
    // Ensure git identity to avoid commit failures
    try { execSync('git config user.email', { cwd: repoRoot, stdio: 'pipe' }); } catch { try { execSync('git config user.email "sapl@example.local"', { cwd: repoRoot, stdio: 'pipe' }); } catch {} }
    try { execSync('git config user.name', { cwd: repoRoot, stdio: 'pipe' }); } catch { try { execSync('git config user.name "Forgekeeper SAPL"', { cwd: repoRoot, stdio: 'pipe' }); } catch {} }
    // Attempt GitHub CLI auth if GH_TOKEN present and not set up
    try {
      const hasGh = execSync('which gh || true', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
      if (hasGh) {
        try { execSync('gh auth status -t', { cwd: repoRoot, stdio: 'pipe' }); }
        catch {
          let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
          if (!token) token = readGhToken() || '';
          if (token) {
            try { execSync('echo "$GH_TOKEN" | gh auth login --with-token --hostname github.com --git-protocol https', { cwd: repoRoot, stdio: 'pipe', env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token } }); } catch {}
            try { execSync('gh auth setup-git', { cwd: repoRoot, stdio: 'pipe' }); } catch {}
          }
        }
      }
    } catch {}
    // Apply simple append edits if provided
    try {
      if (Array.isArray(edits)) {
        for (const ed of edits) {
          const p = String(ed?.path || '');
          const text = String(ed?.appendText || '');
          if (!p || !text) continue;
          if (!allow.some(rule => p === rule || p.startsWith(rule))) continue;
          const full = path.resolve(repoRoot, p);
          const back = path.relative(repoRoot, full);
          if (back.startsWith('..') || path.isAbsolute(back)) continue;
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.appendFileSync(full, (text.startsWith('\n') ? '' : '\n') + text, 'utf8');
        }
      }
    } catch {}
    // Create branch, commit, push, open PR
    const branch = `sapl/${Date.now().toString(36)}`;
    const run = (cmd) => execSync(cmd, { cwd: repoRoot, stdio: 'pipe' }).toString();
    let prUrl = null; let prNum = null; let stdout = '';
    try {
      stdout += run(`git checkout -b ${branch}`);
      if (allowed.length > 0) stdout += run(`git add ${allowed.map(s=>`"${s}"`).join(' ')}`);
      // If nothing added, try a generic add of allowlist paths to catch edits
      stdout += run('git status --porcelain');
      const status = stdout;
      if (!/^(A|M|R|D)/m.test(status)) {
        return res.status(400).json({ ok: false, error: 'no_changes' });
      }
      stdout += run(`git commit -m ${JSON.stringify(String(title||'Update docs'))}`);
      try { stdout += run('git push -u origin HEAD'); }
      catch (pushErr) {
        try { run('gh auth setup-git'); } catch {}
        try { stdout += run('git push -u origin HEAD'); }
        catch (e2) { return res.status(500).json({ ok: false, error: 'push_failed', message: String(e2) }); }
      }
    // Create PR via gh (if available)
    try { run('gh --version'); } catch { return res.json({ ok: true, branch, pushed: true, pr: null, message: 'gh not available; branch pushed' }); }
    const envLabels = (process.env.AUTO_PR_LABELS || 'docs').split(',').map(s=>s.trim()).filter(Boolean);
    const reqLabels = Array.isArray(labels) ? labels.map(String) : [];
    const merged = [...new Set([...envLabels, ...reqLabels])].filter(Boolean);
    const createCmd = `gh pr create --base main --title ${JSON.stringify(String(title||'Update docs'))} --body ${JSON.stringify(String(body||'Generated by TGT'))} ${merged.length?('--label '+merged.map(l=>JSON.stringify(l)).join(' ')) : ''}`;
    const prOut = run(createCmd);
      // Try to parse number from output
      const m = prOut.match(/\/pull\/(\d+)/) || prOut.match(/#(\d+)/);
      prNum = m ? Number(m[1]) : null;
      prUrl = (prOut.match(/https?:\/\/\S+/) || [null])[0];
      // Auto-merge if flagged
      if (String(process.env.AUTO_PR_AUTOMERGE || '0') === '1' && prNum) {
        try { run(`gh pr merge --merge --auto --delete-branch ${prNum}`); } catch {}
      }
      appendEvent({ actor: 'assistant', act: 'auto_pr', branch, files: allowed, pr_url: prUrl, pr_num: prNum });
      res.json({ ok: true, branch, pr_url: prUrl, pr_num: prNum });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'auto_pr_failed', message: e?.message || String(e), stdout });
    }
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
    try { results.circuit = circuit.info(); } catch {}
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

// Tool Approval System (codex.plan Phase 1, T203)
// POST /api/tools/propose - Preview tool before writing (requires approval)
app.post('/api/tools/propose', async (req, res) => {
  try {
    const { tool_name, code } = req.body || {};

    if (!tool_name || typeof tool_name !== 'string') {
      return res.status(400).json({ error: 'tool_name is required and must be a string' });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required and must be a string' });
    }

    // Validate tool name format (must end with .mjs)
    if (!/^[a-z0-9_\-]+\.mjs$/.test(tool_name)) {
      return res.status(400).json({
        error: 'Invalid tool name format',
        message: 'Tool name must match pattern: [a-z0-9_-]+.mjs (e.g., my_tool.mjs)'
      });
    }

    // Store pending tool
    pendingTools.set(tool_name, {
      code,
      timestamp: Date.now(),
      approved: false
    });

    res.json({
      ok: true,
      message: `Tool ${tool_name} proposed. Awaiting approval.`,
      tool_name,
      preview: code.slice(0, 500) + (code.length > 500 ? '\n... (truncated)' : ''),
      approval_endpoint: `/api/tools/approve/${tool_name}`,
      pending_count: pendingTools.size
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// POST /api/tools/approve/:tool_name - Approve and write tool
app.post('/api/tools/approve/:tool_name', async (req, res) => {
  try {
    const { tool_name } = req.params;
    const pending = pendingTools.get(tool_name);

    if (!pending) {
      return res.status(404).json({
        error: 'not_found',
        message: `No pending tool with name: ${tool_name}`,
        pending_tools: Array.from(pendingTools.keys())
      });
    }

    // Mark approved
    pending.approved = true;

    // Write tool file
    const info = await writeToolFile(tool_name, pending.code);

    // Reload tools
    const out = await reloadTools();

    // Remove from pending
    pendingTools.delete(tool_name);

    res.json({
      ok: true,
      message: `Tool ${tool_name} approved and written`,
      tool_name,
      path: info.path,
      loaded: out.count,
      remaining_pending: pendingTools.size
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/pending - List pending tool approvals
app.get('/api/tools/pending', async (_req, res) => {
  try {
    const pending = Array.from(pendingTools.entries()).map(([name, data]) => ({
      name,
      timestamp: data.timestamp,
      age_ms: Date.now() - data.timestamp,
      preview: data.code.slice(0, 200) + (data.code.length > 200 ? '\n... (truncated)' : ''),
      approved: data.approved,
      approval_endpoint: `/api/tools/approve/${name}`
    }));

    res.json({
      ok: true,
      pending,
      count: pending.length
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/errors - Get tool error statistics (codex.plan Phase 1, T205)
app.get('/api/tools/errors', async (_req, res) => {
  try {
    const stats = getAllToolErrorStats();
    const threshold = parseInt(process.env.TOOL_ERROR_THRESHOLD || '3', 10);
    const window_ms = parseInt(process.env.TOOL_ERROR_WINDOW_MS || '300000', 10);

    res.json({
      ok: true,
      threshold,
      window_ms,
      tools: stats,
      count: stats.length
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/errors/:tool_name - Get error stats for specific tool (codex.plan Phase 1, T205)
app.get('/api/tools/errors/:tool_name', async (req, res) => {
  try {
    const { tool_name } = req.params;
    const stats = getToolErrorStats(tool_name);

    if (!stats) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: `No error statistics found for tool: ${tool_name}`
      });
    }

    res.json({
      ok: true,
      tool: tool_name,
      ...stats
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// POST /api/tools/errors/:tool_name/clear - Clear error stats for a tool (codex.plan Phase 1, T205)
app.post('/api/tools/errors/:tool_name/clear', async (req, res) => {
  try {
    const { tool_name } = req.params;

    clearToolErrors(tool_name);

    res.json({
      ok: true,
      message: `Error statistics cleared for tool: ${tool_name}`
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/regression - Get all tool regression statistics (codex.plan Phase 2, T211)
app.get('/api/tools/regression', async (_req, res) => {
  try {
    const stats = getAllToolRegressionStats();
    const latency_threshold = parseInt(process.env.REGRESSION_LATENCY_MS || '50', 10);
    const error_rate_threshold = parseFloat(process.env.REGRESSION_ERROR_RATE || '0.05');
    const window_size = parseInt(process.env.REGRESSION_WINDOW_SIZE || '10', 10);
    const baseline_size = parseInt(process.env.REGRESSION_BASELINE_SIZE || '20', 10);

    res.json({
      ok: true,
      thresholds: {
        latency_ms: latency_threshold,
        error_rate: error_rate_threshold,
        window_size,
        baseline_size
      },
      tools: stats,
      count: stats.length
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/regression/:tool_name - Get regression stats for specific tool (codex.plan Phase 2, T211)
app.get('/api/tools/regression/:tool_name', async (req, res) => {
  try {
    const { tool_name } = req.params;
    const stats = getToolRegressionStats(tool_name);

    if (!stats) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: `No regression statistics found for tool: ${tool_name}`
      });
    }

    res.json({
      ok: true,
      tool: tool_name,
      ...stats
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// POST /api/tools/regression/:tool_name/clear - Clear regression stats for a tool (codex.plan Phase 2, T211)
app.post('/api/tools/regression/:tool_name/clear', async (req, res) => {
  try {
    const { tool_name } = req.params;

    clearToolRegressionStats(tool_name);

    res.json({
      ok: true,
      message: `Regression statistics cleared for tool: ${tool_name}`
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/resources - Get all tool resource usage (codex.plan Phase 2, T212)
app.get('/api/tools/resources', async (_req, res) => {
  try {
    const usage = getAllToolResourceUsage();
    const rate_limit = parseInt(process.env.TOOL_RATE_LIMIT_PER_MIN || '30', 10);
    const disk_quota = parseInt(process.env.TOOL_DISK_QUOTA_BYTES || String(10 * 1024 * 1024), 10);
    const memory_limit = parseInt(process.env.TOOL_MEMORY_LIMIT_MB || '512', 10);
    const cpu_timeout = parseInt(process.env.TOOL_CPU_TIMEOUT_MS || '30000', 10);

    res.json({
      ok: true,
      quotas: {
        rate_limit_per_min: rate_limit,
        disk_quota_bytes: disk_quota,
        memory_limit_mb: memory_limit,
        cpu_timeout_ms: cpu_timeout
      },
      tools: usage,
      count: usage.length
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// GET /api/tools/resources/:tool_name - Get resource usage for specific tool (codex.plan Phase 2, T212)
app.get('/api/tools/resources/:tool_name', async (req, res) => {
  try {
    const { tool_name } = req.params;
    const usage = getToolResourceUsage(tool_name);

    if (!usage) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: `No resource usage found for tool: ${tool_name}`
      });
    }

    res.json({
      ok: true,
      tool: tool_name,
      ...usage
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// POST /api/tools/resources/:tool_name/clear - Clear resource usage for a tool (codex.plan Phase 2, T212)
app.post('/api/tools/resources/:tool_name/clear', async (req, res) => {
  try {
    const { tool_name } = req.params;

    clearToolResourceUsage(tool_name);

    res.json({
      ok: true,
      message: `Resource usage cleared for tool: ${tool_name}`
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
});

// Local token store for GitHub (dev only). Allows pasting a PAT via API and storing it under .forgekeeper/secrets/gh_token.
app.post('/api/auth/github/token', async (req, res) => {
  try {
    if (String(process.env.FRONTEND_ENABLE_AUTH_LOCAL || '0') !== '1') return res.status(403).json({ ok: false, error: 'disabled' });
    const token = String(req.body?.token || '').trim();
    if (!token || token.length < 20) return res.status(400).json({ ok: false, error: 'bad_token' });
    const ok = writeGhToken(token);
    if (!ok) return res.status(500).json({ ok: false, error: 'write_failed' });
    // Attempt to set up gh with the stored token
    try {
      const repoRoot = process.env.REPO_ROOT || '/workspace';
      execSync('echo "$GH_TOKEN" | gh auth login --with-token --hostname github.com --git-protocol https', { cwd: repoRoot, stdio: 'pipe', env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token } });
      execSync('gh auth setup-git', { cwd: repoRoot, stdio: 'pipe' });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error', message: e?.message || String(e) });
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
    if (circuit.isOpen()) {
      const inf = circuit.info();
      res.setHeader('Retry-After', Math.ceil(Math.max(0, (inf.openUntil - Date.now())) / 1000));
      return res.status(503).json({ error: 'circuit_open', retry_after_ms: Math.max(0, inf.openUntil - Date.now()) });
    }
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

    // Use enhanced orchestrator if enabled
    const useEnhanced = process.env.FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR === '1';
    const enhancedOrchestrator = useEnhanced ? await getEnhancedOrchestrator() : null;

    const out = (enhancedOrchestrator && useEnhanced)
      ? await enhancedOrchestrator({
          baseUrl: upstreamBase,
          model: mdl,
          messages,
          tools: allowed,
          maxIterations: 4,
          maxTokens: plan.maxOut,
          temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
          topP: (typeof top_p === 'number' && !Number.isNaN(top_p)) ? top_p : undefined,
          presencePenalty: (typeof presence_penalty === 'number' && !Number.isNaN(presence_penalty)) ? presence_penalty : undefined,
          frequencyPenalty: (typeof frequency_penalty === 'number' && !Number.isNaN(frequency_penalty)) ? frequency_penalty : undefined,
          traceId,
          convId,
          enablePhase1: true,
          enablePhase3: process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1',
        })
      : await orchestrateWithTools({
          baseUrl: upstreamBase,
          model: mdl,
          messages,
          tools: allowed,
          maxIterations: 4,
          maxTokens: plan.maxOut,
          traceId,
          convId,
          tailEventsFn: tailEvents,
          appendEventFn: appendEvent,
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
      const nonStream = await orchestrateWithTools({ baseUrl: upstreamBase, model: mdl, messages: convo, tools: [], maxIterations: 1, maxTokens: maxOut, traceId, convId, tailEventsFn: tailEvents, appendEventFn: appendEvent });
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
      try { appendEvent({ actor: 'assistant', act: 'upstream_error', where: 'chat_stream', status: upstream.status, message: (txt || '').slice(0,400) }); } catch {}
      try { circuit.noteFailure('chat_stream', upstream.status); } catch {}
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
        const contBody = { model: mdl, messages: [...convo, { role: 'user', content: 'Continue from where you left off. Complete any unfinished thoughts, code blocks, or sentences. Do not restart or summarize - just continue naturally.' }], temperature: 0.0, stream: false, max_tokens: contOut };
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

// Autonomous Agent Mode (Phase 4)
// Manages active autonomous sessions
const activeSessions = new Map();

// POST /api/chat/autonomous - Start autonomous agent session
app.post('/api/chat/autonomous', async (req, res) => {
  try {
    const { task, model, max_iterations, conv_id, async: runAsync } = req.body || {};

    if (!task || typeof task !== 'string') {
      return res.status(400).json({ error: 'invalid_request', message: 'task string is required' });
    }

    const convId = conv_id || `c-${crypto.randomUUID()}`;
    const turnId = Date.now();
    const mdl = typeof model === 'string' && model ? model : (process.env.FRONTEND_VLLM_MODEL || 'core');
    const upstreamBase = targetOrigin + '/v1';

    console.log(`[Autonomous] Starting session for task: "${task.slice(0, 100)}..."`);

    // Create base LLM client
    const baseLLMClient = {
      chat: async (params) => {
        const url = upstreamBase.replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...params,
            model: mdl,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`LLM request failed: HTTP ${resp.status}: ${txt}`);
        }

        return await resp.json();
      },
    };

    // Wrap with resilient client that handles backend restarts
    const resilientLLMClient = createResilientLLMClient(
      baseLLMClient,
      targetOrigin, // Health check URL (e.g., http://localhost:8001)
      {
        maxRetries: 3,
        enableHealthCheck: true,
        onRetry: (attempt, error) => {
          console.log(`[Autonomous] LLM call failed (attempt ${attempt}), backend may be restarting...`);
        },
      }
    );

    // Create autonomous agent
    const agent = createAutonomousAgent({
      llmClient: resilientLLMClient,
      model: mdl,
      maxIterations: max_iterations || 15,
      checkpointInterval: 5,
      errorThreshold: 3,
      playgroundRoot: process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground',
      interactiveMode: process.env.AUTONOMOUS_INTERACTIVE_MODE === '1' || true, // [Day 10] Ask for clarification when stuck
      preferenceSystem, // [Phase 5 Option D] User preferences
    });

    // Note: sessionId is assigned inside agent.run(); we add to activeSessions when available

    // Create tool registry
    const toolDefs = await getToolDefs();
    const toolRegistry = new Map();
    for (const toolDef of toolDefs) {
      const name = toolDef?.function?.name;
      if (name) {
        const { runTool } = await import('./server.tools.mjs');
        toolRegistry.set(name, {
          name,
          description: toolDef.function.description,
          parameters: toolDef.function.parameters,
          execute: async (args) => await runTool(name, args),
        });
      }
    }

    // Create executor
    const executor = createExecutor({
      toolRegistry,
      truncatorConfig: {
        maxBytes: parseInt(process.env.TOOLS_MAX_OUTPUT_BYTES) || 10240,
        maxLines: parseInt(process.env.TOOLS_MAX_OUTPUT_LINES) || 256,
        strategy: process.env.TOOLS_TRUNCATION_STRATEGY || 'head-tail',
      },
      sandboxLevel: 'workspace',
    });

    // ✅ Add client disconnect handler for graceful shutdown
    let clientDisconnected = false;
    req.on('close', () => {
      if (!res.headersSent) {
        clientDisconnected = true;
        console.log(`[Autonomous] Client disconnected, requesting agent stop for session ${agent.sessionId || 'pending'}`);
        agent.stopRequested = true;
        agent.terminationReason = 'client_disconnect';
      }
    });

    // Async mode: start and return session_id immediately
    if (runAsync) {
      const sessionRecord = { agent, promise: null, result: null, done: false, error: null };
      sessionRecord.promise = (async () => {
        try {
          const result = await agent.run(task, executor, { convId, turnId });
          sessionRecord.result = result;
          sessionRecord.done = true;
          return result;
        } catch (e) {
          sessionRecord.error = e;
          throw e;
        } finally {
          const sid = agent.sessionId;
          setTimeout(() => { try { activeSessions.delete(sid); } catch {} }, Number(process.env.AUTONOMOUS_SESSION_TTL_MS || 10 * 60 * 1000));
        }
      })();

      // Wait briefly for run() to assign a session id
      let tries = 0;
      while (!agent.sessionId && tries < 100) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 10));
        tries += 1;
      }
      const sid = agent.sessionId || `c-${crypto.randomUUID()}`;
      activeSessions.set(sid, sessionRecord);
      return res.status(202).json({ ok: true, session_id: sid, running: true });
    }

    // Sync mode: run to completion
    const result = await agent.run(task, executor, { convId, turnId });

    // Only send response if client hasn't disconnected
    if (!clientDisconnected && !res.headersSent) {
      return res.json({ ok: true, session_id: agent.sessionId, result });
    } else {
      console.log(`[Autonomous] Skipping response - client disconnected`);
    }

  } catch (error) {
    console.error('[Autonomous] Session error:', error);
    res.status(500).json({
      ok: false,
      error: 'autonomous_error',
      message: error?.message || String(error),
    });
  }
});

// POST /api/chat/autonomous/stop - Stop autonomous session
app.post('/api/chat/autonomous/stop', async (req, res) => {
  try {
    const { session_id } = req.body || {};

    if (!session_id) {
      return res.status(400).json({ error: 'invalid_request', message: 'session_id is required' });
    }

    const session = activeSessions.get(session_id);
    if (!session || !session.agent) {
      return res.status(404).json({ error: 'not_found', message: 'Session not found or already completed' });
    }

    // Request agent to stop
    session.agent.requestStop();

    res.json({ ok: true, message: 'Stop requested' });

  } catch (error) {
    console.error('[Autonomous] Stop error:', error);
    res.status(500).json({
      ok: false,
      error: 'stop_error',
      message: error?.message || String(error),
    });
  }
});

// GET /api/chat/autonomous/status?session_id=... - Poll session status
app.get('/api/chat/autonomous/status', async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'session_id is required' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Session not found or expired' });
    }

    const agent = session.agent;
    const running = !session.done;
    const state = agent?.getProgressSummary ? agent.getProgressSummary() : null;
    const payload = { ok: true, session_id: sessionId, running, state };
    if (session.done && session.result) payload.result = session.result;
    if (session.error) payload.error = String(session.error?.message || session.error);
    return res.json(payload);
  } catch (error) {
    console.error('[Autonomous] Status error:', error);
    return res.status(500).json({ ok: false, error: 'status_error', message: error?.message || String(error) });
  }
});

// [Day 10] GET /api/chat/autonomous/checkpoints - List saved checkpoints
app.get('/api/chat/autonomous/checkpoints', async (req, res) => {
  try {
    const playgroundRoot = process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground';

    // Read checkpoint files from playground directory
    const files = await fs2.readdir(playgroundRoot).catch(() => []);
    const checkpointFiles = files.filter(f => f.startsWith('.checkpoint_') && f.endsWith('.json'));

    const checkpoints = await Promise.all(
      checkpointFiles.map(async (file) => {
        try {
          const filePath = path.join(playgroundRoot, file);
          const content = await fs2.readFile(filePath, 'utf8');
          const checkpoint = JSON.parse(content);

          return {
            checkpoint_id: checkpoint.sessionId,
            session_id: checkpoint.sessionId,
            task: checkpoint.task,
            timestamp: checkpoint.timestamp,
            iteration: checkpoint.state.iteration,
            progress_percent: checkpoint.state.lastProgressPercent,
            artifacts_count: checkpoint.state.artifacts.length,
          };
        } catch (err) {
          console.error(`[Autonomous] Failed to parse checkpoint ${file}:`, err);
          return null;
        }
      })
    );

    // Filter out nulls and sort by timestamp (newest first)
    const validCheckpoints = checkpoints
      .filter(cp => cp !== null)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({ ok: true, checkpoints: validCheckpoints });
  } catch (error) {
    console.error('[Autonomous] Checkpoints error:', error);
    return res.status(500).json({ ok: false, error: 'checkpoints_error', message: error?.message || String(error) });
  }
});

// [Day 10] POST /api/chat/autonomous/resume - Resume from checkpoint
app.post('/api/chat/autonomous/resume', async (req, res) => {
  try {
    const { checkpoint_id } = req.body || {};

    if (!checkpoint_id) {
      return res.status(400).json({ error: 'invalid_request', message: 'checkpoint_id is required' });
    }

    const playgroundRoot = process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground';
    const modelName = process.env.FRONTEND_VLLM_MODEL || 'core';

    // Create base LLM client
    const baseLLMClient = {
      chat: async (opts) => {
        const resp = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, ...opts }),
        });
        if (!resp.ok) throw new Error(`LLM request failed: ${resp.status}`);
        return await resp.json();
      }
    };

    // Wrap with resilient client that handles backend restarts
    const resilientLLMClient = createResilientLLMClient(
      baseLLMClient,
      targetOrigin, // Health check URL (e.g., http://localhost:8001)
      {
        maxRetries: 3,
        enableHealthCheck: true,
        onRetry: (attempt, error) => {
          console.log(`[Autonomous Resume] LLM call failed (attempt ${attempt}), backend may be restarting...`);
        },
      }
    );

    // Create agent and executor
    const agent = createAutonomousAgent({
      llmClient: resilientLLMClient,
      model: modelName,
      maxIterations: 15,
      checkpointInterval: 5,
      errorThreshold: 3,
      playgroundRoot,
      interactiveMode: process.env.AUTONOMOUS_INTERACTIVE_MODE === '1' || true, // [Day 10] Ask for clarification when stuck
      preferenceSystem, // [Phase 5 Option D] User preferences
    });

    const executor = createExecutor({
      playgroundRoot,
      toolRegistry: await getToolDefs(),
    });

    // Store in active sessions
    const sessionData = { agent, done: false, result: null, error: null };
    activeSessions.set(checkpoint_id, sessionData);

    // Resume in background
    agent.resumeFromCheckpoint(checkpoint_id, executor, {
      convId: `resumed-${checkpoint_id}`,
      turnId: Date.now(),
    })
      .then(result => {
        sessionData.done = true;
        sessionData.result = result;
        console.log(`[Autonomous] Session ${checkpoint_id} resumed and completed`);
      })
      .catch(err => {
        sessionData.done = true;
        sessionData.error = err;
        console.error(`[Autonomous] Session ${checkpoint_id} resume failed:`, err);
      });

    return res.json({ ok: true, session_id: checkpoint_id, running: true });
  } catch (error) {
    console.error('[Autonomous] Resume error:', error);
    return res.status(500).json({ ok: false, error: 'resume_error', message: error?.message || String(error) });
  }
});

// [Day 10] POST /api/chat/autonomous/clarify - Provide clarification to waiting agent
app.post('/api/chat/autonomous/clarify', async (req, res) => {
  try {
    const { session_id, response } = req.body || {};

    if (!session_id) {
      return res.status(400).json({ error: 'invalid_request', message: 'session_id is required' });
    }

    if (!response || typeof response !== 'string') {
      return res.status(400).json({ error: 'invalid_request', message: 'response string is required' });
    }

    const session = activeSessions.get(session_id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Session not found or expired' });
    }

    const agent = session.agent;
    if (!agent) {
      return res.status(400).json({ ok: false, error: 'invalid_state', message: 'Agent not available' });
    }

    // Provide clarification to agent
    await agent.resumeWithClarification(response);

    return res.json({ ok: true, session_id, running: !session.done });
  } catch (error) {
    console.error('[Autonomous] Clarify error:', error);
    return res.status(500).json({ ok: false, error: 'clarify_error', message: error?.message || String(error) });
  }
});

// POST /api/chat/thought-world - Multi-agent consensus mode
app.post('/api/chat/thought-world', async (req, res) => {
  try {
    const { messages, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
    }

    // Extract the last user message as the task
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage || !lastUserMessage.content) {
      return res.status(400).json({ error: 'invalid_request', message: 'No user message found' });
    }

    const task = lastUserMessage.content;

    // Run 3-agent consensus
    const result = await runThoughtWorld(task);

    // Build response in format compatible with existing chat
    const assistantMessage = {
      role: 'assistant',
      content: result.consensus.rawContent,
      thoughtWorld: {
        decision: result.decision,
        forge: {
          role: 'executor',
          content: result.agents.forge.content
        },
        loom: {
          role: 'verifier',
          content: result.agents.loom.content
        },
        anvil: {
          role: 'integrator',
          content: result.agents.anvil.content
        },
        episodeId: result.episodeId
      }
    };

    return res.json({
      assistant: assistantMessage,
      messages: [...messages, assistantMessage],
      decision: result.decision,
      success: result.success,
      mode: 'thought-world',
      episodeId: result.episodeId
    });

  } catch (error) {
    console.error('[Thought World] Error:', error);
    return res.status(500).json({
      error: 'thought_world_error',
      message: error?.message || String(error)
    });
  }
});

// POST /api/chat/thought-world/stream - Streaming multi-agent consensus
app.post('/api/chat/thought-world/stream', async (req, res) => {
  try {
    const { messages, model, agentConfig } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage || !lastUserMessage.content) {
      return res.status(400).json({ error: 'invalid_request', message: 'No user message found' });
    }

    const task = lastUserMessage.content;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Import streaming function
    const { runThoughtWorldStreaming } = await import('./server.thought-world.mjs');

    // Run streaming consensus with callback
    await runThoughtWorldStreaming(task, {
      agentConfig,
      onEvent: sendEvent
    });

    res.end();

  } catch (error) {
    console.error('[Thought World Stream] Error:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: error?.message || String(error) })}\n\n`);
    res.end();
  }
});

// POST /api/chat/thought-world/tools - Phase 2: Multi-agent with tool execution
app.post('/api/chat/thought-world/tools', async (req, res) => {
  try {
    const { messages, model, agentConfig } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'invalid_request', message: 'messages[] is required' });
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage || !lastUserMessage.content) {
      return res.status(400).json({ error: 'invalid_request', message: 'No user message found' });
    }

    const task = lastUserMessage.content;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Import Phase 2 tool execution function
    const { runThoughtWorldWithTools } = await import('./server.thought-world-tools.mjs');

    // Run tool-enabled consensus with callback
    await runThoughtWorldWithTools(task, {
      agentConfig,
      onEvent: sendEvent
    });

    res.end();

  } catch (error) {
    console.error('[Thought World Tools] Error:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: error?.message || String(error) })}\n\n`);
    res.end();
  }
});

// [Day 10] GET /api/chat/autonomous/stats - Get learning statistics
app.get('/api/chat/autonomous/stats', async (req, res) => {
  try {
    const playgroundRoot = process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground';
    const sessionMemory = createSessionMemory(playgroundRoot);

    // Get basic statistics
    const stats = await sessionMemory.getStatistics();

    // Read all sessions to aggregate patterns
    const memoryFilePath = path.join(playgroundRoot, '.session_memory.jsonl');
    let allSessions = [];

    try {
      const content = await fs2.readFile(memoryFilePath, 'utf8');
      allSessions = content
        .trim()
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(s => s !== null);
    } catch (err) {
      // File doesn't exist yet, return empty stats
      console.log('[Autonomous] No session memory file yet');
    }

    // Aggregate patterns
    const successfulTools = {};
    const failedTools = {};
    const failureReasons = {};

    allSessions.forEach(session => {
      if (session.success && session.tools_used) {
        session.tools_used.forEach(tool => {
          successfulTools[tool] = (successfulTools[tool] || 0) + 1;
        });
      } else {
        if (session.failed_tools) {
          session.failed_tools.forEach(tool => {
            failedTools[tool] = (failedTools[tool] || 0) + 1;
          });
        }
        if (session.failure_reason) {
          failureReasons[session.failure_reason] = (failureReasons[session.failure_reason] || 0) + 1;
        }
      }
    });

    // Get top successful tools
    const topSuccessfulTools = Object.entries(successfulTools)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    // Get failed tools (any that failed at least once)
    const topFailedTools = Object.keys(failedTools);

    // Get common failure reasons
    const commonFailureReasons = Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} (${count}x)`);

    // Calculate avg iterations per task type
    const byTaskTypeWithAvg = {};
    for (const [taskType, taskStats] of Object.entries(stats.by_type)) {
      const sessionsOfType = allSessions.filter(s => s.task_type === taskType);
      const avgIterations = sessionsOfType.length > 0
        ? Math.round(sessionsOfType.reduce((sum, s) => sum + (s.iterations || 0), 0) / sessionsOfType.length)
        : 0;

      byTaskTypeWithAvg[taskType] = {
        total: taskStats.total,
        success: taskStats.success,
        avg_iterations: avgIterations,
      };
    }

    return res.json({
      ok: true,
      stats: {
        total_sessions: stats.total,
        successful_sessions: stats.success,
        failed_sessions: stats.failure,
        by_task_type: byTaskTypeWithAvg,
        recent_patterns: {
          successful_tools: topSuccessfulTools,
          failed_tools: topFailedTools,
          common_failure_reasons: commonFailureReasons,
        },
      },
    });
  } catch (error) {
    console.error('[Autonomous] Stats error:', error);
    return res.status(500).json({ ok: false, error: 'stats_error', message: error?.message || String(error) });
  }
});

// [T313] GET /api/chat/autonomous/recovery-stats - Get recovery pattern statistics
app.get('/api/chat/autonomous/recovery-stats', async (req, res) => {
  try {
    const playgroundRoot = process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground';
    const sessionMemory = createSessionMemory(playgroundRoot);

    // Get error pattern statistics
    const errorPatternStats = await sessionMemory.getErrorPatternStats();

    // Get episodic memory stats for error recoveries
    const episodeErrorStats = await episodicMemory.getErrorCategoryStats();
    const commonPatterns = await episodicMemory.getCommonErrorPatterns(10);

    // Aggregate recovery success rates by error category
    const recoveryByCategory = {};
    for (const [category, stats] of Object.entries(errorPatternStats)) {
      recoveryByCategory[category] = {
        total_occurrences: stats.total_occurrences,
        sessions_affected: stats.sessions_affected,
        recovery_attempts: stats.recovery_attempts,
        recovery_successes: stats.recovery_successes,
        success_rate: stats.success_rate,
      };
    }

    // Get top successful recovery strategies
    const topStrategies = commonPatterns.map(pattern => ({
      error_category: pattern.error_category,
      occurrences: pattern.occurrences,
      top_strategy: pattern.top_strategy ? {
        name: pattern.top_strategy[0],
        success_count: pattern.top_strategy[1].count,
        avg_iterations: pattern.top_strategy[1].avg_iterations,
      } : null,
    }));

    return res.json({
      ok: true,
      stats: {
        recovery_by_category: recoveryByCategory,
        top_strategies: topStrategies,
        episode_error_stats: episodeErrorStats,
        total_error_categories: Object.keys(errorPatternStats).length,
        total_recovery_attempts: Object.values(errorPatternStats).reduce((sum, s) => sum + s.recovery_attempts, 0),
        total_recovery_successes: Object.values(errorPatternStats).reduce((sum, s) => sum + s.recovery_successes, 0),
        overall_recovery_rate: (() => {
          const totalAttempts = Object.values(errorPatternStats).reduce((sum, s) => sum + s.recovery_attempts, 0);
          const totalSuccesses = Object.values(errorPatternStats).reduce((sum, s) => sum + s.recovery_successes, 0);
          return totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;
        })(),
      },
    });
  } catch (error) {
    console.error('[Autonomous] Recovery stats error:', error);
    return res.status(500).json({ ok: false, error: 'recovery_stats_error', message: error?.message || String(error) });
  }
});

// GET /api/chat/autonomous/history - Get full session history from JSONL
app.get('/api/chat/autonomous/history', async (req, res) => {
  try {
    const playgroundRoot = process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground';
    const memoryFilePath = path.join(playgroundRoot, '.session_memory.jsonl');
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50));

    let allSessions = [];

    try {
      const content = await fs2.readFile(memoryFilePath, 'utf8');
      allSessions = content
        .trim()
        .split('\n')
        .map((line, index) => {
          try {
            const session = JSON.parse(line);
            return {
              ...session,
              line_number: index + 1,
              timestamp: session.timestamp || new Date().toISOString(),
            };
          } catch {
            return null;
          }
        })
        .filter(s => s !== null);
    } catch (err) {
      // File doesn't exist yet
      return res.json({ ok: true, sessions: [], total: 0 });
    }

    // Return most recent sessions first
    const sessions = allSessions.reverse().slice(0, limit);

    return res.json({
      ok: true,
      sessions,
      total: allSessions.length,
      file_path: memoryFilePath,
    });
  } catch (error) {
    console.error('[Autonomous] History error:', error);
    return res.status(500).json({ ok: false, error: 'history_error', message: error?.message || String(error) });
  }
});

// ========================================
// SELF-DIAGNOSTIC ENDPOINTS (Meta-capability)
// These endpoints enable the autonomous agent to diagnose and fix itself!
// ========================================

// GET /api/autonomous/diagnose/:session_id - Analyze a failed session and identify root cause
app.get('/api/autonomous/diagnose/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    // Get all events for this session
    const events = tailEvents(10000).filter(e => e.session_id === session_id);

    if (events.length === 0) {
      return res.status(404).json({ ok: false, error: 'session_not_found', message: `No events found for session ${session_id}` });
    }

    // Analyze event sequence to identify failure patterns
    const diagnosis = {
      session_id,
      total_events: events.length,
      start_time: events.find(e => e.type === 'autonomous_session_start')?.ts,
      end_time: events.find(e => e.type === 'autonomous_session_end')?.ts,
      termination_reason: events.find(e => e.type === 'autonomous_session_end')?.reason || 'unknown',
      iterations_completed: events.filter(e => e.type === 'autonomous_iteration').length,
      tools_executed: events.filter(e => e.type === 'tool_call_end_autonomous').length,
      errors: events.filter(e => e.type === 'error' || e.act === 'error').length,

      // Failure patterns
      repetitive_actions: events.some(e => e.repetition_detected === true),
      stuck_loop: events.some(e => e.type === 'autonomous_iteration' && e.assessment === 'stuck'),
      missing_execution_start: false,
      client_disconnect: false,
      fatal_error: false,

      // Detailed analysis
      last_reflection: null,
      last_execution_start: null,
      last_tool_call: null,
      missing_events: [],

      // Root cause hypothesis
      root_cause: null,
      evidence: [],
      recommended_fixes: [],
    };

    // Check for missing execution start (indicates premature termination)
    const reflections = events.filter(e => e.type === 'autonomous_iteration');
    const executionStarts = events.filter(e => e.type === 'iteration_execution_start');

    if (reflections.length > executionStarts.length) {
      diagnosis.missing_execution_start = true;
      diagnosis.last_reflection = reflections[reflections.length - 1];
      diagnosis.missing_events.push('iteration_execution_start');

      diagnosis.root_cause = 'premature_termination';
      diagnosis.evidence.push(`Found ${reflections.length} reflections but only ${executionStarts.length} execution starts`);
      diagnosis.evidence.push(`Last reflection at ${diagnosis.last_reflection.ts} planned to execute ${diagnosis.last_reflection.tool_plan?.tool || 'unknown tool'}`);

      // Check if it's a client disconnect
      if (diagnosis.termination_reason === 'client_disconnect') {
        diagnosis.client_disconnect = true;
        diagnosis.evidence.push('Session end event shows client_disconnect');
      } else if (diagnosis.termination_reason === 'unknown') {
        diagnosis.evidence.push('No session end event found - likely client disconnect before finally block was added');
        diagnosis.recommended_fixes.push('Client disconnected before finally block could log session end');
      }
    }

    // Check for repetitive actions
    const toolCalls = events.filter(e => e.type === 'tool_call_begin_autonomous');
    const toolSignatures = toolCalls.map(t => `${t.name}:${t.args_preview}`);
    const duplicates = toolSignatures.filter((sig, i) => toolSignatures.indexOf(sig) !== i);

    if (duplicates.length > 0) {
      diagnosis.repetitive_actions = true;
      diagnosis.root_cause = diagnosis.root_cause || 'repetitive_actions';
      diagnosis.evidence.push(`Found ${duplicates.length} duplicate tool calls`);
      diagnosis.evidence.push(`Example: ${duplicates[0]}`);
      diagnosis.recommended_fixes.push('Lower repetition threshold from >=2 to >=1');
      diagnosis.recommended_fixes.push('Improve argument inference to use context');
    }

    // Check for hardcoded arguments (read_dir always uses ".")
    const readDirCalls = toolCalls.filter(t => t.name === 'read_dir');
    const allUseDot = readDirCalls.every(t => t.args_preview?.includes('"."') || t.args_preview?.includes('dir:.'));

    if (readDirCalls.length > 1 && allUseDot) {
      diagnosis.root_cause = diagnosis.root_cause || 'hardcoded_arguments';
      diagnosis.evidence.push(`All ${readDirCalls.length} read_dir calls used "." - likely hardcoded`);
      diagnosis.recommended_fixes.push('Fix inferToolArgs() to extract directory from context');
      diagnosis.recommended_fixes.push('Use LLM or regex to parse directory names from reflection.next_action');
    }

    // Generate fix suggestions
    if (!diagnosis.recommended_fixes.length) {
      diagnosis.recommended_fixes.push('No obvious fixes needed - session may have completed successfully');
    }

    return res.json({ ok: true, diagnosis });

  } catch (error) {
    console.error('[Autonomous] Diagnose error:', error);
    return res.status(500).json({ ok: false, error: 'diagnose_error', message: error?.message || String(error) });
  }
});

// GET /api/autonomous/failure-patterns - Get common failure patterns across all sessions
app.get('/api/autonomous/failure-patterns', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10) || 20));

    // Get all autonomous session events
    const allEvents = tailEvents(50000);
    const sessionStarts = allEvents.filter(e => e.type === 'autonomous_session_start');
    const sessionEnds = allEvents.filter(e => e.type === 'autonomous_session_end');

    // Group events by session_id
    const sessionMap = new Map();
    for (const event of allEvents) {
      if (!event.session_id) continue;
      if (!sessionMap.has(event.session_id)) {
        sessionMap.set(event.session_id, []);
      }
      sessionMap.get(event.session_id).push(event);
    }

    // Analyze each session
    const patterns = {
      total_sessions: sessionStarts.length,
      sessions_with_end_event: sessionEnds.length,
      missing_end_events: sessionStarts.length - sessionEnds.length,

      termination_reasons: {},
      failure_patterns: {
        premature_termination: 0,
        repetitive_actions: 0,
        stuck_loop: 0,
        hardcoded_arguments: 0,
        client_disconnect: 0,
        fatal_error: 0,
      },

      most_common_failures: [],
      example_failed_sessions: [],
    };

    // Count termination reasons
    for (const endEvent of sessionEnds) {
      const reason = endEvent.reason || 'unknown';
      patterns.termination_reasons[reason] = (patterns.termination_reasons[reason] || 0) + 1;
    }

    // Analyze each session for failure patterns
    for (const [sessionId, events] of sessionMap.entries()) {
      const hasStart = events.some(e => e.type === 'autonomous_session_start');
      const hasEnd = events.some(e => e.type === 'autonomous_session_end');
      const endReason = events.find(e => e.type === 'autonomous_session_end')?.reason;

      // Premature termination
      if (hasStart && !hasEnd) {
        patterns.failure_patterns.premature_termination++;
        patterns.example_failed_sessions.push({
          session_id: sessionId,
          pattern: 'premature_termination',
          evidence: 'No session_end event',
        });
      }

      // Client disconnect
      if (endReason === 'client_disconnect') {
        patterns.failure_patterns.client_disconnect++;
      }

      // Repetitive actions
      if (events.some(e => e.repetition_detected === true)) {
        patterns.failure_patterns.repetitive_actions++;
      }

      // Stuck loop
      if (events.some(e => e.assessment === 'stuck')) {
        patterns.failure_patterns.stuck_loop++;
      }
    }

    // Sort patterns by frequency
    patterns.most_common_failures = Object.entries(patterns.failure_patterns)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => ({ pattern, count, percentage: ((count / patterns.total_sessions) * 100).toFixed(1) }));

    return res.json({ ok: true, patterns });

  } catch (error) {
    console.error('[Autonomous] Failure patterns error:', error);
    return res.status(500).json({ ok: false, error: 'failure_patterns_error', message: error?.message || String(error) });
  }
});

// POST /api/autonomous/propose-fix - Propose code fixes for a given failure pattern
app.post('/api/autonomous/propose-fix', async (req, res) => {
  try {
    const { failure_pattern, session_id, context } = req.body || {};

    if (!failure_pattern) {
      return res.status(400).json({ ok: false, error: 'missing_failure_pattern' });
    }

    const fixes = {
      failure_pattern,
      session_id: session_id || null,
      proposed_fixes: [],
      files_to_modify: [],
      estimated_effort: 'unknown',
      confidence: 0,
    };

    // Map failure patterns to concrete fixes
    switch (failure_pattern) {
      case 'premature_termination':
        fixes.proposed_fixes.push({
          title: 'Add finally block to run() method',
          file: 'forgekeeper/frontend/core/agent/autonomous.mjs',
          description: 'Wrap main loop in try-finally to always log session end',
          code_change: 'try { while(true) {...} } finally { await contextLogEvents.emit({type: "autonomous_session_end", ...}) }',
          estimated_lines: 30,
        });
        fixes.proposed_fixes.push({
          title: 'Add client disconnect handler',
          file: 'forgekeeper/frontend/server.mjs',
          description: 'Detect when client cancels request and stop agent gracefully',
          code_change: 'req.on("close", () => { agent.stopRequested = true; agent.terminationReason = "client_disconnect"; })',
          estimated_lines: 8,
        });
        fixes.files_to_modify = ['forgekeeper/frontend/core/agent/autonomous.mjs', 'forgekeeper/frontend/server.mjs'];
        fixes.estimated_effort = 'low (30 minutes)';
        fixes.confidence = 0.95;
        break;

      case 'repetitive_actions':
        fixes.proposed_fixes.push({
          title: 'Lower repetition detection threshold',
          file: 'forgekeeper/frontend/core/agent/autonomous.mjs',
          description: 'Change threshold from >=2 to >=1 to block on first repetition',
          code_change: 'if (recentCount >= 1) { // was: >= 2',
          estimated_lines: 1,
        });
        fixes.files_to_modify = ['forgekeeper/frontend/core/agent/autonomous.mjs'];
        fixes.estimated_effort = 'trivial (5 minutes)';
        fixes.confidence = 1.0;
        break;

      case 'hardcoded_arguments':
        fixes.proposed_fixes.push({
          title: 'Context-aware argument inference',
          file: 'forgekeeper/frontend/core/agent/autonomous.mjs',
          description: 'Extract arguments from reflection context using regex or LLM',
          code_change: 'const dirMatch = context.match(/\\b([a-z0-9_\\-\\/\\.]+)\\s+(?:directory|folder)/i); if (dirMatch) return { dir: dirMatch[1] };',
          estimated_lines: 20,
        });
        fixes.files_to_modify = ['forgekeeper/frontend/core/agent/autonomous.mjs'];
        fixes.estimated_effort = 'medium (1-2 hours)';
        fixes.confidence = 0.8;
        break;

      case 'client_disconnect':
        fixes.proposed_fixes.push({
          title: 'Already fixed if you have client disconnect handler',
          file: 'forgekeeper/frontend/server.mjs',
          description: 'Client disconnects are now logged properly with finally block',
          code_change: 'No code change needed if observability fixes are in place',
          estimated_lines: 0,
        });
        fixes.estimated_effort = 'none (already fixed)';
        fixes.confidence = 0.9;
        break;

      default:
        fixes.proposed_fixes.push({
          title: 'Unknown failure pattern',
          description: `No automated fix available for pattern: ${failure_pattern}`,
          code_change: 'Manual investigation required',
          estimated_lines: 0,
        });
        fixes.estimated_effort = 'unknown';
        fixes.confidence = 0;
    }

    return res.json({ ok: true, fixes });

  } catch (error) {
    console.error('[Autonomous] Propose fix error:', error);
    return res.status(500).json({ ok: false, error: 'propose_fix_error', message: error?.message || String(error) });
  }
});

// User Preference Management (Phase 5 Option D)
// Initialize preference system singleton
const preferenceSystem = new UserPreferenceSystem(
  path.join(process.cwd(), '.forgekeeper', 'preferences'),
  'default_user'
);

// Episodic Memory (Phase 5 Option A)
// Initialize episodic memory singleton
const episodicMemory = createEpisodicMemory(
  process.env.AUTONOMOUS_PLAYGROUND_ROOT || '.forgekeeper/playground'
);

// GET /api/preferences - Get all preferences
app.get('/api/preferences', async (req, res) => {
  try {
    const preferences = await preferenceSystem.getAllPreferences();
    return res.json({ ok: true, preferences });
  } catch (error) {
    console.error('[Preferences] Get all error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// GET /api/preferences/:domain - Get preferences by domain
app.get('/api/preferences/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'domain is required' });
    }

    const preferences = await preferenceSystem.getPreferencesByDomain(domain);
    return res.json({ ok: true, domain, preferences });
  } catch (error) {
    console.error('[Preferences] Get by domain error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// POST /api/preferences - Record explicit preference
app.post('/api/preferences', async (req, res) => {
  try {
    const { domain, category, preference, value, applies_to } = req.body || {};

    if (!domain || !category || !preference) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'domain, category, and preference are required'
      });
    }

    await preferenceSystem.recordPreference(domain, category, preference, value, applies_to);

    return res.json({ ok: true, message: 'Preference recorded' });
  } catch (error) {
    console.error('[Preferences] Record error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// POST /api/preferences/infer - Trigger inference on file(s)
app.post('/api/preferences/infer', async (req, res) => {
  try {
    const { files } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'files array is required'
      });
    }

    const repoRoot = process.env.REPO_ROOT || '/workspace';
    const results = [];

    for (const filePath of files) {
      try {
        const fullPath = path.resolve(repoRoot, filePath);
        const content = await fs2.readFile(fullPath, 'utf8');
        const observations = await preferenceSystem.inferPreferencesFromCode(filePath, content);
        results.push({ file: filePath, observations: observations.length, status: 'ok' });
      } catch (err) {
        results.push({ file: filePath, error: err?.message || String(err), status: 'error' });
      }
    }

    return res.json({ ok: true, results });
  } catch (error) {
    console.error('[Preferences] Infer error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// DELETE /api/preferences/:id - Delete preference
app.delete('/api/preferences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'preference_id is required' });
    }

    // For now, we need to manually filter out the preference from the JSONL file
    // This is a simple implementation - could be optimized with proper deletion support
    const allPrefs = await preferenceSystem.getAllPreferences();
    const prefToDelete = allPrefs.find(p => p.preference_id === id);

    if (!prefToDelete) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Preference not found' });
    }

    // Rewrite the file without the deleted preference
    const preferencesDir = path.join(process.cwd(), '.forgekeeper', 'preferences');
    const preferenceFile = path.join(preferencesDir, 'user_preferences.jsonl');

    const content = await fs2.readFile(preferenceFile, 'utf8').catch(() => '');
    const lines = content.trim().split('\n').filter(Boolean);
    const updatedLines = lines.filter(line => {
      try {
        const pref = JSON.parse(line);
        return pref.preference_id !== id;
      } catch {
        return true;
      }
    });

    await fs2.writeFile(preferenceFile, updatedLines.join('\n') + (updatedLines.length > 0 ? '\n' : ''), 'utf8');

    // Clear cache to force reload
    preferenceSystem.preferenceCache.clear();
    preferenceSystem.cacheLoaded = false;

    return res.json({ ok: true, message: 'Preference deleted', deleted_id: id });
  } catch (error) {
    console.error('[Preferences] Delete error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// GET /api/preferences/guidance - Get formatted preference guidance for prompts
app.get('/api/preferences/guidance', async (req, res) => {
  try {
    const guidance = await preferenceSystem.generatePreferenceGuidance();
    return res.json({ ok: true, guidance });
  } catch (error) {
    console.error('[Preferences] Guidance error:', error);
    return res.status(500).json({ ok: false, error: 'preferences_error', message: error?.message || String(error) });
  }
});

// Episodic Memory API (Phase 5 Option A)

// GET /api/episodes - Get recent episodes
app.get('/api/episodes', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit || '10'), 10) || 10));
    const episodes = await episodicMemory.getRecentEpisodes(limit);
    return res.json({ ok: true, episodes });
  } catch (error) {
    console.error('[EpisodicMemory] Get episodes error:', error);
    return res.status(500).json({ ok: false, error: 'episodic_memory_error', message: error?.message || String(error) });
  }
});

// POST /api/episodes/search - Search for similar episodes
app.post('/api/episodes/search', async (req, res) => {
  try {
    const { query, limit, minScore, successOnly, taskType } = req.body || {};

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'query string is required'
      });
    }

    const results = await episodicMemory.searchSimilar(query, {
      limit: limit !== undefined ? Math.max(1, Math.min(20, limit)) : 5,
      minScore: minScore !== undefined ? Math.max(0, Math.min(1, minScore)) : 0.3,
      successOnly: successOnly !== undefined ? Boolean(successOnly) : false,
      taskType: taskType || null,
    });

    return res.json({ ok: true, results });
  } catch (error) {
    console.error('[EpisodicMemory] Search error:', error);
    return res.status(500).json({ ok: false, error: 'episodic_memory_error', message: error?.message || String(error) });
  }
});

// GET /api/episodes/stats - Get episodic memory statistics
app.get('/api/episodes/stats', async (req, res) => {
  try {
    const stats = await episodicMemory.getStatistics();
    return res.json({ ok: true, stats });
  } catch (error) {
    console.error('[EpisodicMemory] Stats error:', error);
    return res.status(500).json({ ok: false, error: 'episodic_memory_error', message: error?.message || String(error) });
  }
});

// ============================================================================
// SAPL (Safe Auto-PR Loop) - Auto-PR creation from TGT tasks
// ============================================================================

// Get SAPL status and configuration
app.get('/api/auto_pr/status', async (req, res) => {
  try {
    const status = {
      ok: true,
      enabled: autoPR.isEnabled(),
      dryRun: autoPR.isDryRun(),
      allowlist: autoPR.getAllowlist(),
      labels: autoPR.getLabels(),
      autoMerge: String(process.env.AUTO_PR_AUTOMERGE || '0') === '1',
    };
    return res.json(status);
  } catch (error) {
    console.error('[SAPL] Status error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Preview PR creation (dry-run - always safe)
app.post('/api/auto_pr/preview', async (req, res) => {
  try {
    const { files, title, body } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'files array required' });
    }

    if (!title) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'title required' });
    }

    const result = await autoPR.previewPR(files, title, body);
    return res.json(result);
  } catch (error) {
    console.error('[SAPL] Preview error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Create PR (requires AUTO_PR_ENABLED=1 and AUTO_PR_DRYRUN=0)
app.post('/api/auto_pr/create', async (req, res) => {
  try {
    const { files, title, body } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'files array required' });
    }

    if (!title) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'title required' });
    }

    // Pass context for audit logging
    const context = {
      convId: req.body.convId || null,
      turnId: req.body.turnId || null,
      sessionId: req.body.sessionId || null,
      ip: req.ip,
    };

    const result = await autoPR.executePR(files, title, body, context);
    return res.json(result);
  } catch (error) {
    console.error('[SAPL] Create error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Get current git status
app.get('/api/auto_pr/git/status', async (req, res) => {
  try {
    const result = await autoPR.getGitStatus();
    return res.json(result);
  } catch (error) {
    console.error('[SAPL] Git status error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Validate files against allowlist
app.post('/api/auto_pr/validate', async (req, res) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'files array required' });
    }

    const result = autoPR.validateFiles(files);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[SAPL] Validate error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// ============================================================================
// MIP (Metrics-Informed Prompting) - Hint injection to reduce incomplete responses
// ============================================================================

// Get MIP status and configuration
app.get('/api/prompting_hints/status', async (req, res) => {
  try {
    const config = promptingHints.getConfig();
    return res.json({ ok: true, ...config });
  } catch (error) {
    console.error('[MIP] Status error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Get hint statistics
app.get('/api/prompting_hints/stats', async (req, res) => {
  try {
    const hours = parseInt(String(req.query.hours || '24'), 10) || 24;
    const stats = promptingHints.getHintStats(tailEvents, { hours });
    return res.json({ ok: true, ...stats });
  } catch (error) {
    console.error('[MIP] Stats error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
  }
});

// Analyze recent continuations and generate hint (without applying)
app.get('/api/prompting_hints/analyze', async (req, res) => {
  try {
    const convId = String(req.query.conv_id || '').trim() || null;
    const minutes = parseInt(String(req.query.minutes || ''), 10) || undefined;

    const hintInfo = promptingHints.generateHintFromContextLog(tailEvents, { convId, minutes });

    return res.json({
      ok: true,
      ...hintInfo,
    });
  } catch (error) {
    console.error('[MIP] Analyze error:', error);
    return res.status(500).json({ ok: false, error: 'server_error', message: error?.message || String(error) });
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

// Pretty-formatted JSON endpoint for browser viewing
app.get('/api/ctx/tail.json', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(10000, parseInt(String(req.query.n || '50'), 10) || 50));
    const conv = String(req.query.conv_id || '').trim() || null;
    const sessionId = String(req.query.session_id || '').trim() || null;

    // Filter by conv_id or session_id
    const rows = tailEvents(n, conv);
    const filtered = sessionId
      ? rows.filter(r => r.session_id === sessionId)
      : rows;

    // Return pretty-printed JSON for browser viewing
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(filtered, null, 2));
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'application/json').send(JSON.stringify({
      ok: false,
      error: 'server_error',
      message: e?.message || String(e)
    }, null, 2));
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
app.get('/api/tools', async (_req, res) => {
  try {
    const tools = await getToolDefs();
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
