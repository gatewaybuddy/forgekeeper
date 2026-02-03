// Claude Code headless wrapper
// Executes tasks using Claude Code CLI with full tool access
import { spawn, exec } from 'child_process';
import { config } from '../config.js';
import { learnings } from './memory.js';
import { checkGuardrails, formatGuardrailsForPrompt } from './guardrails.js';

// Track call rate
const callHistory = [];

function recordCall() {
  const now = Date.now();
  callHistory.push(now);
  // Keep only last hour
  const hourAgo = now - 3600000;
  while (callHistory.length > 0 && callHistory[0] < hourAgo) {
    callHistory.shift();
  }
}

function getCallsLastHour() {
  const hourAgo = Date.now() - 3600000;
  return callHistory.filter(t => t >= hourAgo).length;
}

// Execute a task using Claude Code
export async function execute(task, options = {}) {
  // Rate limit check
  if (getCallsLastHour() >= config.guardrails.maxClaudeCallsPerHour) {
    throw new Error(`Rate limit exceeded: ${config.guardrails.maxClaudeCallsPerHour} calls/hour`);
  }

  // Check guardrails on task description only (not the full prompt with system text)
  const taskText = task.description || (typeof task === 'string' ? task : '');
  const guardrailCheck = checkGuardrails(taskText);
  if (!guardrailCheck.allowed) {
    return {
      success: false,
      error: `Guardrail blocked: ${guardrailCheck.reason}`,
      guardrailViolation: true,
    };
  }

  // Build the prompt after guardrail check passes
  const prompt = buildPrompt(task, options);

  recordCall();

  return new Promise((resolve, reject) => {
    const args = [
      '--print',           // Non-interactive, print output
      '--dangerously-skip-permissions', // We handle our own guardrails
      prompt,
    ];

    // Add allowed tools if specified
    if (options.allowedTools) {
      args.unshift('--allowedTools', options.allowedTools.join(','));
    }

    const proc = spawn(config.claude.command, args, {
      cwd: options.cwd || process.cwd(),
      shell: true, // Required on Windows for .cmd files
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || null,
        exitCode: code,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: stdout,
        error: err.message,
        exitCode: -1,
      });
    });

    // Handle timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        output: stdout,
        error: 'Task timed out',
        exitCode: -1,
        timedOut: true,
      });
    }, config.claude.timeout);
  });
}

// Build a well-structured prompt for Claude Code
function buildPrompt(task, options = {}) {
  const parts = [];

  // Task description
  parts.push(`## Task\n${task.description || task}`);

  // Goal context if available
  if (task.goal) {
    parts.push(`## Goal Context\nThis task is part of: ${task.goal.description}`);
  }

  // Relevant learnings
  const tags = task.tags || extractTags(task.description || task);
  const relevantLearnings = learnings.find(tags, config.learning.minConfidence);
  if (relevantLearnings.length > 0) {
    parts.push(`## Relevant Learnings from Previous Work`);
    for (const l of relevantLearnings.slice(0, 5)) {
      parts.push(`- ${l.observation} (confidence: ${l.confidence.toFixed(2)})`);
    }
  }

  // Additional context
  if (options.additionalContext) {
    parts.push(`## Additional Context\n${options.additionalContext}`);
  }

  // Guardrails reminder
  parts.push(`## Guardrails\n${formatGuardrailsForPrompt()}`);

  // Output format
  parts.push(`## Output Format
Provide a clear summary of what you did and the outcome.
If you created or modified files, list them.
If you encountered errors, explain what went wrong and any recovery attempted.`);

  return parts.join('\n\n');
}

// Extract tags from task description for learning lookup
function extractTags(text) {
  const keywords = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Common tech terms to prioritize
  const techTerms = ['react', 'node', 'python', 'deploy', 'test', 'build', 'git',
                     'api', 'database', 'docker', 'kubernetes', 'aws', 'auth'];

  return keywords.filter(k => techTerms.includes(k) || keywords.indexOf(k) < 10);
}

// Quick query - for simple questions that don't need full task treatment
// Does NOT maintain conversation context (one-shot)
export async function query(question, options = {}) {
  if (getCallsLastHour() >= config.guardrails.maxClaudeCallsPerHour) {
    throw new Error(`Rate limit exceeded`);
  }

  recordCall();

  return runClaudeCommand(question, options);
}

