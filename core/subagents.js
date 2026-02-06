/**
 * Session-Scoped Subagents for Forgekeeper
 *
 * Enables spawning isolated subagent sessions for parallel work
 * that don't pollute the main conversation context.
 *
 * Builds on agent-isolator.js with higher-level API and features.
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { getAgentConfig } from './agent-router.js';
import { applyThinkingBudget } from './thinking-levels.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const SUBAGENT_WORK_PATH = join(JOURNAL_DIR, 'subagent_work.jsonl');

// Settings
const MAX_SUBAGENTS = config.subagents?.maxConcurrent ?? 3;
const DEFAULT_TIMEOUT = config.subagents?.defaultTimeoutMs ?? 300000; // 5 minutes

// Active subagents
const activeSubagents = new Map();
const completedSubagents = new Map();

// Event listeners for completion notifications
const completionListeners = [];

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Log subagent work
 */
function logSubagentWork(entry) {
  ensureJournalDir();

  try {
    appendFileSync(SUBAGENT_WORK_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n');
    rotateIfNeeded(SUBAGENT_WORK_PATH);
  } catch (err) {
    console.error('[Subagents] Failed to log work:', err.message);
  }
}

/**
 * Generate subagent ID
 */
function generateSubagentId() {
  return `sub-${randomUUID().slice(0, 8)}`;
}

/**
 * Build context for subagent
 */
function buildSubagentContext(options) {
  const agentProfile = options.agentProfile
    ? getAgentConfig(options.agentProfile)
    : null;

  const parts = [
    'You are Forgekeeper executing a focused task as a subagent.',
    'Complete the task and provide a structured summary.',
    '',
  ];

  if (agentProfile?.systemPromptAddition) {
    parts.push(agentProfile.systemPromptAddition);
    parts.push('');
  }

  parts.push(`Task: ${options.task}`);

  if (options.context) {
    parts.push('');
    parts.push(`Context: ${options.context}`);
  }

  parts.push('');
  parts.push('Provide your response in this format:');
  parts.push('SUMMARY: (1-2 sentence overview)');
  parts.push('DETAILS: (key findings or actions taken)');
  parts.push('STATUS: (completed/partial/blocked)');

  return parts.join('\n');
}

/**
 * Notify completion listeners
 */
function notifyCompletion(result) {
  for (const listener of completionListeners) {
    try {
      listener(result);
    } catch (err) {
      console.error('[Subagents] Listener error:', err.message);
    }
  }
}

/**
 * Parse subagent output into structured result
 */
function parseSubagentOutput(output) {
  const result = {
    summary: '',
    details: '',
    status: 'completed',
    raw: output,
  };

  // Try to extract structured parts
  const summaryMatch = output.match(/SUMMARY:\s*(.+?)(?=DETAILS:|STATUS:|$)/is);
  const detailsMatch = output.match(/DETAILS:\s*(.+?)(?=STATUS:|$)/is);
  const statusMatch = output.match(/STATUS:\s*(\w+)/i);

  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  } else {
    // Fallback: use first 200 chars
    result.summary = output.slice(0, 200).trim();
  }

  if (detailsMatch) {
    result.details = detailsMatch[1].trim();
  }

  if (statusMatch) {
    const status = statusMatch[1].toLowerCase();
    if (['completed', 'partial', 'blocked', 'failed'].includes(status)) {
      result.status = status;
    }
  }

  return result;
}

/**
 * Spawn a subagent for a task
 *
 * @param {Object} options - Subagent options
 * @param {string} options.task - Task description
 * @param {string} options.agentProfile - Agent profile name (from T426)
 * @param {boolean} options.background - Run asynchronously
 * @param {number} options.timeout - Timeout in ms
 * @param {string} options.deliverResultsTo - Where to send results
 * @param {string} options.cleanupPolicy - 'keep' or 'delete'
 * @param {string} options.context - Additional context
 * @returns {Promise<Object>} Spawn result
 */
