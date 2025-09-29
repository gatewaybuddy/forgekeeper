import fs from 'node:fs/promises';
import path from 'node:path';
import { FS_ROOT, resolveSafe, MAX_WRITE_BYTES } from './fs_common.mjs';

const norm = (p) => p.split(path.sep).join('/');

export const def = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Write a file under the sandbox root. Limited to TOOLS_MAX_WRITE_BYTES and path must stay within TOOLS_FS_ROOT.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path relative to sandbox root.' },
        content: { type: 'string', description: `File content (<= ${MAX_WRITE_BYTES} bytes).` },
        overwrite: { type: 'boolean', description: 'Allow overwrite if file exists (default false).' },
        encoding: { type: 'string', description: 'Encoding (default utf8).' },
      },
      required: ['file', 'content'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ file, content, overwrite = false, encoding = 'utf8' } = {}) {
  if (typeof file !== 'string' || typeof content !== 'string') throw new Error('file and content are required');
  if (Buffer.byteLength(content, encoding) > MAX_WRITE_BYTES) throw new Error(`content too large (> ${MAX_WRITE_BYTES} bytes)`);
  const full = resolveSafe(file);
  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });
  try {
    if (!overwrite) {
      await fs.access(full);
      throw new Error('file exists (set overwrite=true to replace)');
    }
  } catch {
    // not exists or allowed
  }
  await fs.writeFile(full, content, { encoding });
  const rel = path.relative(FS_ROOT, full);
  return { ok: true, path: norm(rel), bytes: Buffer.byteLength(content, encoding) };
}

