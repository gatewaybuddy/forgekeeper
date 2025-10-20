// ContextLog JSONL appender and tail helper (Node side)
import fs from 'node:fs';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const BASE_DIR = path.resolve(process.cwd(), '.forgekeeper', 'context_log');
const MAX_BYTES = Number(process.env.FRONEND_CTXLOG_MAX_BYTES || process.env.CTXLOG_MAX_BYTES || 10 * 1024 * 1024);

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
    fs.appendFileSync(fp, JSON.stringify(withTs) + '\n');
    return true;
  } catch {
    return false;
  }
}

export function tailEvents(n = 50, conv_id = null) {
  try {
    ensureDir();
    const files = readdirSync(BASE_DIR)
      .filter((f) => f.startsWith('ctx-') && f.endsWith('.jsonl'))
      .map((f) => path.join(BASE_DIR, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const out = [];
    for (const fp of files) {
      let text = '';
      try { text = readFileSync(fp, 'utf8'); } catch { continue; }
      const lines = text.split(/\r?\n/).filter(Boolean);
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

