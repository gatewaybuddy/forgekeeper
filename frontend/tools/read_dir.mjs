import fs from 'node:fs/promises';
import path from 'node:path';
import { FS_ROOT, resolveSafe } from './fs_common.mjs';

const norm = (p) => p.split(path.sep).join('/');

export const def = {
  type: 'function',
  function: {
    name: 'read_dir',
    description: 'List files and folders under a sandboxed directory. Root is TOOLS_FS_ROOT.',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Directory path relative to sandbox root.' },
        recursive: { type: 'boolean', description: 'Whether to recurse (depth<=4).' },
        maxEntries: { type: 'integer', description: 'Max entries to return (default 200).' },
      },
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ dir = '.', recursive = false, maxEntries = 200 } = {}) {
  const root = resolveSafe(dir);
  const out = [];
  async function walk(current, depth) {
    const dentries = await fs.readdir(current, { withFileTypes: true });
    for (const d of dentries) {
      if (out.length >= maxEntries) return;
      const p = path.join(current, d.name);
      const rel = path.relative(FS_ROOT, p);
      const entry = { path: norm(rel), type: d.isDirectory() ? 'dir' : (d.isFile() ? 'file' : 'other') };
      try {
        if (d.isFile()) {
          const st = await fs.stat(p);
          entry.size = st.size;
        }
      } catch {}
      out.push(entry);
      if (recursive && d.isDirectory() && depth < 4) {
        await walk(p, depth + 1);
        if (out.length >= maxEntries) return;
      }
    }
  }
  await walk(root, 0);
  return { root: norm(path.relative(FS_ROOT, root)), entries: out };
}

