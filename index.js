#!/usr/bin/env node
// Forgekeeper v3.1 - Minimal AI Agent with Claude Code as the brain
import { config } from './config.js';
import loop from './core/loop.js';
import { conversations, tasks, goals, approvals, learnings } from './core/memory.js';
import { query, chat, resetSessionState, createdSessions } from './core/claude.js';
import { routeMessage, analyzeTopics, TOPIC_TYPES } from './core/topic-router.js';
import { createAgentPool } from './core/agent-pool.js';
import { wrapExternalContent, detectInjectionPatterns } from './core/security/external-content.js';
import { initHooks, fireEvent } from './core/hooks.js';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// Content security configuration
const CONTENT_SECURITY_ENABLED = process.env.FK_CONTENT_SECURITY_ENABLED !== '0';
const HOOKS_ENABLED = process.env.FK_HOOKS_ENABLED !== '0';

// Agent pool for parallel task execution
let agentPool = null;

// Store session IDs per user (persisted to file)
const userSessions = new Map();
const SESSIONS_FILE = './data/user_sessions.json';

// Load saved sessions on startup
function loadUserSessions() {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
      for (const [userId, sessionId] of Object.entries(data)) {
        userSessions.set(userId, sessionId);
        // Mark as existing so we use --resume instead of --session-id
        createdSessions.add(sessionId);
      }
      console.log(`[Sessions] Loaded ${userSessions.size} user sessions`);
    }
  } catch (e) {
    console.error('[Sessions] Failed to load:', e.message);
  }
}

// Save sessions to file
function saveUserSessions() {
  try {
    const data = Object.fromEntries(userSessions);
    writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Sessions] Failed to save:', e.message);
  }
}

// Load sessions immediately
loadUserSessions();

// Helper to get or create a session for a user
function getOrCreateSession(userId) {
  let sessionId = userSessions.get(String(userId));
  if (!sessionId) {
    sessionId = randomUUID();
    userSessions.set(String(userId), sessionId);
    saveUserSessions();
    console.log(`[Chat] Created new session for user ${userId}: ${sessionId}`);
  }
  return sessionId;
}

import { loadSkills } from './skills/registry.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { checkAndUpdatePM2, isRunningUnderPM2 } from './scripts/pm2-utils.js';
import { processChat as planChat, isLikelyComplex } from './core/chat-planner.js';
import innerLife from './core/inner-life.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Track child processes for cleanup
let telegramProcess = null;
let telegramRestartCount = 0;
let telegramLastRestartTime = 0;
let isShuttingDown = false;
const TELEGRAM_MAX_RESTARTS = 5;
const TELEGRAM_RESTART_WINDOW_MS = 300000; // 5 minutes

console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Forgekeeper v3 - Minimal Agent Core             ║
║                                                           ║
║  Brain: Claude Code (headless)                            ║
║  Interface: Telegram/Discord via MCP                      ║
║  Storage: JSONL (local)                                   ║
╚═══════════════════════════════════════════════════════════╝
`);

// Initialize
async function init() {
  // Check and update PM2 if running under PM2 and there's a version mismatch
  if (isRunningUnderPM2()) {
    console.log('[Init] Running under PM2, checking version...');
    const pm2Result = await checkAndUpdatePM2();
    if (pm2Result.updated) {
      console.log('[Init] PM2 was updated - process will be managed by new daemon');
    }
  }

  console.log('[Init] Loading configuration...');
  console.log(`  - Loop interval: ${config.loop.intervalMs}ms`);
  console.log(`  - Max concurrent: ${config.loop.maxConcurrentTasks}`);
  console.log(`  - Data dir: ${config.paths.data}`);

  // Load skills
  console.log('[Init] Loading skills...');
  const skills = await loadSkills();
  console.log(`  - Loaded ${skills.length} skills`);

  // Initialize hooks system
  if (HOOKS_ENABLED) {
    console.log('[Init] Initializing hooks system...');
    await initHooks();
  }

  // Initialize agent pool if enabled
  if (config.agentPool?.enabled) {
    console.log('[Init] Starting agent pool...');
    agentPool = createAgentPool({ poolSize: config.agentPool.size || 3 });
    await agentPool.initialize();
    setupAgentPoolListeners(agentPool);
  }

  // Set up event listeners for logging
  setupEventListeners();

  // Start the loop
  console.log('[Init] Starting main loop...');
  loop.start();

  // Start inner life (autonomous consciousness)
  if (config.autonomous?.enabled) {
    console.log('[Init] Starting inner life...');
    innerLife.start();
  }

  // Show initial status
  const status = loop.status();
  console.log('[Init] Status:');
  console.log(`  - Pending tasks: ${status.pendingTasks}`);
  console.log(`  - Active goals: ${status.activeGoals}`);
  console.log(`  - Pending approvals: ${status.pendingApprovals}`);

  // Start dashboard if enabled
  if (config.dashboard.enabled) {
    const { startDashboard } = await import('./interface/dashboard.js');
    startDashboard();
  }

  // Start Telegram bot if token is configured
  if (config.telegram.botToken) {
    console.log('[Init] Starting Telegram bot...');
    await startTelegramBot();
  }

  console.log('\n[Ready] Forgekeeper v3 is running.');
  if (config.dashboard.enabled) {
    console.log(`  - Dashboard: http://localhost:${config.dashboard.port}`);
  }
  if (config.telegram.botToken) {
    console.log('  - Telegram: Connected');
  } else {
    console.log('  - Telegram: Not configured (set TELEGRAM_BOT_TOKEN)');
  }
  if (config.autonomous?.enabled) {
    console.log('  - Inner Life: Active');
  }
  console.log('  - Stop: Ctrl+C\n');
}

