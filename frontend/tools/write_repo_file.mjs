import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.env.REPO_ROOT || '/workspace';
const ENABLED = process.env.FRONTEND_ENABLE_REPO_WRITE === '1';
const MAX_BYTES = Number(process.env.REPO_WRITE_MAX_BYTES || 128 * 1024);
const ALLOW = (process.env.REPO_WRITE_ALLOW || 'frontend/Dockerfile,docker-compose.yml')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const def = {
  type: 'function',
  function: {
    name: 'write_repo_file',
    description: 'Write a file under the repository root (dev only). Intended for updating Dockerfile or docker-compose.yml to persist dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative path (e.g., frontend/Dockerfile or docker-compose.yml). Must be in allowlist.' },
        content: { type: 'string', description: 'New file contents (UTF-8).' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    strict: true,
  },
};

function resolveRepoSafe(rel) {
  const full = path.resolve(REPO_ROOT, rel || '.');
  const base = path.resolve(REPO_ROOT);
  const back = path.relative(base, full);
  if (back.startsWith('..') || path.isAbsolute(back)) throw new Error('Path escapes repo root');
  return full;
}

export async function run({ path: relPath, content } = {}) {
  if (!ENABLED) throw new Error('Repo write disabled (set FRONTEND_ENABLE_REPO_WRITE=1)');
  if (typeof relPath !== 'string' || !relPath.trim()) throw new Error('path is required');
  if (typeof content !== 'string') throw new Error('content is required');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES) throw new Error(`content exceeds limit (${MAX_BYTES} bytes)`);
  if (!ALLOW.includes(relPath)) throw new Error(`path not allowed: ${relPath}`);
  const full = resolveRepoSafe(relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return { ok: true, path: relPath, bytes };
}

