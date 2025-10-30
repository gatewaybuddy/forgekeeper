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
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, execOpts);
    return { stdout, stderr };
  } catch (err) {
    // [T303] Enhanced error with full context (stdout, stderr, exit code, signal)
    const code = err?.code;
    const exitCode = typeof code === 'number' ? code : null;
    const signal = err?.signal || null;
    const stdout = err?.stdout || '';
    const stderr = err?.stderr || '';

    // Check for ENOENT (executable not found)
    if (String(code).toUpperCase() === 'ENOENT') {
      const enhancedError = new Error(`pwsh not found (path: ${exe}). Install PowerShell in the container or set PWSH_PATH.`);
      enhancedError.code = 'ENOENT';
      enhancedError.stdout = stdout;
      enhancedError.stderr = stderr;
      throw enhancedError;
    }

    // Create enhanced error with full context
    const msg = stderr || err?.message || String(err);
    const enhancedError = new Error(`pwsh error (exit ${exitCode || 'unknown'}): ${msg}`);
    enhancedError.code = exitCode;
    enhancedError.stdout = stdout;
    enhancedError.stderr = stderr;
    enhancedError.signal = signal;
    enhancedError.command = command;

    throw enhancedError;
  }
}

