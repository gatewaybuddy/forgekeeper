#!/usr/bin/env node
/**
 * Test Script for Conversation Space Backend
 *
 * Tests:
 * 1. Message posting
 * 2. Agent relevance assessment
 * 3. Agent contributions
 * 4. SSE streaming
 * 5. Status endpoint
 *
 * Usage:
 *   node test-conversation-space.mjs
 *
 * Prerequisites:
 *   - Server must be running on port 3000
 *   - LLM backend must be available
 */

import { EventSource } from 'eventsource';

const BASE_URL = 'http://localhost:3000';
const CHANNEL_ID = 'general';

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message) {
  log('✅', message, colors.green);
}

function logError(message) {
  log('❌', message, colors.red);
}

function logInfo(message) {
  log('ℹ️ ', message, colors.blue);
}

function logAgent(agentId, message) {
  const agentColors = {
    forge: colors.yellow,
    scout: colors.magenta,
    loom: colors.cyan,
    anvil: colors.green
  };
  const color = agentColors[agentId] || colors.reset;
  const icons = {
    forge: '🔨',
    scout: '🔭',
    loom: '🧵',
    anvil: '⚒️'
  };
  const icon = icons[agentId] || '🤖';
  log(icon, `[${agentId.toUpperCase()}] ${message}`, color);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: Check server status
 */
async function testServerStatus() {
  logInfo('Test 1: Checking server status...');

  try {
    const response = await fetch(`${BASE_URL}/api/conversation-space/status`);
    const data = await response.json();

    if (data.success && data.status === 'active') {
      logSuccess(`Server active with ${data.agents.length} agents`);
      data.agents.forEach(agent => {
        log(agent.icon, `${agent.name} (${agent.role}) - threshold: ${agent.threshold}`, colors.cyan);
      });
      return true;
    } else {
      logError('Server not active');
      return false;
    }
  } catch (err) {
    logError(`Failed to connect to server: ${err.message}`);
    return false;
  }
}

/**
 * Test 2: Get recent messages
 */
async function testGetMessages() {
  logInfo('Test 2: Fetching recent messages...');

  try {
    const response = await fetch(`${BASE_URL}/api/conversation-space/channels/${CHANNEL_ID}/messages?limit=5`);
    const data = await response.json();

    if (data.success) {
      logSuccess(`Retrieved ${data.count} recent messages`);
      return true;
    } else {
      logError('Failed to get messages');
      return false;
    }
  } catch (err) {
    logError(`Error: ${err.message}`);
    return false;
  }
}

/**
 * Test 3: Post a message that should trigger Forge
 */
async function testPostMessageForge() {
  logInfo('Test 3: Posting message to trigger Forge (Executor)...');

  const testMessage = {
    content: 'Can you help me implement a REST API endpoint for user authentication? I need code examples.'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/conversation-space/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });

    const data = await response.json();

    if (data.success && data.message) {
      logSuccess(`Message posted: ${data.message.id}`);
      log('💬', `Content: "${data.message.content}"`, colors.bright);
      return data.message.id;
    } else {
      logError('Failed to post message');
      return null;
    }
  } catch (err) {
    logError(`Error: ${err.message}`);
    return null;
  }
}

/**
 * Test 4: Post a message that should trigger Scout (Guardian)
 */
async function testPostMessageScout() {
  logInfo('Test 4: Posting message to trigger Scout (Guardian)...');

  const testMessage = {
    content: 'Obviously this is the best approach. Everyone knows that authentication should work this way. It\'s clearly the right solution.'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/conversation-space/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });

    const data = await response.json();

    if (data.success && data.message) {
      logSuccess(`Message posted: ${data.message.id}`);
      log('💬', `Content: "${data.message.content}"`, colors.bright);
      return data.message.id;
    } else {
      logError('Failed to post message');
      return null;
    }
  } catch (err) {
    logError(`Error: ${err.message}`);
    return null;
  }
}

/**
 * Test 5: Post a message with @mention
 */
async function testPostMessageMention() {
  logInfo('Test 5: Posting message with @forge mention...');

  const testMessage = {
    content: '@forge can you show me an example of how to structure the authentication routes?'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/conversation-space/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });

    const data = await response.json();

    if (data.success && data.message) {
      logSuccess(`Message posted with @mention: ${data.message.id}`);
      return data.message.id;
    } else {
      logError('Failed to post message');
      return null;
    }
  } catch (err) {
    logError(`Error: ${err.message}`);
    return null;
  }
}

/**
 * Test 6: Listen to SSE stream
 */
