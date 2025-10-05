// Dynamic tool loader and registry with fallback to static aggregator
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let REGISTRY = new Map();
let TOOL_DEFS_CACHE = [];
let LAST_LOADED_AT = 0;
const TOOLS_DIR = path.resolve(process.cwd(), 'tools');
const SELF_UPDATE_ENABLED = process.env.FRONTEND_ENABLE_SELF_UPDATE === '1';
const WRITE_MAX = Number(process.env.TOOLS_SELF_MAX_BYTES || 64 * 1024);

async function tryDynamicLoad() {
  const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true }).catch(() => []);
  const mods = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('.mjs') && !['index.mjs', 'TEMPLATE.mjs'].includes(n));
  const tmpRegistry = new Map();
  const defs = [];
  for (const file of mods) {
    try {
      const full = path.join(TOOLS_DIR, file);
      const url = pathToFileURL(full).href + `?t=${Date.now()}`;
      const mod = await import(url);
      if (mod && mod.def && typeof mod.run === 'function') {
        const name = mod.def?.function?.name || path.basename(file, '.mjs');
        tmpRegistry.set(name, mod);
        defs.push(mod.def);
      }
    } catch (e) {
      // skip invalid modules
      // console.warn('tool load failed', file, e);
    }
  }
  REGISTRY = tmpRegistry;
  TOOL_DEFS_CACHE = defs;
  LAST_LOADED_AT = Date.now();
  return { defs, count: defs.length };
}

async function tryStaticFallback() {
  // Fall back to static aggregate if dynamic fails
  const agg = await import('./tools/index.mjs');
  TOOL_DEFS_CACHE = Array.isArray(agg.TOOL_DEFS) ? agg.TOOL_DEFS : [];
  REGISTRY = new Map([
    ['get_time', agg],
    ['echo', agg],
    ['read_dir', agg],
    ['read_file', agg],
    ['write_file', agg],
    ['run_powershell', agg],
  ]);
  LAST_LOADED_AT = Date.now();
  return { defs: TOOL_DEFS_CACHE, count: TOOL_DEFS_CACHE.length };
}

export async function reloadTools() {
  if (!SELF_UPDATE_ENABLED) {
    return tryStaticFallback();
  }
  try {
    return await tryDynamicLoad();
  } catch {
    return tryStaticFallback();
  }
}

export async function getToolDefs() {
  if (TOOL_DEFS_CACHE.length === 0 || (SELF_UPDATE_ENABLED && (Date.now() - LAST_LOADED_AT) > 5000)) {
    await reloadTools();
  }
  return TOOL_DEFS_CACHE;
}

export async function runTool(name, args) {
  const allow = (process?.env?.TOOL_ALLOW || '').trim();
  if (allow) {
    const set = new Set(allow.split(',').map((s) => s.trim()).filter(Boolean));
    if (!set.has(name)) throw new Error(`Tool not allowed by policy: ${name}`);
  }
  if (REGISTRY.size === 0) await reloadTools();
  const mod = REGISTRY.get(name);
  if (!mod || typeof mod.run !== 'function') throw new Error(`Unknown tool: ${name}`);
  try {
    return await mod.run(args || {});
  } catch (e) {
    return `Tool error (${name}): ${e?.message || String(e)}`;
  }
}

// Export a snapshot for compatibility (may be empty until first load)
export const TOOL_DEFS = TOOL_DEFS_CACHE;

// Optional write helper (used by server) – validates size
export async function writeToolFile(name, code) {
  if (!SELF_UPDATE_ENABLED) throw new Error('Self-update is disabled');
  if (typeof name !== 'string' || !name.match(/^[a-z0-9_\-]+\.mjs$/i)) {
    throw new Error('Invalid tool filename; must be [a-z0-9_-]+.mjs');
  }
  if (typeof code !== 'string' || code.length < 1) throw new Error('Code is required');
  if (Buffer.byteLength(code, 'utf8') > WRITE_MAX) throw new Error(`Code exceeds limit (${WRITE_MAX} bytes)`);
  const full = path.join(TOOLS_DIR, name);
  await fs.writeFile(full, code, 'utf8');
  return { path: full };
}

/*
Modular tools live under ./tools/*.mjs
- Add a new tool by copying ./tools/TEMPLATE.mjs or writing via /api/tools/write.
- Env and sandbox helpers are in ./tools/fs_common.mjs.
- Enable self-update routes with FRONTEND_ENABLE_SELF_UPDATE=1
*/

