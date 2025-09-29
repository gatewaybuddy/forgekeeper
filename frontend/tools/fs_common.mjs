import path from 'node:path';

export const FS_ROOT = path.resolve(process.env.TOOLS_FS_ROOT || process.cwd());
export const MAX_WRITE_BYTES = Number(process.env.TOOLS_MAX_WRITE_BYTES || 64 * 1024);
export const MAX_READ_BYTES = Number(process.env.TOOLS_MAX_READ_BYTES || 64 * 1024);

export function resolveSafe(p = '.') {
  const full = path.resolve(FS_ROOT, p || '.');
  const rel = path.relative(FS_ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes sandbox: ${p}`);
  }
  return full;
}

// Re-export a tiny sample template note for tooling discoverability is provided in TEMPLATE.mjs

