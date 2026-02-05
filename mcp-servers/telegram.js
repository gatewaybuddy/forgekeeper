#!/usr/bin/env node
// Telegram MCP Server for Forgekeeper v3
// Uses custom polling implementation for Node 23 compatibility
import { TelegramPoller } from './telegram-polling.js';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FK_DATA_DIR || join(__dirname, '..', 'data');
const PENDING_FILE = join(DATA_DIR, 'telegram_pending.json');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
const ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(Boolean);

// Resilience configuration
const MAX_RETRIES = parseInt(process.env.FK_TELEGRAM_MAX_RETRIES || '5');
const RETRY_DELAY_MS = parseInt(process.env.FK_TELEGRAM_RETRY_DELAY_MS || '5000');
const MAX_RETRY_DELAY_MS = parseInt(process.env.FK_TELEGRAM_MAX_RETRY_DELAY_MS || '60000');

if (!BOT_TOKEN) {
  console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// Initialize bot with custom poller (works with Node 23)
const bot = new TelegramPoller(BOT_TOKEN);

// Track connection state
let isConnected = false;
let retryCount = 0;
let isShuttingDown = false;

// Pending messages queue (for when loop requests input)
let pendingRequests = loadPendingRequests();
let messageHandlers = new Map();

function loadPendingRequests() {
  if (existsSync(PENDING_FILE)) {
    try {
      return JSON.parse(readFileSync(PENDING_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function savePendingRequests() {
  writeFileSync(PENDING_FILE, JSON.stringify(pendingRequests, null, 2));
}

// Check if user is allowed
function isAllowed(ctx) {
  const userId = ctx.from?.id?.toString();
  const username = ctx.from?.username?.toLowerCase();

  if (ALLOWED_USERS.length === 0) return true; // No restrictions

  return ALLOWED_USERS.some(allowed => {
    const a = allowed.toLowerCase();
    return a === userId || a === `@${username}` || a === username;
  });
}

function isAdmin(ctx) {
  const userId = ctx.from?.id?.toString();
  const username = ctx.from?.username?.toLowerCase();

  return ADMIN_USERS.some(allowed => {
    const a = allowed.toLowerCase();
    return a === userId || a === `@${username}` || a === username;
  });
}

// Handle messages
bot.on('message', async (ctx) => {
  if (!isAllowed(ctx)) {
    if (ctx.message.text === '/start') {
      await ctx.reply(
        `Not authorized.\n\n` +
        `Your user ID: ${ctx.from.id}\n` +
        `Your username: @${ctx.from.username || 'none'}\n\n` +
        `Add your ID or @username to TELEGRAM_ALLOWED_USERS in .env`
      );
    }
    return;
  }
  if (isShuttingDown) return;

  const text = ctx.message.text || '';
  const userId = ctx.from.id;

  // Handle commands
  if (text.startsWith('/')) {
    const [command, ...args] = text.split(' ');
    const argText = args.join(' ').trim();

    switch (command) {
      case '/start':
      case '/help':
        await ctx.reply(`Welcome to Forgekeeper v3!

Your user ID: ${userId}
Your username: @${ctx.from.username || 'none'}

Commands:
/task <description> - Create a new task
/goal <description> - Create a new goal
/status - Show current status
/newsession - Start a fresh conversation
/approve <id> - Approve a pending request
/reject <id> - Reject a pending request
/help - Show this help

Just send a message to chat with me.`);
        return;

      case '/newsession':
        const resetResponse = await mcpCall('reset_session', { userId });
        await ctx.reply(resetResponse.success
          ? '🔄 Started a new conversation session. Previous context cleared.'
          : '❌ Failed to reset session.');
        return;

      case '/task':
        if (!argText) {
          await ctx.reply('Usage: /task <description>');
          return;
        }
        const taskResponse = await mcpCall('create_task', { description: argText, userId });
        await ctx.reply(`Task created: ${taskResponse.taskId}\n${argText}`);
        return;

      case '/goal':
        if (!argText) {
          await ctx.reply('Usage: /goal <description>');
          return;
        }
        const goalResponse = await mcpCall('create_goal', { description: argText, userId });
        await ctx.reply(`Goal created: ${goalResponse.goalId}\n${argText}`);
        return;

      case '/status':
        const statusResponse = await mcpCall('get_status', {});
        await ctx.reply(`📊 Forgekeeper Status

🔄 Running: ${statusResponse.running ? 'Yes' : 'No'}
📋 Pending Tasks: ${statusResponse.pendingTasks}
🎯 Active Goals: ${statusResponse.activeGoals}
✅ Pending Approvals: ${statusResponse.pendingApprovals}
${statusResponse.currentTask ? `\n⚡ Current: ${statusResponse.currentTask}` : ''}`);
        return;

      case '/approve':
        if (!isAdmin(ctx)) {
          await ctx.reply('Only admins can approve requests.');
          return;
        }
        if (!argText) {
          await ctx.reply('Usage: /approve <approval-id>');
          return;
        }
        const approveResponse = await mcpCall('resolve_approval', { id: argText, decision: 'approved', userId });
        await ctx.reply(approveResponse.success ? `✅ Approved: ${argText}` : `❌ Failed: ${approveResponse.error}`);
        return;

      case '/reject':
        if (!isAdmin(ctx)) {
          await ctx.reply('Only admins can reject requests.');
          return;
        }
        if (!argText) {
          await ctx.reply('Usage: /reject <approval-id>');
          return;
        }
        const rejectResponse = await mcpCall('resolve_approval', { id: argText, decision: 'rejected', userId });
        await ctx.reply(rejectResponse.success ? `❌ Rejected: ${argText}` : `❌ Failed: ${rejectResponse.error}`);
        return;
    }
  }

  // Check if this is a response to a pending request
  const pending = pendingRequests.find(r => r.userId === userId && r.status === 'waiting');
  if (pending) {
    pending.response = text;
    pending.status = 'responded';
    savePendingRequests();

    const handler = messageHandlers.get(pending.id);
    if (handler) {
      handler.resolve(text);
      messageHandlers.delete(pending.id);
    }

    await ctx.react('👍');
    return;
  }

  // Regular message - send to Claude
  console.error(`[Telegram] ========== MESSAGE RECEIVED ==========`);
  console.error(`[Telegram] Raw text: "${text}"`);
  console.error(`[Telegram] Text length: ${text.length}`);
  console.error(`[Telegram] Text JSON: ${JSON.stringify(text)}`);
  console.error(`[Telegram] Full message object: ${JSON.stringify(ctx.message).slice(0, 500)}`);
  console.error(`[Telegram] ========== END MESSAGE ==========`);

  await ctx.react('👀');

  // Set up progress updates for long-running operations
  let progressInterval;
  let lastProgressUpdate = 0;
  const startTime = Date.now();

  progressInterval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(progressInterval);
      return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if ((elapsed >= 60 && elapsed < 120 && lastProgressUpdate < 60) ||
        (elapsed >= 120 && elapsed < 180 && lastProgressUpdate < 120) ||
        (elapsed >= 180 && elapsed - lastProgressUpdate >= 120)) {
      lastProgressUpdate = elapsed;
      try {
        await bot.sendMessage(ctx.chat.id, `⏳ Still working... (${elapsed}s)`);
      } catch (e) {
        // Ignore
      }
    }
  }, 30000);

  try {
    // Include reply context if this is a reply to a previous message
    const replyContext = ctx.message.reply_to_message?.text || null;
    const response = await mcpCall('chat', { message: text, userId, replyToMessage: replyContext });
    clearInterval(progressInterval);

    if (isShuttingDown) return;

    if (response.error) {
      await ctx.react('❌');
      const errorMsg = response.error.length > 200 ? response.error.slice(0, 200) + '...' : response.error;
      await ctx.reply(`⚠️ Error: ${errorMsg}`);
    } else if (response.reply) {
      await ctx.react('✅');
      const reply = response.reply;
      if (reply.length > 4000) {
        const chunks = reply.match(/.{1,4000}/gs) || [reply];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(reply);
      }
    } else {
      await ctx.react('❓');
      await ctx.reply("I processed your message but didn't get a response.");
    }
  } catch (error) {
    clearInterval(progressInterval);
    if (!isShuttingDown) {
      await ctx.react('❌');
      await ctx.reply(`⚠️ Something went wrong: ${(error.message || 'Unknown error').slice(0, 200)}`);
    }
  }
});

// MCP Protocol - communicate with the main loop
const mcpRequests = new Map();
let requestId = 0;

const MCP_TIMEOUT_MS = parseInt(process.env.FK_CLAUDE_TIMEOUT_MS || '300000') + 60000;

function mcpCall(method, params) {
  return new Promise((resolve) => {
    const id = ++requestId;
    mcpRequests.set(id, resolve);

    const request = { id, method, params };
    console.log(JSON.stringify(request));

    setTimeout(() => {
      if (mcpRequests.has(id)) {
        mcpRequests.delete(id);
        console.error(`[Telegram] MCP request ${id} (${method}) timed out`);
        resolve({ error: `Request timed out after ${MCP_TIMEOUT_MS / 1000}s` });
      }
    }, MCP_TIMEOUT_MS);
  });
}

// Listen for responses from the loop
const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const data = JSON.parse(line);

    if (data.id && mcpRequests.has(data.id)) {
      const resolve = mcpRequests.get(data.id);
      mcpRequests.delete(data.id);
      resolve(data.result || data);
      return;
    }

    if (data.method) {
      const result = await handleLoopRequest(data);
      console.log(JSON.stringify({ id: data.id, result }));
    }
  } catch (e) {
    console.error('[Telegram] Parse error:', e.message);
  }
});

// Handle requests from the main loop
async function handleLoopRequest(request) {
  const { method, params } = request;

  switch (method) {
    case 'send_message': {
      const { userId, text, options } = params;
      try {
        await bot.sendMessage(userId, text, options);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'request_input': {
      const { userId, prompt, timeout = 300000 } = params;
      const reqId = `input-${Date.now()}`;

      await bot.sendMessage(userId, prompt);

      const pendingReq = {
        id: reqId,
        userId,
        prompt,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      pendingRequests.push(pendingReq);
      savePendingRequests();

      return new Promise((resolve) => {
        messageHandlers.set(reqId, { resolve: (text) => resolve({ success: true, response: text }) });

        setTimeout(() => {
          if (messageHandlers.has(reqId)) {
            messageHandlers.delete(reqId);
            pendingReq.status = 'timeout';
            savePendingRequests();
            resolve({ success: false, error: 'Timeout waiting for response' });
          }
        }, timeout);
      });
    }

    case 'request_approval': {
      const { userId, description, data, approvalId } = params;

      let message = `🔔 Approval Required\n\n${description}`;
      if (data?.code) {
        message += `\n\nCode preview:\n\`\`\`\n${data.code.slice(0, 500)}...\n\`\`\``;
      }
      message += `\n\nReply:\n/approve ${approvalId}\n/reject ${approvalId}`;

      await bot.sendMessage(userId, message);
      return { success: true, notified: true };
    }

    case 'broadcast': {
      const { text, onlyAdmins } = params;
      const targets = onlyAdmins ? ADMIN_USERS : ALLOWED_USERS;

      for (const userId of targets) {
        try {
          await bot.sendMessage(userId, text);
        } catch (e) {
          console.error(`[Telegram] Failed to send to ${userId}:`, e.message);
        }
      }
      return { success: true, sent: targets.length };
    }

    default:
      return { error: `Unknown method: ${method}` };
  }
}

// Calculate retry delay with exponential backoff
function getRetryDelay(attempt) {
  const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

// Start bot with retry logic
async function startBot() {
  if (isShuttingDown) return;

  try {
    console.error(`[Telegram] Starting bot (attempt ${retryCount + 1}/${MAX_RETRIES})...`);

    const me = await bot.start({ dropPendingUpdates: retryCount > 0 });

    isConnected = true;
    retryCount = 0;
    console.error('[Telegram] Bot started successfully');
    console.error(`[Telegram] Connected as @${me.username}`);
    console.error(`[Telegram] Allowed users: ${ALLOWED_USERS.length || 'all'}`);
    console.error(`[Telegram] Admin users: ${ADMIN_USERS.length}`);

  } catch (err) {
    isConnected = false;
    console.error('[Telegram] Failed to start:', err.message);

    if (isShuttingDown) return;

    retryCount++;
    if (retryCount < MAX_RETRIES) {
      const delay = getRetryDelay(retryCount);
      console.error(`[Telegram] Retrying in ${delay}ms...`);
      setTimeout(startBot, delay);
    } else {
      console.error(`[Telegram] Max retries (${MAX_RETRIES}) exceeded, giving up`);
      process.exit(1);
    }
  }
}

// Error handler
bot.on('error', (err) => {
  console.error('[Telegram] Bot error:', err.message);
  if (!isShuttingDown && retryCount < MAX_RETRIES) {
    console.error('[Telegram] Attempting to restart...');
    bot.stop();
    retryCount++;
    setTimeout(startBot, getRetryDelay(retryCount));
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`[Telegram] Received ${signal}, shutting down...`);
  bot.stop();
  process.exit(0);
}

// Start the bot
startBot();

// Shutdown handlers
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[Telegram] Uncaught exception:', err.message);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Telegram] Unhandled rejection:', reason);
});