async function testSSEStream(durationMs = 30000) {
  logInfo(`Test 6: Listening to SSE stream for ${durationMs / 1000}s...`);

  return new Promise((resolve) => {
    const eventSource = new EventSource(`${BASE_URL}/api/conversation-space/stream/${CHANNEL_ID}`);
    const events = [];
    let agentThinkingCount = 0;
    let agentContributingCount = 0;
    let agentChunkCount = 0;
    let agentCompleteCount = 0;

    eventSource.onopen = () => {
      logSuccess('SSE connection established');
    };

    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      log('🔗', `Connected to channel: ${data.channel_id}`, colors.green);
    });

    eventSource.addEventListener('message_created', (e) => {
      const data = JSON.parse(e.data);
      log('📨', `New message from ${data.message.author_name}`, colors.blue);
      events.push({ type: 'message_created', data });
    });

    eventSource.addEventListener('agent_thinking', (e) => {
      const data = JSON.parse(e.data);
      agentThinkingCount++;
      logAgent(data.agent_id, `Thinking (relevance: ${data.relevance_score.toFixed(2)})`);
      events.push({ type: 'agent_thinking', data });
    });

    eventSource.addEventListener('agent_contributing', (e) => {
      const data = JSON.parse(e.data);
      agentContributingCount++;
      logAgent(data.agent_id, `Contributing (${data.status})...`);
      events.push({ type: 'agent_contributing', data });
    });

    eventSource.addEventListener('agent_chunk', (e) => {
      const data = JSON.parse(e.data);
      agentChunkCount++;
      // Don't log every chunk (too noisy), just count
      events.push({ type: 'agent_chunk', data });
    });

    eventSource.addEventListener('agent_complete', (e) => {
      const data = JSON.parse(e.data);
      agentCompleteCount++;
      logAgent(data.agent_id, `Complete (${data.elapsed_ms}ms, ${agentChunkCount} chunks)`);
      events.push({ type: 'agent_complete', data });
    });

    eventSource.addEventListener('reaction_added', (e) => {
      const data = JSON.parse(e.data);
      log('👍', `${data.author_id} reacted with ${data.reaction_type}`, colors.yellow);
      events.push({ type: 'reaction_added', data });
    });

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
      resolve({ success: false, events, error: err });
    };

    // Close after duration
    setTimeout(() => {
      eventSource.close();
      logInfo(`SSE stream closed after ${durationMs / 1000}s`);
      logInfo(`Events received:`);
      log('  ', `Agent thinking: ${agentThinkingCount}`, colors.cyan);
      log('  ', `Agent contributing: ${agentContributingCount}`, colors.cyan);
      log('  ', `Agent chunks: ${agentChunkCount}`, colors.cyan);
      log('  ', `Agent complete: ${agentCompleteCount}`, colors.cyan);

      if (agentCompleteCount > 0) {
        logSuccess(`✅ Agents responded successfully!`);
      } else if (agentThinkingCount > 0) {
        log('⚠️ ', 'Agents assessed messages but did not contribute', colors.yellow);
      } else {
        log('⚠️ ', 'No agent activity detected', colors.yellow);
      }

      resolve({ success: agentCompleteCount > 0, events });
    }, durationMs);
  });
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('🧪', 'Conversation Space Backend Test Suite', colors.bright);
  console.log('='.repeat(60) + '\n');

  // Test 1: Server status
  const serverOk = await testServerStatus();
  if (!serverOk) {
    logError('Server not running. Please start the server first.');
    logInfo('Run: cd frontend && npm run dev');
    process.exit(1);
  }

  await sleep(1000);

  // Test 2: Get messages
  await testGetMessages();
  await sleep(1000);

  // Start SSE listener in background
  logInfo('Starting SSE listener...');
  const ssePromise = testSSEStream(40000); // Listen for 40 seconds

  await sleep(2000);

  // Test 3: Post message to trigger Forge
  await testPostMessageForge();
  await sleep(5000); // Wait for agents to process

  // Test 4: Post message to trigger Scout
  await testPostMessageScout();
  await sleep(5000);

  // Test 5: Post with @mention
  await testPostMessageMention();
  await sleep(5000);

  // Wait for SSE stream to complete
  logInfo('Waiting for agent responses...');
  const sseResult = await ssePromise;

  console.log('\n' + '='.repeat(60));
  log('📊', 'Test Summary', colors.bright);
  console.log('='.repeat(60));

  if (sseResult.success) {
    logSuccess('All tests passed! Agents are responding.');
    console.log('\n💡 Next steps:');
    console.log('  1. Check the messages in the UI');
    console.log('  2. Build the React UI components');
    console.log('  3. Test the full user experience');
  } else {
    log('⚠️ ', 'Tests completed but agents may not have responded', colors.yellow);
    console.log('\n💡 Possible issues:');
    console.log('  - LLM backend not running');
    console.log('  - Agent thresholds too high');
    console.log('  - Check server logs for errors');
  }

  console.log('\n');
}

// Run tests
runTests().catch(err => {
  logError(`Test suite failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
