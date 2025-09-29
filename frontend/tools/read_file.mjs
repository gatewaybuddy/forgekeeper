import fs from 'node:fs/promises';
import path from 'node:path';
import { FS_ROOT, resolveSafe, MAX_READ_BYTES } from './fs_common.mjs';

const norm = (p) => p.split(path.sep).join('/');

export const def = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a text file under the sandbox root. Returns up to TOOLS_MAX_READ_BYTES unless a smaller maxBytes is provided.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path relative to sandbox root.' },
        encoding: { type: 'string', description: 'Text encoding (default utf8).' },
        maxBytes: { type: 'integer', description: `Max bytes to read (<= ${MAX_READ_BYTES}).` },
      },
      required: ['file'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ file, encoding = 'utf8', maxBytes } = {}) {
  if (typeof file !== 'string') throw new Error('file is required');
  const full = resolveSafe(file);
  const st = await fs.stat(full);
  const limit = Math.max(1, Math.min(Number(maxBytes || MAX_READ_BYTES), MAX_READ_BYTES));
  let truncated = false;
  let content;
  if (st.size > limit) {
    truncated = true;
    const fh = await fs.open(full, 'r');
    try {
      const buf = Buffer.allocUnsafe(limit);
      await fh.read(buf, 0, limit, 0);
      content = buf.toString(encoding);
    } finally {
      await fh.close();
    }
  } else {
    content = await fs.readFile(full, { encoding });
  }
  const rel = path.relative(FS_ROOT, full);
  return { path: norm(rel), bytes: st.size, readBytes: Buffer.byteLength(content, encoding), truncated, encoding, content };
}