// Start Telegram bot as integrated process with auto-restart
async function startTelegramBot() {
  if (isShuttingDown) return;

  const telegramScript = join(__dirname, 'mcp-servers', 'telegram.js');

  // Check if we're in a restart loop
  const now = Date.now();
  if (now - telegramLastRestartTime < TELEGRAM_RESTART_WINDOW_MS) {
    telegramRestartCount++;
    if (telegramRestartCount > TELEGRAM_MAX_RESTARTS) {
      console.error(`[Telegram] Too many restarts (${TELEGRAM_MAX_RESTARTS}) in ${TELEGRAM_RESTART_WINDOW_MS / 1000}s, stopping auto-restart`);
      console.error('[Telegram] Manual intervention required. Check logs and restart with: pm2 restart forgekeeper');
      return;
    }
  } else {
    // Reset counter if outside the window
    telegramRestartCount = 1;
  }
  telegramLastRestartTime = now;

  console.log(`[Telegram] Starting bot process (attempt ${telegramRestartCount})...`);

  telegramProcess = spawn(process.execPath, [telegramScript], {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout for MCP, stderr to console
    env: process.env,
    shell: false,
  });

  // Handle MCP protocol communication
  let buffer = '';
  telegramProcess.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = await handleTelegramRequest(request);
        if (telegramProcess && telegramProcess.stdin.writable) {
          telegramProcess.stdin.write(JSON.stringify({ id: request.id, result: response }) + '\n');
        }
      } catch (e) {
        // Not JSON or parse error - might be log output
      }
    }
  });

  telegramProcess.on('close', (code) => {
    const wasRunning = telegramProcess !== null;
    telegramProcess = null;

    if (isShuttingDown) {
      console.log('[Telegram] Bot stopped (shutdown)');
      return;
    }

    if (code !== 0 && code !== null) {
      console.error(`[Telegram] Bot exited with code ${code}`);

      // Auto-restart on unexpected exit
      if (wasRunning && config.telegram.botToken) {
        const delay = Math.min(5000 * telegramRestartCount, 30000); // 5s, 10s, 15s... max 30s
        console.log(`[Telegram] Scheduling restart in ${delay}ms...`);
        setTimeout(() => startTelegramBot(), delay);
      }
    } else {
      console.log('[Telegram] Bot exited normally');
    }
  });

  telegramProcess.on('error', (err) => {
    console.error(`[Telegram] Failed to start: ${err.message}`);
    telegramProcess = null;

    // Try to restart on spawn error
    if (!isShuttingDown && config.telegram.botToken) {
      const delay = Math.min(5000 * telegramRestartCount, 30000);
      console.log(`[Telegram] Scheduling restart in ${delay}ms...`);
      setTimeout(() => startTelegramBot(), delay);
    }
  });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Register messenger with inner life for proactive communication
  innerLife.registerMessenger(async (userId, text) => {
    if (telegramProcess && telegramProcess.stdin.writable) {
      const request = {
        method: 'send_message',
        params: { userId, text }
      };
      telegramProcess.stdin.write(JSON.stringify(request) + '\n');
      return true;
    }
    throw new Error('Telegram process not available');
  });
}

