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
    // [T303] Enhanced error with full context (stdout, stderr, exit code, signal)
    const code = err?.code;
    const exitCode = typeof code === 'number' ? code : null;
    const signal = err?.signal || null;
    const stdout = err?.stdout || '';
    const stderr = err?.stderr || '';

    // Check for ENOENT (executable not found)
    if (String(code).toUpperCase() === 'ENOENT') {
      const enhancedError = new Error(`${exe} not found. Install bash or set BASH_PATH.`);
      enhancedError.code = 'ENOENT';
      enhancedError.stdout = stdout;
      enhancedError.stderr = stderr;
      throw enhancedError;
    }

    // Create enhanced error with full context
    const msg = stderr || err?.message || String(err);
    const enhancedError = new Error(`bash error (exit ${exitCode || 'unknown'}): ${msg}`);
    enhancedError.code = exitCode;
    enhancedError.stdout = stdout;
    enhancedError.stderr = stderr;
    enhancedError.signal = signal;
    enhancedError.command = script;

    throw enhancedError;
  }
}

