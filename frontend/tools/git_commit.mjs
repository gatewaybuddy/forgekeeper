import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'git_commit',
    description: 'Create a git commit with staged changes',
    parameters: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: 'Path to git repository (default: current directory)' },
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ repo_path, message } = {}) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('commit message is required');
  }

  const cwd = repo_path || process.cwd();
  const args = ['commit', '-m', message];

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    return { cwd, message, stdout, stderr: stderr || null };
  } catch (err) {
    throw new Error(`git_commit error: ${err?.message || err}`);
  }
}