// Handle requests from Telegram bot
async function handleTelegramRequest(request) {
  const { method, params } = request;

  switch (method) {
    case 'create_task': {
      const task = tasks.create({
        description: params.description,
        origin: 'telegram',
        tags: params.tags || [],
        metadata: { userId: params.userId },
      });
      return { success: true, taskId: task.id };
    }

    case 'create_goal': {
      const goal = goals.create({
        description: params.description,
        origin: 'telegram',
        metadata: { userId: params.userId },
      });
      return { success: true, goalId: goal.id };
    }

    case 'get_status': {
      return loop.status();
    }

    case 'reset_session': {
      const { userId, topic } = params;
      // resetSessionState now handles everything via session manager
      const newSessionId = resetSessionState(userId, topic || 'default');
      // Keep legacy map in sync for backwards compat
      userSessions.set(String(userId), newSessionId);
      saveUserSessions();
      conversations.clear(userId);
      console.log(`[Chat] Reset session for user ${userId}: ${newSessionId.slice(0, 8)}...`);
      return { success: true, sessionId: newSessionId };
    }

    case 'resolve_approval': {
      const { id, decision, userId } = params;
      const result = approvals.resolve(id, decision, `telegram:${userId}`);
      if (result) {
        if (decision === 'approved' && result.taskId) {
          tasks.update(result.taskId, { approved: true });
        }
        return { success: true };
      }
      return { success: false, error: 'Approval not found' };
    }

    case 'chat': {
      const { message, userId, replyToMessage } = params;

      // DEBUG: Log incoming message details
      console.log(`[Chat] ========== INCOMING MESSAGE ==========`);
      console.log(`[Chat] User: ${userId}`);
      console.log(`[Chat] Message length: ${message?.length || 0}`);
      console.log(`[Chat] Message type: ${typeof message}`);
      console.log(`[Chat] Full message: "${message}"`);
      if (replyToMessage) {
        console.log(`[Chat] In reply to: "${replyToMessage.slice(0, 100)}..."`);
      }
      console.log(`[Chat] ========== END INCOMING ==========`);

      // Security: Wrap external content with safety markers
      let securedMessage = message;
      if (CONTENT_SECURITY_ENABLED) {
        const patterns = detectInjectionPatterns(message);
        if (patterns.length > 0) {
          console.log(`[Security] Detected ${patterns.length} injection pattern(s): ${patterns.join(', ')}`);
        }
        securedMessage = wrapExternalContent(message, {
          source: 'telegram',
          senderId: userId,
          logPatterns: true,
        });
        console.log(`[Security] Message wrapped with security markers`);
      }

      // Build the full message with reply context if present
      // Both the reply-to content AND the current message must be security-wrapped
      // to prevent prompt injection via replying to a malicious message
      const securedReplyTo = replyToMessage && CONTENT_SECURITY_ENABLED
        ? wrapExternalContent(replyToMessage.slice(0, 500), {
            source: 'telegram-reply',
            senderId: userId,
          })
        : replyToMessage?.slice(0, 500);
      const fullMessage = replyToMessage
        ? `[Rado is replying to your previous message: "${securedReplyTo}"]\n\nRado's reply: ${securedMessage}`
        : securedMessage;

      // Store in conversation history
      conversations.append(userId, { role: 'user', content: fullMessage });

      // Fire message:received event for hooks
      // Get last assistant message for context (to detect proactive replies)
      const recentHistory = conversations.get(userId, 5) || [];
      const lastAssistantMsg = recentHistory
        .filter(m => m.role === 'assistant')
        .pop()?.content;

      const hookMods = HOOKS_ENABLED
        ? await fireEvent('message:received', {
            message,
            fullMessage,
            userId,
            lastAssistantMessage: lastAssistantMsg,
            replyToMessage,
          })
        : {};

      if (hookMods.skipComplexityCheck) {
        console.log(`[Hooks] Skipping complexity check: ${hookMods.routingReason || 'hook decision'}`);
      }

      const lowerMsg = fullMessage.toLowerCase();

      // Check if it's a task request (imperative commands) - these get routed to task system
      if (lowerMsg.match(/^(create|make|build|add|fix|update|deploy|run|test|install|write|implement|refactor)\s/)) {
        const task = tasks.create({
          description: message,
          origin: 'telegram',
          metadata: { userId },
        });
        const reply = `✅ Task created: ${task.id}\n\n${message}\n\nI'll work on this. Use /status to check progress.`;
        conversations.append(userId, { role: 'assistant', content: reply });
        return { reply };
      }

      // Check if this is a complex prompt that should become a background task
      // This prevents timeouts for long-running requests
      // BUT skip if hooks said to (e.g., for proactive replies)
      if (!hookMods.skipComplexityCheck && isLikelyComplex(fullMessage)) {
        console.log('[Chat] Complex message detected, converting to task');
        const task = tasks.create({
          description: message,
          origin: 'telegram',
          metadata: { userId },
        });
        const reply = `📋 On it! (task ${task.id})`;
        conversations.append(userId, { role: 'assistant', content: reply });
        return { reply };
      }

      // For everything else, chat with Claude using session manager
      try {
        console.log('[Chat] Sending to Claude:', fullMessage.slice(0, 50));

        // Progress callback to notify user during long waits
        let lastProgressNotify = Date.now();
        const progressNotifyInterval = 30000; // Send update every 30s
        const onProgress = async (progress) => {
          const now = Date.now();
          // Only send progress updates periodically to avoid spam
          if (now - lastProgressNotify >= progressNotifyInterval) {
            lastProgressNotify = now;
            const elapsed = Math.round(progress.elapsed / 1000);
            let statusMsg = `⏳ ${progress.message || `Processing (${elapsed}s)...`}`;

            // Add more context based on what's happening
            if (progress.status === 'working (no output)') {
              statusMsg = `⏳ Working in background (${elapsed}s)...`;
            } else if (progress.tool) {
              statusMsg = `🔧 Using ${progress.tool} (${elapsed}s)...`;
            } else if (progress.status === 'writing') {
              statusMsg = `✍️ Composing response (${elapsed}s)...`;
            } else if (progress.status === 'waiting') {
              statusMsg = `⏳ ${progress.message}`;
            }

            console.log(`[Chat] Progress update for user ${userId}: ${statusMsg}`);
            // Send progress via MCP if telegram process is available
            if (telegramProcess && telegramProcess.stdin.writable) {
              try {
                telegramProcess.stdin.write(JSON.stringify({
                  method: 'send_message',
                  params: { userId, text: statusMsg }
                }) + '\n');
              } catch (e) {
                // Ignore - best effort progress updates
              }
            }
          }
        };

        // chat() now handles sessions internally via session manager (rotation, topic routing)
        const result = await chat(fullMessage, userId, { onProgress });
        console.log('[Chat] Claude response:', result.success ? 'success' : 'failed', result.error || '');

        if (!result.success) {
          console.error('[Chat] Claude error:', result.error);
          const errorMsg = result.error || 'Unknown error';
          conversations.append(userId, { role: 'assistant', content: `Error: ${errorMsg}` });
          return { error: errorMsg };
        }

        if (!result.output?.trim()) {
          return { error: 'Empty response from Claude' };
        }

        const reply = result.output.trim();
        conversations.append(userId, { role: 'assistant', content: reply });
        return { reply };

      } catch (error) {
        console.error('[Chat] Exception:', error.message);
        return { error: error.message || 'Unknown exception' };
      }
    }

    default:
      return { error: `Unknown method: ${method}` };
  }
}