export async function spawnSubagent(options) {
  if (!options.task) {
    return {
      success: false,
      error: 'Task is required',
    };
  }

  // Check limit
  if (activeSubagents.size >= MAX_SUBAGENTS) {
    return {
      success: false,
      error: `Max concurrent subagents reached (${MAX_SUBAGENTS})`,
    };
  }

  const subagentId = generateSubagentId();
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  // Build prompt
  const prompt = buildSubagentContext(options);

  // Log spawn
  logSubagentWork({
    event: 'spawn',
    subagentId,
    task: options.task,
    agentProfile: options.agentProfile,
    background: options.background,
  });

  console.log(`[Subagents] Spawning ${subagentId}: "${options.task.slice(0, 50)}..."`);

  // Create subagent state
  const subagent = {
    id: subagentId,
    task: options.task,
    agentProfile: options.agentProfile,
    background: options.background ?? true,
    deliverResultsTo: options.deliverResultsTo ?? 'main',
    cleanupPolicy: options.cleanupPolicy ?? 'keep',
    startTime,
    status: 'running',
    output: '',
    result: null,
    error: null,
    process: null,
    tokensUsed: 0,
    duration: 0,
  };

  activeSubagents.set(subagentId, subagent);

  // Execute function
  const execute = async () => {
    try {
      const claudeCmd = config.claude?.command || 'claude';

      const child = spawn(claudeCmd, ['--print', prompt], {
        shell: false,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      subagent.process = child;

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      return new Promise((resolve) => {
        child.on('close', (code) => {
          const endTime = Date.now();
          subagent.duration = endTime - startTime;
          subagent.output = stdout.trim();

          if (code === 0 && stdout.trim()) {
            subagent.status = 'completed';
            subagent.result = parseSubagentOutput(stdout.trim());
          } else {
            subagent.status = 'failed';
            subagent.error = stderr || `Exit code: ${code}`;
          }

          // Move to completed
          activeSubagents.delete(subagentId);
          completedSubagents.set(subagentId, subagent);

          // Log completion
          logSubagentWork({
            event: 'complete',
            subagentId,
            task: options.task,
            status: subagent.status,
            duration: subagent.duration,
            resultSummary: subagent.result?.summary?.slice(0, 100),
            error: subagent.error,
          });

          console.log(`[Subagents] ${subagentId} ${subagent.status} in ${subagent.duration}ms`);

          // Notify listeners
          notifyCompletion({
            subagentId,
            task: options.task,
            status: subagent.status,
            result: subagent.result,
            duration: subagent.duration,
          });

          resolve({
            success: subagent.status === 'completed',
            subagentId,
            status: subagent.status,
            result: subagent.result,
            duration: subagent.duration,
          });
        });

        child.on('error', (err) => {
          subagent.status = 'error';
          subagent.error = err.message;
          subagent.duration = Date.now() - startTime;

          activeSubagents.delete(subagentId);
          completedSubagents.set(subagentId, subagent);

          logSubagentWork({
            event: 'error',
            subagentId,
            error: err.message,
          });

          console.error(`[Subagents] ${subagentId} error:`, err.message);

          notifyCompletion({
            subagentId,
            task: options.task,
            status: 'error',
            error: err.message,
          });

          resolve({
            success: false,
            subagentId,
            error: err.message,
          });
        });

        // Handle timeout
        setTimeout(() => {
          if (activeSubagents.has(subagentId)) {
            child.kill();
            subagent.status = 'timeout';
            subagent.error = 'Execution timed out';
            subagent.duration = timeout;

            activeSubagents.delete(subagentId);
            completedSubagents.set(subagentId, subagent);

            logSubagentWork({
              event: 'timeout',
              subagentId,
            });

            console.log(`[Subagents] ${subagentId} timed out after ${timeout}ms`);

            notifyCompletion({
              subagentId,
              task: options.task,
              status: 'timeout',
            });
          }
        }, timeout);
      });

    } catch (err) {
      subagent.status = 'error';
      subagent.error = err.message;
      activeSubagents.delete(subagentId);

      return {
        success: false,
        subagentId,
        error: err.message,
      };
    }
  };

  // Run in background or wait
  if (options.background !== false) {
    // Start execution but don't await
    execute();

    return {
      success: true,
      subagentId,
      status: 'spawned',
      message: 'Subagent started in background',
    };
  } else {
    // Wait for completion
    return execute();
  }
}

/**
 * Get status of a subagent
 */
export function getSubagentStatus(subagentId) {
  // Check active
  if (activeSubagents.has(subagentId)) {
    const sub = activeSubagents.get(subagentId);
    return {
      subagentId,
      status: 'running',
      task: sub.task,
      runningFor: Date.now() - sub.startTime,
    };
  }

  // Check completed
  if (completedSubagents.has(subagentId)) {
    const sub = completedSubagents.get(subagentId);
    return {
      subagentId,
      status: sub.status,
      task: sub.task,
      result: sub.result,
      error: sub.error,
      duration: sub.duration,
    };
  }

  return {
    subagentId,
    status: 'not_found',
  };
}

/**
 * Collect results from a completed subagent
 */
export function collectResults(subagentId) {
  const status = getSubagentStatus(subagentId);

  if (status.status === 'not_found') {
    return null;
  }

  if (status.status === 'running') {
    return {
      subagentId,
      status: 'running',
      message: 'Subagent still executing',
    };
  }

  const sub = completedSubagents.get(subagentId);

  return {
    subagentId,
    task: sub.task,
    status: sub.status,
    result: sub.result,
    error: sub.error,
    tokensUsed: sub.tokensUsed,
    duration: sub.duration,
  };
}

/**
 * Cancel a running subagent
 */
export function cancelSubagent(subagentId) {
  if (!activeSubagents.has(subagentId)) {
    return {
      success: false,
      reason: 'Subagent not found or not running',
    };
  }

  const sub = activeSubagents.get(subagentId);

  if (sub.process) {
    sub.process.kill();
  }

  sub.status = 'cancelled';
  sub.duration = Date.now() - sub.startTime;

  activeSubagents.delete(subagentId);
  completedSubagents.set(subagentId, sub);

  logSubagentWork({
    event: 'cancel',
    subagentId,
  });

  console.log(`[Subagents] ${subagentId} cancelled`);

  return {
    success: true,
    subagentId,
  };
}

/**
 * List all active subagents
 */
export function listActiveSubagents() {
  return Array.from(activeSubagents.values()).map(sub => ({
    subagentId: sub.id,
    task: sub.task,
    agentProfile: sub.agentProfile,
    status: sub.status,
    runningFor: Date.now() - sub.startTime,
  }));
}

/**
 * Register a completion listener
 */
export function onCompletion(callback) {
  completionListeners.push(callback);
}

/**
 * Remove a completion listener
 */
export function offCompletion(callback) {
  const index = completionListeners.indexOf(callback);
  if (index >= 0) {
    completionListeners.splice(index, 1);
  }
}

/**
 * Get module statistics
 */
export function getStats() {
  return {
    maxSubagents: MAX_SUBAGENTS,
    defaultTimeout: DEFAULT_TIMEOUT,
    activeCount: activeSubagents.size,
    completedCount: completedSubagents.size,
    listenerCount: completionListeners.length,
  };
}

/**
 * Cleanup old completed subagents
 */
export function cleanup(maxAge = 3600000) {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, sub] of completedSubagents.entries()) {
    if ((now - sub.startTime) > maxAge) {
      if (sub.cleanupPolicy !== 'keep') {
        completedSubagents.delete(id);
        cleaned++;
      }
    }
  }

  return cleaned;
}

export default {
  spawnSubagent,
  getSubagentStatus,
  collectResults,
  cancelSubagent,
  listActiveSubagents,
  onCompletion,
  offCompletion,
  getStats,
  cleanup,
};
