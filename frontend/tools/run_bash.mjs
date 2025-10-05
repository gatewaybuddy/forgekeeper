import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'run_bash',
    description: 'Run a bash script inside the frontend container (dev only; gated by env). Useful for quick setup and installing test deps.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Bash script (non-interactive). Use && to chain commands.' },
        timeout_ms: { type: 'integer', description: 'Timeout in ms (default 15000).' },
        cwd: { type: 'string', description: 'Working directory (container path).' },
      },
      required: ['script'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ script, timeout_ms = 15000, cwd } = {}) {
  if (process.env.FRONTEND_ENABLE_BASH !== '1') {
    throw new Error('Bash tool disabled (set FRONTEND_ENABLE_BASH=1 to enable)');
  }
  if (typeof script !== 'string' || !script.trim()) throw new Error('script is required');
  const bash = process.env.BASH_PATH || '/bin/bash';
  const hasBash = fs.existsSync(bash);
  const exe = hasBash ? bash : '/bin/sh';
  const args = hasBash ? ['-lc', script] : ['-lc', script];
  const opts = {
    timeout: Number(timeout_ms) || 15000,
    windowsHide: true,
    cwd: typeof cwd === 'string' && cwd.trim() ? cwd : (process.env.BASH_CWD || undefined),
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  };
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, opts);
    return { shell: exe, stdout, stderr };
  } catch (err) {
    const code = err?.code || '';
    const msg = err?.stderr || err?.message || String(err);
    if (String(code).toUpperCase() === 'ENOENT') {
      throw new Error(`${exe} not found. Install bash or set BASH_PATH.`);
    }
    throw new Error(`bash error: ${msg}`);
  }
}