// Set up event listeners
function setupEventListeners() {
  loop.on('task:started', ({ task }) => {
    console.log(`[Task] Started: ${task.id} - ${task.description}`);
  });

  loop.on('task:completed', ({ task, elapsed }) => {
    console.log(`[Task] Completed: ${task.id} in ${elapsed}ms`);
  });

  loop.on('task:failed', ({ task, result }) => {
    console.log(`[Task] Failed: ${task.id} - ${result?.error || 'Unknown error'}`);
  });

  loop.on('task:needs_approval', ({ task, reason }) => {
    console.log(`[Approval Required] Task ${task.id}: ${reason}`);
  });

  loop.on('goal:activated', ({ goal, tasks: createdTasks }) => {
    console.log(`[Goal] Activated: ${goal.id} with ${createdTasks.length} tasks`);
  });

  loop.on('trigger:stale_goal', ({ goal }) => {
    console.log(`[Trigger] Stale goal detected: ${goal.id} - ${goal.description}`);
  });

  loop.on('trigger:blocked_task', ({ task }) => {
    console.log(`[Trigger] Blocked task: ${task.id} - ${task.description}`);
  });

  loop.on('loop:error', ({ error }) => {
    console.error(`[Loop Error] ${error}`);
  });
}

// Set up agent pool event listeners
function setupAgentPoolListeners(pool) {
  pool.on('task:started', ({ agentId, taskId }) => {
    console.log(`[AgentPool] Agent ${agentId} started task ${taskId}`);
  });

  pool.on('task:completed', ({ agentId, taskId, elapsed }) => {
    console.log(`[AgentPool] Agent ${agentId} completed task ${taskId} in ${elapsed}ms`);
    // Update task in memory
    try {
      tasks.update(taskId, { status: 'completed' });
    } catch (e) {}
  });

  pool.on('task:failed', ({ agentId, taskId, error }) => {
    console.log(`[AgentPool] Agent ${agentId} failed task ${taskId}: ${error}`);
    try {
      tasks.addAttempt(taskId, { success: false, error });
    } catch (e) {}
  });

  pool.on('task:queued', ({ taskId, position }) => {
    console.log(`[AgentPool] Task ${taskId} queued at position ${position}`);
  });

  pool.on('worker:error', ({ agentId, error }) => {
    console.error(`[AgentPool] Worker ${agentId} error:`, error.message);
  });
}

