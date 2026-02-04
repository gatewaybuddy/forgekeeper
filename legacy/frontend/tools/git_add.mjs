import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'git_add',
    description: 'Stage files for git commit',
    parameters: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: 'Path to git repository (default: current directory)' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to stage (use ["."] to stage all)'
        },
      },
      required: ['files'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ repo_path, files } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('files array is required and must not be empty');
  }

  const cwd = repo_path || process.cwd();
  const args = ['add', '--', ...files];

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return { cwd, added: files, stdout, stderr: stderr || null };
  } catch (err) {
    throw new Error(`git_add error: ${err?.message || err}`);
  }
}
