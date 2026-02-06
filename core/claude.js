// Claude Code headless wrapper
// Executes tasks using Claude Code CLI with full tool access
import { spawn, exec, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { learnings, conversations } from './memory.js';
import { checkGuardrails, formatGuardrailsForPrompt } from './guardrails.js';
import { getSession, recordMessage, rotateSession } from './session-manager.js';
import { notifyChatActivity } from './chat-state.js';
import { getLatestThought } from './inner-life.js';

/**
 * Resolve the Claude CLI command for spawning.
 *
 * On Windows, claude is installed as claude.cmd (a batch script wrapper).
 * Spawning .cmd files requires shell: true, but that causes cmd.exe to
 * interpret prompt text as shell commands (breaking on quotes, pipes, etc.).
 *
 * Instead, we find the actual JS entry point that claude.cmd wraps and
 * spawn it directly with process.execPath — no shell needed.
 *
 * Returns { cmd, args, shell } where args should be prepended to spawn args.
 */
let _cachedClaudeResolve = null;

export function resolveClaudeCommand() {
  if (_cachedClaudeResolve) return _cachedClaudeResolve;

  if (process.platform !== 'win32') {
    _cachedClaudeResolve = { cmd: 'claude', prependArgs: [], shell: false };
    return _cachedClaudeResolve;
  }

  // On Windows, find the JS entry point to bypass the .cmd wrapper
  try {
    const wherePath = execSync('where claude.cmd', { encoding: 'utf-8', timeout: 5000, windowsHide: true })
      .trim().split('\n')[0].trim();

    if (wherePath) {
      // claude.cmd lives in the npm bin dir; the JS entry is at:
      // <npm-bin>/node_modules/@anthropic-ai/claude-code/cli.js
      const binDir = dirname(wherePath);
      const cliPath = join(binDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');

      if (existsSync(cliPath)) {
        console.log(`[Claude] Resolved CLI entry point: ${cliPath}`);
        _cachedClaudeResolve = { cmd: process.execPath, prependArgs: [cliPath], shell: false };
        return _cachedClaudeResolve;
      }
    }
  } catch (e) {
    console.warn(`[Claude] Could not resolve claude.cmd path: ${e.message}`);
  }

  // Fallback: use claude.cmd with shell (may fail on complex prompts)
  console.warn('[Claude] Falling back to claude.cmd with shell — complex prompts may fail');
  _cachedClaudeResolve = { cmd: 'claude.cmd', prependArgs: [], shell: true };
  return _cachedClaudeResolve;
}

// Process activity monitoring for smarter timeout detection
// Instead of just checking stdout, we monitor actual process CPU usage
function getProcessCpuTime(pid) {
  if (process.platform !== 'win32') {
    // On Unix, we could use /proc/[pid]/stat, but for now just return null
    return null;
  }

  try {
    // Use PowerShell to get process CPU time on Windows
    // TotalProcessorTime gives total CPU time as a TimeSpan
    const result = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).TotalProcessorTime.TotalMilliseconds"`,
      { encoding: 'utf-8', timeout: 5000, windowsHide: true }
    );

    const cpuMs = parseFloat(result.trim());
    if (isNaN(cpuMs)) return null;

    return cpuMs;
  } catch (e) {
    // Process might have exited or PowerShell failed
    return null;
  }
}

// Check if process is making progress by comparing CPU time
function isProcessActive(pid, lastCpuTime) {
  const currentCpuTime = getProcessCpuTime(pid);
  if (currentCpuTime === null || lastCpuTime === null) {
    // Can't determine - assume active to avoid false positives
    return { active: true, cpuTime: currentCpuTime };
  }

  // If CPU time increased, process is doing work
  const cpuDelta = currentCpuTime - lastCpuTime;
  const active = cpuDelta > 10; // More than 10ms of CPU work

  return { active, cpuTime: currentCpuTime, cpuDelta };
}

// Personality paths
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
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
// Uses 'task' timeout type for longer-running background work
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

  // Use runClaudeCommand with task timeout type for consistency
  // Enable tools if the skill requests specific tools (allowedTools option)
  const result = await runClaudeCommand(prompt, {
    ...options,
    enableTools: options.allowedTools?.length > 0 || options.enableTools,
    timeoutType: options.background ? 'background' : 'task',
  });

  return {
    success: result.success,
    output: result.output,
    error: result.error,
    exitCode: result.success ? 0 : -1,
    timedOut: result.stuckResume || false,
  };
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

  // Available tools (when skill specifies them)
  if (options.allowedTools && options.allowedTools.length > 0) {
    parts.push(`## Available Tools\nYou have access to these tools for this task: ${options.allowedTools.join(', ')}\nUse them as needed to complete the task.`);
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

  // Use query timeouts (shorter, one-shot operations)
  return runClaudeCommand(question, {
    ...options,
    timeoutType: options.timeoutType || 'query',
  });
}

