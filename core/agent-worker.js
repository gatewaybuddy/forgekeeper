// Agent Worker - Runs in a worker thread to execute tasks via Claude
import { parentPort, workerData } from 'worker_threads';
import { spawn } from 'child_process';
import { config } from '../config.js';

const { agentId } = workerData;

console.log(`[Worker:${agentId}] Starting...`);

// Notify parent we're ready
parentPort.postMessage({ type: 'ready', agentId });

// Handle messages from parent
parentPort.on('message', async (message) => {
  switch (message.type) {
    case 'execute_task':
      await executeTask(message.taskId, message.task);
      break;

    case 'shutdown':
      console.log(`[Worker:${agentId}] Shutting down...`);
      process.exit(0);
      break;

    default:
      console.log(`[Worker:${agentId}] Unknown message:`, message.type);
  }
});

/**
 * Execute a task using Claude CLI
 */
async function executeTask(taskId, task) {
  const startTime = Date.now();

  parentPort.postMessage({
    type: 'task_started',
    taskId,
    agentId,
  });

  try {
    const result = await runClaude(task);
    const elapsed = Date.now() - startTime;

    parentPort.postMessage({
      type: 'task_completed',
      taskId,
      agentId,
      result,
      elapsed,
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'task_failed',
      taskId,
      agentId,
      error: error.message,
    });
  }
}

/**
 * Run Claude CLI with the task
 */
function runClaude(task) {
  return new Promise((resolve, reject) => {
    const description = task.description || task;
    const timeout = config.claude?.timeout || 300000; // 5 min default

    // Build the prompt
    const prompt = buildPrompt(task);

    // Build command arguments as an array - no shell needed
    const args = ['-p'];
    if (config.claude?.skipPermissions) {
      args.unshift('--dangerously-skip-permissions');
    }
    args.push(prompt);

    let output = '';
    let errorOutput = '';

    // Use shell: false to prevent command injection via task descriptions
    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env: { ...process.env },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      output += data.toString();
      // Send progress updates
      parentPort.postMessage({
        type: 'task_progress',
        taskId: task.id,
        agentId,
        progress: output.length,
      });
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Timeout handler
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Task timed out'));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code === 0) {
        resolve({
          success: true,
          output: output.trim(),
        });
      } else {
        reject(new Error(errorOutput || `Process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Build the prompt for Claude
 */
function buildPrompt(task) {
  const description = task.description || task;

  return `You are an autonomous agent (${agentId}) working on a task.

TASK: ${description}

INSTRUCTIONS:
1. Complete this task independently
2. Be focused and efficient
3. Report what you did clearly

Do NOT over-engineer. Complete the specific task and stop.`;
}

// escapeForShell removed - no longer needed with shell: false
