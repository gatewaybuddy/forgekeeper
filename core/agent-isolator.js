/**
 * Agent Isolator for Forgekeeper
 *
 * Spawns isolated agent contexts for autonomous tasks to prevent
 * "split brain" where autonomous work pollutes the main conversation context.
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { config } from '../config.js';
import { randomUUID } from 'crypto';
import { rotateIfNeeded } from './jsonl-rotate.js';
import { resolveClaudeCommand } from './claude.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const ISOLATED_WORK_PATH = join(JOURNAL_DIR, 'isolated_work.jsonl');

// Settings
const ENABLED = config.agentIsolation?.enabled ?? true;
const MAX_AGENTS = config.agentIsolation?.maxAgents ?? 2;
const AGENT_TIMEOUT = config.agentIsolation?.timeoutMs ?? 300000; // 5 minutes

// Active agents tracking
const activeAgents = new Map();
const completedResults = new Map();

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Log isolated work
 */
function logIsolatedWork(entry) {
  ensureJournalDir();

  try {
    appendFileSync(ISOLATED_WORK_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n');
    rotateIfNeeded(ISOLATED_WORK_PATH);
  } catch (err) {
    console.error('[AgentIsolator] Failed to log work:', err.message);
  }
}

/**
 * Check if isolation is enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Get count of active isolated agents
 */
export function getActiveCount() {
  return activeAgents.size;
}

/**
 * Check if we can spawn a new agent
 */
export function canSpawn() {
  return ENABLED && activeAgents.size < MAX_AGENTS;
}

/**
 * Build minimal context for isolated agent
 */
function buildIsolatedContext(task) {
  const parts = [
    'You are Forgekeeper executing an autonomous task.',
    'This is an isolated execution - focus only on this task.',
    '',
    `Task: ${task.description}`,
    '',
    task.context ? `Context: ${task.context}` : '',
    '',
    'Execute the task and provide a clear summary of what you did.',
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * Spawn an isolated agent for a task
 *
 * @param {Object} task - Task to execute
 * @returns {Object} Agent info
 */
export async function spawnIsolatedAgent(task) {
  if (!ENABLED) {
    return {
      success: false,
      reason: 'Agent isolation disabled',
    };
  }

  if (activeAgents.size >= MAX_AGENTS) {
    return {
      success: false,
      reason: `Max concurrent agents reached (${MAX_AGENTS})`,
    };
  }

  const agentId = `agent-${randomUUID().slice(0, 8)}`;
  const startTime = Date.now();

  // Build prompt for isolated execution
  const prompt = buildIsolatedContext(task);

  // Log spawn
  logIsolatedWork({
    event: 'spawn',
    agentId,
    taskId: task.id,
    taskDescription: task.description,
  });

  console.log(`[AgentIsolator] Spawning isolated agent ${agentId} for task: ${task.description?.slice(0, 50)}`);

  // Create agent state
  const agentState = {
    id: agentId,
    taskId: task.id,
    taskDescription: task.description,
    startTime,
    status: 'running',
    output: '',
    error: null,
    process: null,
  };

  // Store in active map
  activeAgents.set(agentId, agentState);

  try {
    // Spawn Claude Code as child process
    const resolved = resolveClaudeCommand();

    const child = spawn(resolved.cmd, [...resolved.prependArgs, '--print', prompt], {
      shell: resolved.shell,
      timeout: AGENT_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    agentState.process = child;

    // Collect output
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    return new Promise((resolve) => {
      child.on('close', (code) => {
        const endTime = Date.now();
        const elapsed = endTime - startTime;

        agentState.status = code === 0 ? 'completed' : 'failed';
        agentState.output = stdout.trim();
        agentState.error = code !== 0 ? (stderr || `Exit code: ${code}`) : null;
        agentState.elapsed = elapsed;

        // Move to completed
        activeAgents.delete(agentId);
        completedResults.set(agentId, agentState);

        // Log completion
        logIsolatedWork({
          event: 'complete',
          agentId,
          taskId: task.id,
          status: agentState.status,
          elapsed,
          outputLength: agentState.output.length,
          error: agentState.error,
        });

        console.log(`[AgentIsolator] Agent ${agentId} ${agentState.status} in ${elapsed}ms`);

        resolve({
          success: true,
          agentId,
          status: agentState.status,
        });
      });

      child.on('error', (err) => {
        agentState.status = 'error';
        agentState.error = err.message;

        activeAgents.delete(agentId);
        completedResults.set(agentId, agentState);

        logIsolatedWork({
          event: 'error',
          agentId,
          taskId: task.id,
          error: err.message,
        });

        console.error(`[AgentIsolator] Agent ${agentId} error:`, err.message);

        resolve({
          success: false,
          agentId,
          error: err.message,
        });
      });

      // Handle timeout
      setTimeout(() => {
        if (activeAgents.has(agentId)) {
          child.kill();
          agentState.status = 'timeout';
          agentState.error = 'Execution timed out';

          activeAgents.delete(agentId);
          completedResults.set(agentId, agentState);

          logIsolatedWork({
            event: 'timeout',
            agentId,
            taskId: task.id,
          });

          console.log(`[AgentIsolator] Agent ${agentId} timed out`);
        }
      }, AGENT_TIMEOUT);
    });

  } catch (err) {
    agentState.status = 'error';
    agentState.error = err.message;
    activeAgents.delete(agentId);

    console.error(`[AgentIsolator] Failed to spawn agent:`, err.message);

    return {
      success: false,
      agentId,
      error: err.message,
    };
  }
}

/**
 * Execute task in isolation (convenience wrapper)
 *
 * @param {Object} task - Task to execute
 * @returns {Promise<Object>} Execution result
 */
export async function executeInIsolation(task) {
  const spawnResult = await spawnIsolatedAgent(task);

  if (!spawnResult.success) {
    return spawnResult;
  }

  // Wait for completion and collect results
  const result = await collectResults(spawnResult.agentId);
  return result;
}

/**
 * Collect results from a completed agent
 *
 * @param {string} agentId - Agent ID
 * @returns {Object} Agent results
 */
export function collectResults(agentId) {
  // Check if still active
  if (activeAgents.has(agentId)) {
    return {
      status: 'running',
      agentId,
      message: 'Agent still executing',
    };
  }

  // Check completed results
  const result = completedResults.get(agentId);

  if (!result) {
    return {
      status: 'not_found',
      agentId,
      message: 'Agent not found',
    };
  }

  return {
    status: result.status,
    agentId,
    taskId: result.taskId,
    taskDescription: result.taskDescription,
    output: result.output,
    error: result.error,
    elapsed: result.elapsed,
    startTime: new Date(result.startTime).toISOString(),
  };
}

/**
 * Summarize agent results for main context injection
 */
function summarizeResults(results) {
  if (results.status !== 'completed') {
    return `Task "${results.taskDescription}" ${results.status}: ${results.error || 'No details'}`;
  }

  // Summarize output (first 300 chars + indication if truncated)
  const outputSummary = results.output.length > 300
    ? results.output.slice(0, 300) + '... (truncated)'
    : results.output;

  return `Completed: "${results.taskDescription}"\nResult: ${outputSummary}`;
}

/**
 * Inject results back to main context as event
 *
 * @param {Object} results - Results from collectResults
 * @returns {Object} Event for main context
 */
export function injectResultsToMain(results) {
  const summary = summarizeResults(results);

  const event = {
    type: 'isolated_task_complete',
    agentId: results.agentId,
    taskId: results.taskId,
    status: results.status,
    summary,
    elapsed: results.elapsed,
    ts: new Date().toISOString(),
  };

  // Log injection
  logIsolatedWork({
    event: 'inject',
    agentId: results.agentId,
    taskId: results.taskId,
    summaryLength: summary.length,
  });

  console.log(`[AgentIsolator] Injected results from ${results.agentId} to main context`);

  return event;
}

/**
 * Get status of all agents
 */
export function getAgentStatuses() {
  const active = Array.from(activeAgents.values()).map(a => ({
    id: a.id,
    taskId: a.taskId,
    status: a.status,
    runningFor: Date.now() - a.startTime,
  }));

  const completed = Array.from(completedResults.entries())
    .slice(-10)
    .map(([id, a]) => ({
      id,
      taskId: a.taskId,
      status: a.status,
      elapsed: a.elapsed,
    }));

  return { active, completed };
}

/**
 * Clean up old completed results
 */
export function cleanupCompleted(maxAge = 3600000) { // 1 hour default
  const now = Date.now();
  let cleaned = 0;

  for (const [id, result] of completedResults.entries()) {
    if ((now - result.startTime) > maxAge) {
      completedResults.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Get module statistics
 */
export function getStats() {
  return {
    enabled: ENABLED,
    maxAgents: MAX_AGENTS,
    timeoutMs: AGENT_TIMEOUT,
    activeCount: activeAgents.size,
    completedCount: completedResults.size,
  };
}

export default {
  isEnabled,
  getActiveCount,
  canSpawn,
  spawnIsolatedAgent,
  executeInIsolation,
  collectResults,
  injectResultsToMain,
  getAgentStatuses,
  cleanupCompleted,
  getStats,
};