// Track which sessions have been created (first message sent)
// This is exported so index.js can mark loaded sessions as existing
export const createdSessions = new Set();

// Chat with persistent session - uses session manager for rotation and topic routing
// userId is required for session management
// options.onProgress: callback for status updates (useful for sending "typing" indicators)
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
  // IMPORTANT: Only use --resume if messageCount > 0 (isNew=false), meaning we've
  // successfully sent messages on this session. We can't rely on createdSessions alone
  // because sessions loaded from file at startup may no longer exist in Claude CLI.
  const useResume = !isNew && createdSessions.has(sessionId);

  let result = await runClaudeCommand(contextualMessage, {
    ...options,
    sessionId,
    resumeSession: useResume,
    timeoutType: options.timeoutType || 'chat',  // Chat messages get longer timeouts
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
    // Include context about what happened
    const timeSpent = result.elapsed ? ` after ${Math.round(result.elapsed / 1000)}s` : '';
    const partialOutput = result.output?.trim();
    const hasPartialWork = partialOutput && partialOutput.length > 50;

    return {
      success: false,
      output: partialOutput || '',
      error: hasPartialWork
        ? `Response timed out${timeSpent}, but here's what I had so far. Fresh session ready - send your message again to continue.`
        : `I got a bit stuck there${timeSpent} (might be hitting rate limits or the API is slow). Fresh session ready - just send your message again!`,
      timedOut: true,
      rotatedSession: newSessionId,
    };
  }

  // If resume failed (session doesn't exist in Claude), try creating new
  // This catches: explicit session errors, exit code 1 with no output, or any resume failure
  const resumeFailed = !result.success && useResume && (
    result.error?.includes('session') ||
    result.error?.includes('Exit code 1') ||
    (result.error && !result.output?.trim())  // Any error with no useful output
  );
  if (resumeFailed) {
    console.log(`[Claude] Session ${sessionId.slice(0, 8)}... resume failed (${result.error}), creating fresh session...`);
    createdSessions.delete(sessionId);
    // Rotate to a new session since the old one is broken
    const newSessionId = rotateSession(userId, topic);
    result = await runClaudeCommand(contextualMessage, {
      ...options,
      sessionId: newSessionId,
      resumeSession: false
    });
    // If this succeeds, the sessionId variable is now stale, but that's OK
    // because recordMessage below will use the sessionId from the successful call
    if (result.success) {
      createdSessions.add(newSessionId);
      recordMessage(userId, newSessionId);
      return result; // Return early to avoid double-recording
    }
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

// No shell quoting needed - we pass arguments as an array with shell: false
// This eliminates command injection risks entirely

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

    // For task execution with tools, we need to skip permissions
    // Either globally via config, or per-call via options.enableTools
    if (config.claude.skipPermissions || options.enableTools) {
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

    // Use streaming output - gives us real-time progress events
    // This keeps the connection alive during long-running tasks
    // Note: stream-json requires --verbose when used with --print
    args.push('--verbose', '--output-format', 'stream-json');

    // Pass message directly as array argument - no shell quoting needed
    args.push('-p', sanitized);

    // Log message being sent (truncated for privacy)
    console.log(`[Claude] Message (${sanitized.length} chars): "${sanitized.slice(0, 80)}${sanitized.length > 80 ? '...' : ''}"`);
    console.log(`[Claude] Session: ${options.sessionId ? (options.resumeSession ? 'resume ' : 'new ') + options.sessionId.slice(0, 8) : 'none'}`);

    // Timeout configuration based on operation type
    // - idleTimeoutMs: Kill if no output for this long (activity-based)
    // - maxTimeoutMs: Absolute maximum time regardless of activity
    const timeouts = config.timeouts || {};
    const timeoutType = options.timeoutType || 'query';

    let idleTimeoutMs, maxTimeoutMs;
    switch (timeoutType) {
      case 'chat':
        idleTimeoutMs = timeouts.chatIdleMs || 90000;
        maxTimeoutMs = timeouts.chatMaxMs || 180000;
        break;
      case 'task':
        idleTimeoutMs = timeouts.taskIdleMs || 120000;
        maxTimeoutMs = timeouts.taskMaxMs || 300000;
        break;
      case 'background':
        idleTimeoutMs = timeouts.backgroundIdleMs || 180000;
        maxTimeoutMs = timeouts.backgroundMaxMs || 600000;
        break;
      case 'query':
      default:
        idleTimeoutMs = timeouts.queryIdleMs || 60000;
        maxTimeoutMs = timeouts.queryMaxMs || 120000;
        break;
    }

    // Allow explicit timeout override (takes precedence)
    const effectiveIdleTimeout = options.timeout || idleTimeoutMs;
    const effectiveMaxTimeout = options.maxTimeout || maxTimeoutMs;

    console.log(`[Claude] Timeout type: ${timeoutType} (idle: ${effectiveIdleTimeout/1000}s, max: ${effectiveMaxTimeout/1000}s)`);

    let settled = false;
    let rawOutput = '';       // Raw streaming JSON lines
    let textContent = '';     // Extracted text content for response
    let stderr = '';
    let lastActivityTime = Date.now();
    const startTime = Date.now();
    let streamBuffer = '';    // Buffer for incomplete JSON lines
    let lastProgressReport = Date.now(); // Track when we last reported progress
    let currentStatus = 'starting'; // Track what Claude is doing
    let toolsInProgress = [];  // Track tools being used

    // CPU-based activity tracking (for when there's no stdout but process is working)
    let lastCpuTime = null;
    let consecutiveIdleChecks = 0;
    const maxIdleChecks = 3;  // Require 3 consecutive idle checks before timeout

    // Progress callback for status updates
    const onProgress = options.onProgress || (() => {});

    // Resolve claude CLI — on Windows, bypasses .cmd wrapper to avoid shell arg interpretation.
    // stdin is ignored to prevent Claude CLI hanging on Windows.
    const resolved = resolveClaudeCommand();
    const proc = spawn(resolved.cmd, [...resolved.prependArgs, ...args], {
      cwd: options.cwd || process.cwd(),
      shell: resolved.shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Initialize CPU tracking after a brief delay (process needs to start)
    setTimeout(() => {
      if (!settled && proc.pid) {
        lastCpuTime = getProcessCpuTime(proc.pid);
        if (lastCpuTime !== null) {
          console.log(`[Claude] CPU tracking initialized for PID ${proc.pid}`);
        }
      }
    }, 1000);

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      rawOutput += chunk;
      lastActivityTime = Date.now();  // Reset idle timer on ANY output

      // Parse streaming JSON - each line is a separate event
      streamBuffer += chunk;
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          // Extract text from assistant messages
          if (event.type === 'assistant' && event.message?.content) {
            currentStatus = 'responding';
            for (const block of event.message.content) {
              if (block.type === 'text') {
                textContent += block.text;
              }
              // Track tool use
              if (block.type === 'tool_use') {
                const toolName = block.name || 'unknown tool';
                if (!toolsInProgress.includes(toolName)) {
                  toolsInProgress.push(toolName);
                  currentStatus = `using ${toolName}`;
                  console.log(`[Claude] Tool started: ${toolName}`);
                  onProgress({ status: currentStatus, tool: toolName, elapsed: Date.now() - startTime });
                }
              }
            }
          }
          // Also handle content_block_delta for streaming text
          if (event.type === 'content_block_delta' && event.delta?.text) {
            textContent += event.delta.text;
            currentStatus = 'writing';
          }
          // Handle tool results
          if (event.type === 'tool_result' || event.type === 'tool_output') {
            const toolName = toolsInProgress.pop() || 'tool';
            currentStatus = `finished ${toolName}`;
            console.log(`[Claude] Tool finished: ${toolName}`);
            onProgress({ status: currentStatus, elapsed: Date.now() - startTime });
          }
          // Log progress events so we can see what's happening
          if (event.type === 'system' && event.subtype) {
            currentStatus = event.subtype;
            console.log(`[Claude] Progress: ${event.subtype}`);
            onProgress({ status: event.subtype, elapsed: Date.now() - startTime });
          }
        } catch (e) {
          // Not valid JSON - might be partial or non-JSON output
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      lastActivityTime = Date.now();  // Reset idle timer on output
    });

    // Activity-based timeout: check periodically for idle or max timeout
    // This allows long-running tasks to continue as long as there's output OR CPU activity
    const checkIntervalMs = 5000; // Check every 5 seconds
    const progressReportIntervalMs = 15000; // Report progress every 15 seconds
    const timeoutCheck = setInterval(() => {
      if (settled) {
        clearInterval(timeoutCheck);
        return;
      }

      const now = Date.now();
      const idleTime = now - lastActivityTime;
      const totalTime = now - startTime;

      // Emit periodic progress updates so the user knows we're still working
      if (now - lastProgressReport >= progressReportIntervalMs) {
        lastProgressReport = now;
        const statusMessage = currentStatus !== 'starting'
          ? `Still working (${currentStatus})...`
          : `Processing (${Math.round(totalTime/1000)}s)...`;
        console.log(`[Claude] Progress update: ${statusMessage}`);
        onProgress({
          status: currentStatus,
          elapsed: totalTime,
          idleTime,
          message: statusMessage,
          toolsUsed: toolsInProgress.length
        });
      }

      // Check absolute maximum timeout first
      if (totalTime >= effectiveMaxTimeout) {
        settled = true;
        clearInterval(timeoutCheck);
        proc.kill('SIGTERM');
        console.log(`[Claude] Max timeout reached (${effectiveMaxTimeout/1000}s total)`);
        onProgress({ status: 'timeout', elapsed: totalTime, message: 'Maximum time exceeded' });
        resolve({
          success: false,
          output: textContent || rawOutput,
          error: `Task exceeded maximum time (${effectiveMaxTimeout/1000}s)`,
          stuckResume: !!options.sessionId,
          elapsed: totalTime
        });
        return;
      }

      // Check idle timeout (no output for too long)
      // BUT first check if the process is still doing CPU work
      if (idleTime >= effectiveIdleTimeout) {
        // Check CPU activity before declaring timeout
        const cpuStatus = isProcessActive(proc.pid, lastCpuTime);
        lastCpuTime = cpuStatus.cpuTime;

        if (cpuStatus.active) {
          // Process is still working (CPU activity detected)
          consecutiveIdleChecks = 0;
          console.log(`[Claude] No stdout for ${(idleTime/1000).toFixed(0)}s but process active (CPU +${cpuStatus.cpuDelta?.toFixed(0) || '?'}ms)`);
          onProgress({
            status: 'working (no output)',
            elapsed: totalTime,
            cpuDelta: cpuStatus.cpuDelta,
            message: 'Working in background...'
          });
          return; // Don't timeout - process is working
        }

        // No stdout AND no CPU activity
        consecutiveIdleChecks++;
        console.log(`[Claude] Idle check ${consecutiveIdleChecks}/${maxIdleChecks}: no stdout, no CPU activity`);

        // Require multiple consecutive idle checks to avoid false positives
        if (consecutiveIdleChecks < maxIdleChecks) {
          onProgress({
            status: 'waiting',
            elapsed: totalTime,
            message: `Waiting for response (check ${consecutiveIdleChecks}/${maxIdleChecks})...`
          });
          return; // Give it more time
        }

        // Truly idle - timeout
        settled = true;
        clearInterval(timeoutCheck);
        proc.kill('SIGTERM');
        const isSessionCall = !!options.sessionId;
        const timeoutError = isSessionCall
          ? `No activity for ${effectiveIdleTimeout/1000}s (no output, no CPU work) - possibly stuck`
          : `Query idle for ${effectiveIdleTimeout/1000}s`;
        console.log(`[Claude] Idle timeout: ${timeoutError} (was active for ${(totalTime - idleTime)/1000}s)`);
        onProgress({ status: 'timeout', elapsed: totalTime, message: 'Connection timed out' });
        resolve({
          success: false,
          output: textContent || rawOutput,
          error: timeoutError,
          stuckResume: isSessionCall, // Flag for auto-rotation
          elapsed: totalTime
        });
      } else {
        // Got recent output, reset idle tracking
        consecutiveIdleChecks = 0;
      }
    }, checkIntervalMs);

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearInterval(timeoutCheck);

      // Process any remaining buffered content
      if (streamBuffer.trim()) {
        try {
          const event = JSON.parse(streamBuffer);
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                textContent += block.text;
              }
            }
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // DEBUG: Log response
      const totalTime = Date.now() - startTime;
      console.log(`[Claude] ========== RESPONSE DEBUG ==========`);
      console.log(`[Claude] Exit code: ${code}, completed in ${(totalTime/1000).toFixed(1)}s`);
      console.log(`[Claude] Text content (${textContent.length} chars): "${textContent.slice(0, 500)}${textContent.length > 500 ? '...' : ''}"`);
      if (stderr) console.log(`[Claude] Stderr: "${stderr.slice(0, 200)}"`);
      console.log(`[Claude] ========== RESPONSE END ==========`);

      // Use extracted text content, fall back to raw output if parsing failed
      const output = textContent || rawOutput;

      if (code !== 0) {
        resolve({ success: false, output, error: stderr || `Exit code ${code}` });
      } else {
        resolve({ success: true, output, error: stderr || null });
      }
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearInterval(timeoutCheck);
      resolve({ success: false, output: textContent || rawOutput, error: err.message });
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
