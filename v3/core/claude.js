// Claude Code headless wrapper
// Executes tasks using Claude Code CLI with full tool access
import { spawn } from 'child_process';
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

  // Build the prompt
  const prompt = buildPrompt(task, options);

  // Check guardrails before execution
  const guardrailCheck = checkGuardrails(prompt);
  if (!guardrailCheck.allowed) {
    return {
      success: false,
      error: `Guardrail blocked: ${guardrailCheck.reason}`,
      guardrailViolation: true,
    };
  }

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
      timeout: config.claude.timeout,
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
export async function query(question, options = {}) {
  if (getCallsLastHour() >= config.guardrails.maxClaudeCallsPerHour) {
    throw new Error(`Rate limit exceeded`);
  }

  recordCall();

  return new Promise((resolve, reject) => {
    const args = ['--print', question];

    const proc = spawn(config.claude.command, args, {
      cwd: options.cwd || process.cwd(),
      timeout: 60000, // 1 minute for queries
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ success: code === 0, output: stdout, error: stderr || null });
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
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
