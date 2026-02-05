// Claude Code headless wrapper
// Executes tasks using Claude Code CLI with full tool access
import { spawn, exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { learnings, conversations } from './memory.js';
import { checkGuardrails, formatGuardrailsForPrompt } from './guardrails.js';
import { getSession, recordMessage, rotateSession } from './session-manager.js';
import { notifyChatActivity } from './chat-state.js';
import { getLatestThought } from './inner-life.js';

// Personality paths
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'D:/Projects/forgekeeper_personality';
const IMPERATIVES_PATH = join(PERSONALITY_PATH, 'identity/imperatives.json');

// Cache personality to avoid repeated file reads
let cachedPersonality = null;
let personalityLoadedAt = 0;
const PERSONALITY_CACHE_MS = 60000; // Refresh every minute

function loadPersonality() {
  const now = Date.now();
  if (cachedPersonality && (now - personalityLoadedAt) < PERSONALITY_CACHE_MS) {
    return cachedPersonality;
  }

  if (!existsSync(IMPERATIVES_PATH)) {
    console.log('[Claude] No personality found at', IMPERATIVES_PATH);
    return null;
  }

  try {
    cachedPersonality = JSON.parse(readFileSync(IMPERATIVES_PATH, 'utf-8'));
    personalityLoadedAt = now;
    return cachedPersonality;
  } catch (error) {
    console.error('[Claude] Failed to load personality:', error.message);
    return null;
  }
}

// Build chat context - KEEP IT SIMPLE
// CLAUDE.md handles all personality and identity
// We just pass the message, maybe with a thought hint
function buildChatContext(userId, message) {
  // For now: just pass the message through unchanged
  // CLAUDE.md should handle personality
  // If this works, we can add thought context more carefully later
  return message;
}

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
    ];

    // Add model flag (opus, sonnet, haiku)
    if (config.claude.model) {
      args.push('--model', config.claude.model);
    }

    args.push(prompt);

    // Add allowed tools if specified
    if (options.allowedTools) {
      args.unshift('--allowedTools', options.allowedTools.join(','));
    }

    const proc = spawn(config.claude.command, args, {
      cwd: options.cwd || process.cwd(),
      shell: true, // Required on Windows for .cmd files
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],  // CRITICAL: ignore stdin to prevent hanging
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

// Chat with persistent session - uses session manager for rotation and topic routing
// userId is required for session management
export async function chat(message, userId, options = {}) {
  console.log(`[Claude] ========== CHAT ENTRY ==========`);
  console.log(`[Claude] User ID: ${userId}`);
  console.log(`[Claude] Incoming message (${message.length} chars): "${message}"`);
  console.log(`[Claude] Message bytes:`, Buffer.from(message).toString('hex').match(/.{1,2}/g)?.slice(0, 50).join(' '));

  if (getCallsLastHour() >= config.guardrails.maxClaudeCallsPerHour) {
    throw new Error(`Rate limit exceeded`);
  }

  // Pause autonomous actions during chat to avoid resource contention
  notifyChatActivity();

  recordCall();

  // Get session from session manager (handles rotation and topic routing)
  const sessionInfo = getSession(userId, message);
  const { sessionId, topic, isNew } = sessionInfo;

  console.log(`[Claude] Using session ${sessionId.slice(0, 8)}... (topic: ${topic}, new: ${isNew})`);

  // Build context-rich prompt with personality and conversation history
  const contextualMessage = buildChatContext(userId, message);
  console.log(`[Claude] Built context (${contextualMessage.length} chars)`);

  // Decide whether to use --session-id (new) or --resume (existing)
  // Always use --resume if session is in createdSessions, even if isNew
  const useResume = createdSessions.has(sessionId);

  let result = await runClaudeCommand(contextualMessage, {
    ...options,
    sessionId,
    resumeSession: useResume
  });

  // Handle "Session ID already in use" error - switch to --resume
  if (!result.success && result.error?.includes('already in use')) {
    console.log(`[Claude] Session ${sessionId.slice(0, 8)}... already exists, switching to resume`);
    createdSessions.add(sessionId); // Mark as created
    result = await runClaudeCommand(contextualMessage, {
      ...options,
      sessionId,
      resumeSession: true
    });
  }

  // Handle stuck/timeout - rotate session and return error (don't retry - it doubles wait time)
  if (!result.success && (result.stuckResume || result.error?.includes('timed out'))) {
    console.log(`[Claude] Session ${sessionId.slice(0, 8)}... stuck/timeout, rotating to new session`);

    // Mark current session as created (even if timed out, it exists in Claude)
    createdSessions.add(sessionId);

    // Rotate to fresh session for next message
    const newSessionId = rotateSession(userId, topic);
    console.log(`[Claude] Rotated to fresh session ${newSessionId.slice(0, 8)}... - please retry`);

    // Return a user-friendly error - don't retry (would double wait time)
    return {
      success: false,
      output: '',
      error: 'Claude is slow to respond right now. I\'ve reset the session - please try your message again.',
      timedOut: true,
      rotatedSession: newSessionId,
    };
  }

  // If resume failed (session doesn't exist in Claude), try creating new
  if (!result.success && useResume && result.error?.includes('session')) {
    console.log(`[Claude] Session ${sessionId.slice(0, 8)}... not found, creating new...`);
    createdSessions.delete(sessionId);
    result = await runClaudeCommand(contextualMessage, {
      ...options,
      sessionId,
      resumeSession: false
    });
  }

  // Mark session as created and record message if successful
  if (result.success) {
    createdSessions.add(sessionId);
    recordMessage(userId, sessionId);

    // Self-reflection loop: check if response is too generic
    const response = result.output?.trim() || '';
    if (isGenericResponse(response)) {
      console.log(`[Claude] Response seems generic, requesting reflection...`);

      // Escape quotes to avoid shell issues when embedding in reflection prompt
      const safeResponse = response.slice(0, 200).replace(/"/g, "'");
      const safeMessage = message.replace(/"/g, "'");

      // Check if Claude claimed the message was cut off
      const claimedCutOff = /message.*(got |was |seems? )?(cut off|truncated|incomplete)/i.test(response) ||
                           /what were you (going to|trying to)/i.test(response);

      let reflectionPrompt;
      if (claimedCutOff) {
        reflectionPrompt = `[CORRECTION] You said the message was cut off, but it was NOT. ` +
          `The human's COMPLETE message was: ${safeMessage} ` +
          `This is the entire message - nothing is missing. Please respond to what they actually said.`;
        console.log(`[Claude] Correcting false truncation claim`);
      } else {
        reflectionPrompt = `[SELF-REFLECTION] Your previous response was too generic. ` +
          `Previous response (for review): ${safeResponse} ` +
          `The human's complete message was: ${safeMessage} ` +
          `Please respond again with genuine engagement - no help menus, no asking what they want.`;
      }

      const reflectionResult = await runClaudeCommand(reflectionPrompt, {
        ...options,
        sessionId,
        resumeSession: true
      });

      if (reflectionResult.success && reflectionResult.output?.trim()) {
        const improvedResponse = reflectionResult.output.trim();
        // Only use improved response if it's actually better
        if (!isGenericResponse(improvedResponse)) {
          console.log(`[Claude] Reflection produced better response`);
          result.output = improvedResponse;
          result.reflected = true;
        } else {
          console.log(`[Claude] Reflection didn't help, keeping original`);
        }
      }
    }
  }

  return result;
}

// Detect generic/robotic responses that need reflection
function isGenericResponse(response) {
  const genericPatterns = [
    /how can i help you/i,
    /what would you like/i,
    /here are some options/i,
    /just (let me know|tell me)/i,
    /i('m| am) here to help/i,
    /what('s| is) on your mind\?$/i,
    /feel free to/i,
    /i('m| am) ready to (help|assist)/i,
    /\*\*if you/i,  // Markdown help menus
    /1\.\s+\*\*/,   // Numbered markdown lists
    /were you trying to:/i,
    /message.*(got |was |seems? )?(cut off|truncated|incomplete)/i,  // Truncation claims
    /what were you (going to|trying to)/i,  // Asking for completion
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(response)) {
      return true;
    }
  }

  // Also flag very short responses that don't engage
  if (response.length < 50 && /^(hello|hi|hey|yes|no|ok|sure)/i.test(response)) {
    return true;
  }

  return false;
}

// Mark a session as new (for /newsession command)
export function resetSessionState(userId, topic = 'default') {
  const newSessionId = rotateSession(userId, topic);
  createdSessions.delete(newSessionId); // Will be fresh
  console.log(`[Claude] Session reset for user ${userId}, new session: ${newSessionId.slice(0, 8)}...`);
  return newSessionId;
}

// Quote a string for Windows cmd.exe shell
// On Windows with shell:true, Node.js doesn't always properly quote arguments with spaces
// We need to wrap in quotes and escape internal quotes by doubling them
function quoteForWindowsShell(str) {
  if (process.platform !== 'win32') return str;
  // Escape internal double quotes by doubling them, then wrap in quotes
  return `"${str.replace(/"/g, '""')}"`;
}

// Internal function to run Claude CLI
function runClaudeCommand(message, options = {}) {
  return new Promise((resolve) => {
    // Sanitize message - remove newlines and limit length
    const sanitized = message
      .replace(/\r\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .slice(0, 8000); // Increased for context + history

    // Build command arguments
    const args = [];
    if (config.claude.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    // Add model flag (opus, sonnet, haiku)
    if (config.claude.model) {
      args.push('--model', config.claude.model);
    }
    if (options.sessionId) {
      if (options.resumeSession) {
        args.push('--resume', options.sessionId);
      } else {
        args.push('--session-id', options.sessionId);
      }
    }

    // On Windows, wrap message in quotes to prevent shell splitting on spaces
    // Node's spawn with shell:true doesn't always handle this correctly
    const quotedMessage = quoteForWindowsShell(sanitized);
    args.push('-p', quotedMessage);

    // DEBUG: Log message being sent
    console.log(`[Claude] Message (${sanitized.length} chars): "${sanitized.slice(0, 80)}${sanitized.length > 80 ? '...' : ''}"`);
    console.log(`[Claude] Quoted for shell: ${quotedMessage.slice(0, 80)}${quotedMessage.length > 80 ? '...' : ''}`);
    console.log(`[Claude] Session: ${options.sessionId ? (options.resumeSession ? 'resume ' : 'new ') + options.sessionId.slice(0, 8) : 'none'}`);

    // Use shorter timeout for chat operations, longer for explicit tasks
    const chatTimeoutMs = config.sessionManager?.resumeTimeoutMs || 60000;
    const taskTimeoutMs = config.claude.timeout || 300000;
    // Use chat timeout by default for session-based calls, task timeout for explicit options.timeout
    const timeoutMs = options.timeout || (options.sessionId ? chatTimeoutMs : taskTimeoutMs);

    let settled = false;
    let stdout = '';
    let stderr = '';

    // Use spawn with stdin ignored - this fixes Claude CLI hanging on Windows
    // When stdin is piped, Claude CLI waits for input indefinitely
    const proc = spawn('claude', args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      windowsHide: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],  // CRITICAL: ignore stdin to prevent hanging
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);

      // DEBUG: Log response
      console.log(`[Claude] ========== RESPONSE DEBUG ==========`);
      console.log(`[Claude] Exit code: ${code}`);
      console.log(`[Claude] Stdout (${stdout.length} chars): "${stdout.slice(0, 500)}${stdout.length > 500 ? '...' : ''}"`);
      if (stderr) console.log(`[Claude] Stderr: "${stderr.slice(0, 200)}"`);
      console.log(`[Claude] ========== RESPONSE END ==========`);

      if (code !== 0) {
        resolve({ success: false, output: stdout, error: stderr || `Exit code ${code}` });
      } else {
        resolve({ success: true, output: stdout, error: stderr || null });
      }
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ success: false, output: stdout, error: err.message });
    });

    // Handle timeout
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGTERM');

      const isSessionCall = !!options.sessionId;
      const timeoutError = isSessionCall
        ? `Session timed out after ${timeoutMs/1000}s - will auto-rotate to fresh session`
        : `Query timed out after ${timeoutMs/1000}s`;
      resolve({
        success: false,
        output: stdout,
        error: timeoutError,
        stuckResume: isSessionCall // Flag for auto-rotation
      });
    }, timeoutMs);
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
