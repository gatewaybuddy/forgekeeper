#!/usr/bin/env node
// Forgekeeper v3 - Minimal AI Agent with Claude Code as the brain
import { config } from './config.js';
import loop from './core/loop.js';
import { conversations, tasks, goals, approvals } from './core/memory.js';
import { loadSkills } from './skills/registry.js';

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

  console.log('\n[Ready] Forgekeeper v3 is running.');
  if (config.dashboard.enabled) {
    console.log(`  - Dashboard: http://localhost:${config.dashboard.port}`);
  }
  console.log('  - Start Telegram: npm run telegram');
  console.log('  - Stop: Ctrl+C\n');
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

// Handle shutdown
function shutdown() {
  console.log('\n[Shutdown] Stopping Forgekeeper...');
  loop.stop();
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
  node index.js              Start the agent loop
  node index.js task "..."   Create a new task
  node index.js goal "..."   Create a new goal
  node index.js status       Show current status
  node index.js help         Show this help

Environment:
  TELEGRAM_BOT_TOKEN         Telegram bot token
  FK_LOOP_INTERVAL_MS        Loop interval (default: 10000)
  FK_CLAUDE_CMD              Claude command (default: claude)
  FK_DATA_DIR                Data directory (default: ./data)

See config.js for all options.
`);
  process.exit(0);
}

// Default: start the loop
init().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
