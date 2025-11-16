// ContextLog JSONL appender and tail helper (Node side)
import fs from 'node:fs';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_DIR = path.resolve(process.cwd(), '.forgekeeper', 'context_log');
const MAX_BYTES = Number(process.env.FRONEND_CTXLOG_MAX_BYTES || process.env.CTXLOG_MAX_BYTES || 10 * 1024 * 1024);

// Simple in-memory tail cache for most-recent file to avoid repeated disk reads
// Cache invalidates when file size or mtime changes.
const tailCache = new Map(); // fp -> { size, mtimeMs, lines }
let filesCache = { ts: 0, list: [] };

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}${m}${day}-${h}`;
}

function ensureDir() {
  mkdirSync(BASE_DIR, { recursive: true });
}

function currentFile() {
  ensureDir();
  const key = hourKey();
  const base = path.join(BASE_DIR, `ctx-${key}.jsonl`);
  try {
    if (!fs.existsSync(base)) return base;
    if (statSync(base).size < MAX_BYTES) return base;
    let i = 1;
    while (true) {
      const candidate = path.join(BASE_DIR, `ctx-${key}-${i}.jsonl`);
      if (!fs.existsSync(candidate)) return candidate;
      if (statSync(candidate).size < MAX_BYTES) return candidate;
      i += 1;
    }
  } catch {
    return base;
  }
}

export function appendEvent(ev) {
  try {
    const fp = currentFile();
    const withTs = ev.ts ? ev : { ...ev, ts: new Date().toISOString() };
    const line = JSON.stringify(withTs) + '\n';
    fs.appendFileSync(fp, line);
    // Update cache for this file if present
    try {
      const st = statSync(fp);
      const cached = tailCache.get(fp);
      if (cached) {
        const next = { size: st.size, mtimeMs: st.mtimeMs, lines: [...cached.lines, JSON.stringify(withTs)] };
        tailCache.set(fp, next);
      }
      // Update files list cache to include current file at head
      const now = Date.now();
      const list = filesCache.list.filter(x => x !== fp);
      filesCache = { ts: now, list: [fp, ...list] };
    } catch {}
    return true;
  } catch {
    return false;
  }
}

export function tailEvents(n = 50, conv_id = null) {
  try {
    ensureDir();
    let files = filesCache.list;
    const now = Date.now();
    if (!Array.isArray(files) || files.length === 0 || (now - (filesCache.ts || 0) > 2000)) {
      files = readdirSync(BASE_DIR)
        .filter((f) => f.startsWith('ctx-') && f.endsWith('.jsonl'))
        .map((f) => path.join(BASE_DIR, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      filesCache = { ts: now, list: files };
    }
    const out = [];
    for (const fp of files) {
      let lines = null;
      try {
        const st = statSync(fp);
        const key = fp;
        const cached = tailCache.get(key);
        if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) {
          lines = cached.lines;
        } else {
          const text = readFileSync(fp, 'utf8');
          lines = text.split(/\r?\n/).filter(Boolean);
          tailCache.set(key, { size: st.size, mtimeMs: st.mtimeMs, lines });
        }
      } catch { continue; }
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const obj = JSON.parse(lines[i]);
          if (conv_id && String(obj.conv_id || '') !== String(conv_id)) continue;
          out.push(obj);
          if (out.length >= n) return out;
        } catch {}
      }
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];
  }
}

// --- Review event helpers (M2: Self-Review Iteration) ---

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function truncateText(text, maxLength = 500, suffix = '...') {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function createReviewCycleEvent({
  conv_id,
  trace_id,
  iteration,
  review_pass,
  quality_score,
  threshold,
  critique,
  accepted,
  elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'review_cycle',
    conv_id,
    trace_id,
    iter: iteration,
    name: 'self_review',
    status,
    review_pass,
    quality_score: Math.round(quality_score * 1000) / 1000,
    threshold: Math.round(threshold * 1000) / 1000,
    critique: truncateText(critique, 500),
    accepted,
    elapsed_ms,
  };
}

export function createRegenerationEvent({
  conv_id,
  trace_id,
  iteration,
  attempt,
  reason,
  previous_score,
  elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'assistant',
    act: 'regeneration',
    conv_id,
    trace_id,
    iter: iteration,
    name: 'regenerate_with_critique',
    status,
    attempt,
    reason: truncateText(reason, 500),
    previous_score: Math.round(previous_score * 1000) / 1000,
    elapsed_ms,
  };
}

export function createReviewSummaryEvent({
  conv_id,
  trace_id,
  iteration,
  total_passes,
  final_score,
  regeneration_count,
  accepted,
  total_elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'review_summary',
    conv_id,
    trace_id,
    iter: iteration,
    name: 'review_complete',
    status,
    total_passes,
    final_score: Math.round(final_score * 1000) / 1000,
    regeneration_count,
    accepted,
    total_elapsed_ms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunked Reasoning Event Creators
// ─────────────────────────────────────────────────────────────────────────────

export function createChunkOutlineEvent({
  conv_id,
  trace_id,
  chunk_count,
  outline,
  raw_outline = '',
  elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_outline',
    conv_id,
    trace_id,
    iter: 0,
    name: 'generate_outline',
    status,
    chunk_count,
    outline: Array.isArray(outline) ? outline : [],
    raw_outline: truncateText(raw_outline, 1000),
    elapsed_ms,
  };
}

export function createChunkWriteEvent({
  conv_id,
  trace_id,
  iter,
  chunk_index,
  chunk_label,
  reasoning_tokens,
  content_tokens,
  elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'assistant',
    act: 'chunk_write',
    conv_id,
    trace_id,
    iter,
    name: 'write_chunk',
    status,
    chunk_index,
    chunk_label: truncateText(chunk_label, 100),
    reasoning_tokens,
    content_tokens,
    elapsed_ms,
  };
}

export function createChunkAssemblyEvent({
  conv_id,
  trace_id,
  chunk_count,
  total_reasoning_tokens,
  total_content_tokens,
  total_tokens,
  elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_assembly',
    conv_id,
    trace_id,
    iter: chunk_count,
    name: 'assemble_chunks',
    status,
    chunk_count,
    total_reasoning_tokens,
    total_content_tokens,
    total_tokens,
    elapsed_ms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined Mode Event Creators (T209: Combined review + chunked)
// ─────────────────────────────────────────────────────────────────────────────

export function createCombinedModeStartEvent({
  conv_id,
  trace_id,
  strategy,
  chunk_count,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'combined_mode_start',
    conv_id,
    trace_id,
    iter: 0,
    name: 'combined_orchestration',
    status,
    strategy,
    chunk_count,
  };
}

export function createCombinedModeCompleteEvent({
  conv_id,
  trace_id,
  strategy,
  chunk_count,
  total_review_passes,
  final_score,
  total_elapsed_ms,
  status = 'ok',
}) {
  return {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'combined_mode_complete',
    conv_id,
    trace_id,
    iter: chunk_count,
    name: 'combined_orchestration',
    status,
    strategy,
    chunk_count,
    total_review_passes,
    final_score: Math.round(final_score * 1000) / 1000,
    total_elapsed_ms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Event Creators (T12: Persist tool outputs)
// ─────────────────────────────────────────────────────────────────────────────

export function createToolExecutionEvent({
  phase,
  tool,
  conv_id,
  trace_id,
  args_preview,
  result_preview,
  elapsed_ms,
  error,
  error_type,
  result_size_bytes,
  status = 'ok',
}) {
  const baseEvent = {
    id: generateId(),
    ts: new Date().toISOString(),
    actor: 'tool',
    conv_id,
    trace_id,
    iter: 0,
    name: tool,
    status,
  };

  switch (phase) {
    case 'start':
      return {
        ...baseEvent,
        act: 'tool_execution_start',
        args_preview: truncateText(args_preview, 500),
      };

    case 'finish':
      return {
        ...baseEvent,
        act: 'tool_execution_finish',
        result_preview: truncateText(result_preview, 500),
        elapsed_ms,
        bytes: result_size_bytes || 0,
      };

    case 'error':
      return {
        ...baseEvent,
        act: 'tool_execution_error',
        status: 'error',
        error: truncateText(error, 500),
        error_type: error_type || 'execution_error',
        elapsed_ms,
      };

    default:
      return baseEvent;
  }
}
