import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'git_status',
    description: 'Check git repository status (modified files, branch, etc.)',
    parameters: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: 'Path to git repository (default: current directory)' },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ repo_path } = {}) {
  const cwd = repo_path || process.cwd();
  try {
    const { stdout, stderr } = await execFileAsync('git', ['status', '--porcelain', '--branch'], {
      cwd,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    return { cwd, status: stdout, stderr: stderr || null };
  } catch (err) {
    throw new Error(`git_status error: ${err?.message || err}`);
  }
}
