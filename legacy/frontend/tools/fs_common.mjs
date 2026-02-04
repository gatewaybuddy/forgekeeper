import path from 'node:path';

// T301: Configurable filesystem sandbox (default: disabled for maximum capability)
export const ENABLE_FS_SANDBOX = process.env.ENABLE_FS_SANDBOX === '1';
export const FS_ROOT = path.resolve(process.env.TOOLS_FS_ROOT || '/workspace');
export const MAX_WRITE_BYTES = Number(process.env.TOOLS_MAX_WRITE_BYTES || 64 * 1024);
export const MAX_READ_BYTES = Number(process.env.TOOLS_MAX_READ_BYTES || 64 * 1024);

/**
 * Resolve path with optional sandbox enforcement.
 *
 * When ENABLE_FS_SANDBOX=0 (default): Full filesystem access, resolves from root
 * When ENABLE_FS_SANDBOX=1: Sandboxed access, confined to FS_ROOT
 *
 * @param {string} p - Path to resolve
 * @returns {string} Absolute resolved path
 * @throws {Error} If path escapes sandbox (when sandbox enabled)
 */
export function resolveSafe(p = '.') {
  // When sandbox disabled, resolve from filesystem root for full access
  if (!ENABLE_FS_SANDBOX) {
    // If path is absolute, use it directly; otherwise resolve from FS_ROOT
    return path.isAbsolute(p) ? path.resolve(p) : path.resolve(FS_ROOT, p || '.');
  }

  // Sandbox enabled: enforce boundaries
  const full = path.resolve(FS_ROOT, p || '.');
  const rel = path.relative(FS_ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes sandbox: ${p}`);
  }
  return full;
}

// Re-export a tiny sample template note for tooling discoverability is provided in TEMPLATE.mjs