// Handle shutdown
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Shutdown] Stopping Forgekeeper (${signal || 'unknown'})...`);

  // Stop agent pool
  if (agentPool) {
    console.log('[Shutdown] Stopping agent pool...');
    try {
      await agentPool.shutdown();
    } catch (e) {
      console.error('[Shutdown] Agent pool error:', e.message);
    }
    agentPool = null;
  }

  // Stop Telegram bot gracefully
  if (telegramProcess) {
    console.log('[Shutdown] Stopping Telegram bot...');
    try {
      // Send SIGTERM and wait up to 5 seconds
      telegramProcess.kill('SIGTERM');
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (telegramProcess) {
            console.log('[Shutdown] Force killing Telegram bot...');
            telegramProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (telegramProcess) {
          telegramProcess.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (e) {
      console.error('[Shutdown] Telegram bot error:', e.message);
    }
    telegramProcess = null;
  }

  loop.stop();

  // Signal PM2 we're ready for restart (if running under PM2)
  if (process.send) {
    process.send('ready');
  }

  console.log('[Shutdown] Complete');
  process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Warning] Unhandled rejection:', reason);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// CLI commands (for testing without Telegram)
const args = process.argv.slice(2);
const command = args[0];

if (command === 'task') {
  // Create a task: node index.js task "description"
  const description = args.slice(1).join(' ');
  if (!description) {
    console.log('Usage: node index.js task "task description"');
    process.exit(1);
  }
  const task = tasks.create({ description, origin: 'cli' });
  console.log(`Created task: ${task.id}`);
  process.exit(0);
}

if (command === 'goal') {
  // Create a goal: node index.js goal "description"
  const description = args.slice(1).join(' ');
  if (!description) {
    console.log('Usage: node index.js goal "goal description"');
    process.exit(1);
  }
  const goal = goals.create({ description, origin: 'cli' });
  console.log(`Created goal: ${goal.id}`);
  process.exit(0);
}

if (command === 'status') {
  const pending = tasks.pending();
  const active = goals.active();
  const pendingApprovals = approvals.pending();

  console.log('\n=== Forgekeeper Status ===\n');
  console.log(`Pending Tasks: ${pending.length}`);
  for (const t of pending.slice(0, 5)) {
    console.log(`  - ${t.id}: ${t.description}`);
  }

  console.log(`\nActive Goals: ${active.length}`);
  for (const g of active.slice(0, 5)) {
    console.log(`  - ${g.id}: ${g.description}`);
  }

  console.log(`\nPending Approvals: ${pendingApprovals.length}`);
  for (const a of pendingApprovals.slice(0, 5)) {
    console.log(`  - ${a.id}: ${a.description}`);
  }

  process.exit(0);
}

if (command === 'help') {
  console.log(`
Forgekeeper v3 CLI

Commands:
  npm start                  Start everything (loop + dashboard + Telegram)
  npm run setup              Run setup wizard
  npm run health             Check system health
  npm test                   Run tests

  node index.js task "..."   Create a new task
  node index.js goal "..."   Create a new goal
  node index.js status       Show current status
  node index.js help         Show this help

Environment:
  TELEGRAM_BOT_TOKEN         Telegram bot token (enables Telegram)
  TELEGRAM_ALLOWED_USERS     Comma-separated user IDs
  TELEGRAM_ADMIN_USERS       Users who can approve tasks
  FK_LOOP_INTERVAL_MS        Loop interval (default: 10000)
  FK_CLAUDE_CMD              Claude command (default: claude)
  FK_DATA_DIR                Data directory (default: ./data)
  FK_DASHBOARD_ENABLED       Enable web dashboard (default: 1)
  FK_DASHBOARD_PORT          Dashboard port (default: 3000)

Set these in your .env file or run: forgekeeper setup
`);
  process.exit(0);
}

// Default: start the loop
init().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
