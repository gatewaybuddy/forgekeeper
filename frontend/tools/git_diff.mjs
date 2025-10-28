import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'git_diff',
    description: 'Show git diff for repository (unstaged changes)',
    parameters: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: 'Path to git repository (default: current directory)' },
        file_path: { type: 'string', description: 'Optional: specific file to diff' },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ repo_path, file_path } = {}) {
  const cwd = repo_path || process.cwd();
  const args = ['diff'];
  if (file_path) args.push('--', file_path);

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { cwd, diff: stdout, stderr: stderr || null };
  } catch (err) {
    throw new Error(`git_diff error: ${err?.message || err}`);
  }
}
