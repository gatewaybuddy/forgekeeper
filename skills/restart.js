// Restart skill - Allows Forgekeeper to restart itself via PM2
import { spawn } from 'child_process';

export default {
  name: 'restart',
  description: 'Restart Forgekeeper process (requires PM2)',
  triggers: ['restart', 'reboot', 'self-restart'],

  approval: {
    required: true,
    level: 'confirm',
    reason: 'Self-restart will temporarily interrupt all operations',
  },

  async execute(task) {
    const action = task.action || 'restart';

    console.log(`[Restart] Initiating ${action}...`);

    try {
      switch (action) {
        case 'restart':
          return await pm2Command('restart', 'forgekeeper');

        case 'reload':
          // Graceful reload (zero-downtime if in cluster mode)
          return await pm2Command('reload', 'forgekeeper');

        case 'stop':
          return await pm2Command('stop', 'forgekeeper');

        case 'status':
          return await pm2Command('status');

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
      }
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

/**
 * Execute a PM2 command
 */
function pm2Command(command, target = '') {
  return new Promise((resolve, reject) => {
    const args = target ? [command, target] : [command];

    console.log(`[Restart] Running: pm2 ${args.join(' ')}`);

    const proc = spawn('pm2', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: output.trim(),
          message: `PM2 ${command} completed successfully`,
        });
      } else {
        resolve({
          success: false,
          error: errorOutput || `PM2 command failed with code ${code}`,
          output: output.trim(),
        });
      }
    });

    proc.on('error', (err) => {
      // PM2 not installed or not found
      if (err.code === 'ENOENT') {
        resolve({
          success: false,
          error: 'PM2 is not installed. Run: npm install -g pm2',
        });
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Check if running under PM2
 */
export function isRunningUnderPM2() {
  return !!process.env.PM2_HOME || !!process.env.pm_id;
}

/**
 * Schedule a restart (useful for self-updates)
 */
export function scheduleRestart(delayMs = 1000) {
  console.log(`[Restart] Scheduling restart in ${delayMs}ms...`);

  setTimeout(() => {
    if (isRunningUnderPM2()) {
      // PM2 will auto-restart
      process.exit(0);
    } else {
      // Fallback: try pm2 restart anyway
      spawn('pm2', ['restart', 'forgekeeper'], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      }).unref();

      process.exit(0);
    }
  }, delayMs);
}
