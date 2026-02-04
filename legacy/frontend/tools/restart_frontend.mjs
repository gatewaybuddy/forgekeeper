import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'restart_frontend',
    description: 'Restart the frontend Docker container to reload code changes. Use after making file changes that need to take effect.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run() {
  try {
    // Restart the frontend container using docker compose
    const { stdout, stderr } = await execFileAsync('docker', ['compose', 'restart', 'frontend'], {
      cwd: '/workspace',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return {
      status: 'restarting',
      message: 'Frontend container is restarting. Changes will take effect in ~10 seconds.',
      stdout,
      stderr: stderr || null,
    };
  } catch (err) {
    throw new Error(`restart_frontend error: ${err?.message || err}`);
  }
}
