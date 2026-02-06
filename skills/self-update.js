// Self-update skill - allows Forgekeeper to update itself from git
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export default {
  name: 'self-update',
  description: 'Update Forgekeeper from git repository and restart',
  triggers: ['update', 'self-update', 'pull latest', 'upgrade', 'update yourself'],

  approval: {
    required: true,
    level: 'confirm',
    reason: 'Self-update will pull code changes and restart the process',
  },

  async execute(task) {
    const dryRun = task.dryRun || task.description?.includes('dry run');
    const force = task.force || task.description?.includes('force');
    const skipRestart = task.skipRestart || task.description?.includes('no restart');

    console.log('[Self-Update] Starting update process...');

    try {
      const result = await runUpdateScript({ dryRun, force, skipRestart });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async validate(result) {
    return result.success;
  },
};

function runUpdateScript({ dryRun, force, skipRestart }) {
  return new Promise((resolve, reject) => {
    const args = [join(ROOT, 'scripts', 'self-update.js')];

    if (dryRun) args.push('--dry-run');
    if (force) args.push('--force');
    if (skipRestart) args.push('--no-restart');

    console.log(`[Self-Update] Running: node ${args.join(' ')}`);

    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text); // Stream to console
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: output.trim(),
          message: 'Update completed successfully',
        });
      } else {
        resolve({
          success: false,
          error: errorOutput || `Update script exited with code ${code}`,
          output: output.trim(),
        });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Quick check function for use elsewhere
export async function checkForUpdates() {
  const { checkIfBehind } = await import('../scripts/self-update.js');
  return checkIfBehind();
}
