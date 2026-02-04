#!/usr/bin/env node
// Forgekeeper v3.1 - Minimal AI Agent with Claude Code as the brain
import { config } from './config.js';
import loop from './core/loop.js';
import { conversations, tasks, goals, approvals, learnings } from './core/memory.js';
import { query, chat, resetSessionState, createdSessions } from './core/claude.js';
import { routeMessage, analyzeTopics, TOPIC_TYPES } from './core/topic-router.js';
import { createAgentPool } from './core/agent-pool.js';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Track child processes for cleanup
let telegramProcess = null;

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
  console.log('[Init] Loading configuration...');
  console.log(`  - Loop interval: ${config.loop.intervalMs}ms`);
  console.log(`  - Max concurrent: ${config.loop.maxConcurrentTasks}`);
  console.log(`  - Data dir: ${config.paths.data}`);

  // Load skills
  console.log('[Init] Loading skills...');
  const skills = await loadSkills();
  console.log(`  - Loaded ${skills.length} skills`);

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
  console.log('  - Stop: Ctrl+C\n');
}

// Start Telegram bot as integrated process
async function startTelegramBot() {
  const telegramScript = join(__dirname, 'mcp-servers', 'telegram.js');

  telegramProcess = spawn('node', [telegramScript], {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout for MCP, stderr to console
    env: process.env,
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
        telegramProcess.stdin.write(JSON.stringify({ id: request.id, result: response }) + '\n');
      } catch (e) {
        // Not JSON or parse error - might be log output
      }
    }
  });

  telegramProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[Telegram] Bot exited with code ${code}`);
    }
    telegramProcess = null;
  });

  telegramProcess.on('error', (err) => {
    console.error(`[Telegram] Failed to start: ${err.message}`);
    telegramProcess = null;
  });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 1000));
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
      const { userId } = params;
      const oldSessionId = userSessions.get(String(userId));
      if (oldSessionId) {
        resetSessionState(oldSessionId); // Clear from created sessions tracking
      }
      const newSessionId = randomUUID();
      userSessions.set(String(userId), newSessionId);
      saveUserSessions();
      conversations.clear(userId);
      console.log(`[Chat] Reset session for user ${userId}: ${newSessionId}`);
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
      const { message, userId } = params;

      // Store in conversation history
      conversations.append(userId, { role: 'user', content: message });

      // Check if message has multiple topics (sentences, questions, tasks mixed)
      const hasMultipleTopics = message.split(/[.!?]/).filter(s => s.trim()).length > 1 ||
                                (message.includes('?') && message.match(/^(create|make|build|add|fix|update)/i));

      // Use topic router for complex multi-topic messages
      if (hasMultipleTopics && config.topicRouter?.enabled) {
        console.log('[Chat] Routing multi-topic message...');
        try {
          const chatFn = async (msg, uid) => {
            const sessionId = getOrCreateSession(uid);
            const result = await chat(msg, sessionId);
            return { reply: result.success ? result.output?.trim() : null };
          };

          const routeResult = await routeMessage(message, userId, {
            agentPool,
            chat: chatFn,
          });

          if (routeResult.response) {
            conversations.append(userId, { role: 'assistant', content: routeResult.response });
            return { reply: routeResult.response };
          }
        } catch (error) {
          console.error('[Chat] Topic routing error:', error.message);
          // Fall through to standard chat
        }
      }

      const lowerMsg = message.toLowerCase();

      // Check if it's a task request (imperative commands)
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

      // For everything else, chat with Claude using persistent session
      try {
        const sessionId = getOrCreateSession(userId);

        console.log('[Chat] Sending to Claude:', message.slice(0, 50), '(session:', sessionId.slice(0, 8) + '...)');
        const result = await chat(message, sessionId);
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
async function shutdown() {
  console.log('\n[Shutdown] Stopping Forgekeeper...');

  // Stop agent pool
  if (agentPool) {
    console.log('[Shutdown] Stopping agent pool...');
    await agentPool.shutdown();
    agentPool = null;
  }

  // Stop Telegram bot
  if (telegramProcess) {
    console.log('[Shutdown] Stopping Telegram bot...');
    telegramProcess.kill('SIGTERM');
    telegramProcess = null;
  }

  loop.stop();

  // Signal PM2 we're ready for restart (if running under PM2)
  if (process.send) {
    process.send('ready');
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

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

See .env.example for all options.
`);
  process.exit(0);
}

// Default: start the loop
init().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
