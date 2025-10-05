import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'run_powershell',
    description: 'Run a PowerShell command (disabled by default; set FRONTEND_ENABLE_POWERSHELL=1 to enable).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell command text.' },
        timeout_ms: { type: 'integer', description: 'Timeout in ms (default 10000).' },
        cwd: { type: 'string', description: 'Working directory (server container path). Optional.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ command, timeout_ms = 10000, cwd } = {}) {
  // Gated by env; server may toggle this at runtime by updating process.env
  if (process.env.FRONTEND_ENABLE_POWERSHELL !== '1') {
    throw new Error('PowerShell tool disabled (set FRONTEND_ENABLE_POWERSHELL=1 to enable)');
  }
  if (typeof command !== 'string' || !command.trim()) throw new Error('command is required');
  const exe = process.env.PWSH_PATH || 'pwsh';
  const args = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]
    : ['-NoLogo', '-NoProfile', '-Command', command];
  const execOpts = {
    timeout: Number(timeout_ms) || 10000,
    windowsHide: true,
    cwd: typeof cwd === 'string' && cwd.trim() ? cwd : (process.env.PWSH_CWD || undefined),
  };
  const { stdout, stderr } = await execFileAsync(exe, args, execOpts).catch(err => {
    const code = err?.code || '';
    const msg = err?.stderr || err?.message || String(err);
    if (String(code).toUpperCase() === 'ENOENT') {
      throw new Error(`pwsh not found (path: ${exe}). Install PowerShell in the container or set PWSH_PATH.`);
    }
    throw new Error(`pwsh error: ${msg}`);
  });
  return { stdout, stderr };
}

