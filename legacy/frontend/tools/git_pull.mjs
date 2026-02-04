import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'git_pull',
    description: 'Pull latest changes from remote repository',
    parameters: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: 'Path to git repository (default: current directory)' },
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch name (optional)' },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ repo_path, remote = 'origin', branch } = {}) {
  const cwd = repo_path || process.cwd();
  const args = ['pull', remote];
  if (branch) args.push(branch);

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { cwd, remote, branch: branch || 'current', stdout, stderr: stderr || null };
  } catch (err) {
    throw new Error(`git_pull error: ${err?.message || err}`);
  }
}