// Track which sessions have been created (first message sent)
// This is exported so index.js can mark loaded sessions as existing
export const createdSessions = new Set();

// Chat with persistent session - maintains conversation context
// sessionId should be a UUID that persists across calls for the same user
export async function chat(message, sessionId, options = {}) {
  if (getCallsLastHour() >= config.guardrails.maxClaudeCallsPerHour) {
    throw new Error(`Rate limit exceeded`);
  }

  recordCall();

  // First message to this session uses --session-id, subsequent use --resume
  const isNewSession = !createdSessions.has(sessionId);

  let result = await runClaudeCommand(message, {
    ...options,
    sessionId,
    resumeSession: !isNewSession
  });

  // If resume failed (session doesn't exist in Claude), try creating new
  if (!result.success && !isNewSession && result.error?.includes('session')) {
    console.log(`[Claude] Session ${sessionId} not found, creating new...`);
    createdSessions.delete(sessionId);
    result = await runClaudeCommand(message, {
      ...options,
      sessionId,
      resumeSession: false
    });
  }

  // Mark session as created if successful
  if (result.success) {
    createdSessions.add(sessionId);
  }

  return result;
}

// Mark a session as new (for /newsession command)
export function resetSessionState(sessionId) {
  createdSessions.delete(sessionId);
}

// Internal function to run Claude CLI
function runClaudeCommand(message, options = {}) {
  return new Promise((resolve) => {
    // Sanitize and escape the message for PowerShell
    const sanitized = message
      .replace(/\r\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/"/g, '`"')  // PowerShell escape for double quotes
      .replace(/'/g, "''")  // PowerShell escape for single quotes
      .slice(0, 4000); // Allow longer prompts

    // Use PowerShell on Windows
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    const shellFlag = isWindows ? '-Command' : '-c';

    // Build command flags
    const flags = [];
    if (config.claude.skipPermissions) {
      flags.push('--dangerously-skip-permissions');
    }
    if (options.sessionId) {
      if (options.resumeSession) {
        // Resume existing session
        flags.push(`--resume ${options.sessionId}`);
      } else {
        // Create new session with this ID
        flags.push(`--session-id ${options.sessionId}`);
      }
    }
    flags.push('-p');

    const command = `claude ${flags.join(' ')} "${sanitized}"`;

    const proc = spawn(shell, [shellFlag, command], {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    // Longer timeout for complex operations (3 minutes)
    const timeoutMs = options.timeout || 180000;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        resolve({ success: false, output: '', error: `Query timed out after ${timeoutMs/1000}s` });
      }
    }, timeoutMs);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: code === 0, output: stdout, error: stderr || null });
      }
    });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ success: false, output: '', error: err.message });
      }
    });
  });
}

// Decompose a goal into tasks using Claude Code
export async function decomposeGoal(goal) {
  const prompt = `Decompose this goal into concrete, actionable tasks:

Goal: ${goal.description}
${goal.success_criteria ? `Success Criteria: ${goal.success_criteria}` : ''}

Return a JSON array of tasks, each with:
- description: what needs to be done
- dependencies: array of task indices this depends on (0-indexed)
- estimated_complexity: low/medium/high

Example output:
\`\`\`json
[
  {"description": "Set up project structure", "dependencies": [], "estimated_complexity": "low"},
  {"description": "Implement core logic", "dependencies": [0], "estimated_complexity": "high"}
]
\`\`\`

Return ONLY the JSON array, no other text.`;

  const result = await query(prompt);

  if (!result.success) {
    throw new Error(`Failed to decompose goal: ${result.error}`);
  }

  try {
    // Extract JSON from response
    const jsonMatch = result.output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse decomposition: ${e.message}`);
  }
}

// Check if we should continue working (for multi-step tasks)
export async function shouldContinue(context) {
  const prompt = `Given the current state, should I continue working or stop?

Context: ${context.summary}
Last action: ${context.lastAction}
${context.error ? `Last error: ${context.error}` : ''}

Reply with ONLY one of: CONTINUE, STOP, ASK_USER`;

  const result = await query(prompt);
  const decision = result.output.trim().toUpperCase();

  if (decision.includes('CONTINUE')) return 'continue';
  if (decision.includes('STOP')) return 'stop';
  return 'ask_user';
}

export default { execute, query, decomposeGoal, shouldContinue, getCallsLastHour };
