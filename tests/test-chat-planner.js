#!/usr/bin/env node
/**
 * Tests for Chat Planner and Complexity Detection
 *
 * Tests the isLikelyComplex function and the route-proactive-reply hook
 * which together implement T415 - Smarter chat complexity detection
 *
 * Run with: node tests/test-chat-planner.js
 */

import { isLikelyComplex } from '../core/chat-planner.js';
import { join } from 'path';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`\u2705 ${name}`);
      passed++;
    } catch (err) {
      console.log(`\u274c ${name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  })();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected "${expected}" but got "${actual}"`);
  }
}

// Load and execute the hook directly for testing
const HOOK_PATH = 'D:/projects/forgekeeper/forgekeeper_personality/hooks/route-proactive-reply.js';

async function loadHook() {
  const hook = await import(`file://${HOOK_PATH}`);
  return hook;
}

async function runTests() {
  console.log('\n=== Chat Planner & Complexity Detection Tests ===\n');

  // Load the hook module
  let hook;
  try {
    hook = await loadHook();
    console.log('[Setup] Loaded route-proactive-reply hook\n');
  } catch (err) {
    console.error('[Setup] Failed to load hook:', err.message);
    console.log('[Setup] Some tests will be skipped\n');
  }

  // ========== isLikelyComplex Tests ==========
  console.log('--- isLikelyComplex Tests ---\n');

  await test('short simple messages are NOT complex', async () => {
    assertEqual(isLikelyComplex('Hello!'), false, 'Hello should not be complex');
    assertEqual(isLikelyComplex('Yes'), false, 'Yes should not be complex');
    assertEqual(isLikelyComplex('Thanks'), false, 'Thanks should not be complex');
    assertEqual(isLikelyComplex('Do it'), false, 'Do it should not be complex');
    assertEqual(isLikelyComplex('Be bold!'), false, 'Be bold should not be complex');
  });

  await test('truly complex messages ARE detected', async () => {
    const complexMsg = 'I want you to explore the entire codebase and examine all of the files, then analyze each one and create a plan for improving everything.';
    assertEqual(isLikelyComplex(complexMsg), true, 'Should detect complex message');
  });

  await test('long messages (>500 chars) are complex', async () => {
    const longMsg = 'a'.repeat(501);
    assertEqual(isLikelyComplex(longMsg), true, 'Long messages should be complex');
  });

  await test('multiple sentences with content are complex', async () => {
    const multiSentence = 'First do this thing here. Then check that other thing. Finally update the third component. And verify it all works.';
    assertEqual(isLikelyComplex(multiSentence), true, 'Multiple sentences should be complex');
  });

  await test('single keyword alone is NOT complex', async () => {
    assertEqual(isLikelyComplex('improve'), false, 'Single keyword should not be complex');
    assertEqual(isLikelyComplex('update'), false, 'Single keyword should not be complex');
    assertEqual(isLikelyComplex('explore'), false, 'Single keyword should not be complex');
  });

  // ========== Hook Tests (if available) ==========
  if (hook && hook.execute) {
    console.log('\n--- route-proactive-reply Hook Tests ---\n');

    await test('hook detects simple reply "Yes"', async () => {
      const result = await hook.execute('message:received', {
        message: 'Yes',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip complexity for "Yes"');
    });

    await test('hook detects simple reply "Be bold!"', async () => {
      const result = await hook.execute('message:received', {
        message: 'Be bold!',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip complexity for "Be bold!"');
    });

    await test('hook detects simple reply "Do it"', async () => {
      const result = await hook.execute('message:received', {
        message: 'Do it',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip complexity for "Do it"');
    });

    await test('hook detects simple reply "Go for it"', async () => {
      const result = await hook.execute('message:received', {
        message: 'Go for it',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip complexity for "Go for it"');
    });

    await test('hook detects simple reply "Sounds good"', async () => {
      const result = await hook.execute('message:received', {
        message: 'Sounds good',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip complexity for "Sounds good"');
    });

    await test('hook detects reply to proactive message (💭)', async () => {
      const result = await hook.execute('message:received', {
        message: 'That sounds interesting',
        lastAssistantMessage: '\ud83d\udcad I was thinking about the uncommitted files...',
      });
      assert(result?.skipComplexityCheck === true, 'Should skip for reply to proactive');
      assertEqual(result?.routingReason, 'proactive-reply', 'Should identify as proactive-reply');
    });

    await test('hook detects reply to action message (*thinking*)', async () => {
      const result = await hook.execute('message:received', {
        message: 'Yes please!',
        lastAssistantMessage: '*stretches and looks around* I noticed the tasks queue is empty.',
      });
      assert(result?.skipComplexityCheck === true, 'Should skip for action message reply');
    });

    await test('hook allows complex explicit task requests', async () => {
      const result = await hook.execute('message:received', {
        message: 'Create a new authentication system with OAuth support and multi-factor authentication',
        lastAssistantMessage: null,
      });
      // This is long and contains task keywords, so shouldn't be blocked
      // Hook returns null when it doesn't want to intervene
      assert(result === null || result?.skipComplexityCheck !== true, 'Should not skip for explicit complex task');
    });

    await test('hook skips short messages under 50 chars without task keywords', async () => {
      const result = await hook.execute('message:received', {
        message: 'That looks great to me actually',
        lastAssistantMessage: null,
      });
      assert(result?.skipComplexityCheck === true, 'Should skip for short non-task message');
    });

    await test('hook does not skip short messages WITH task keywords', async () => {
      const result = await hook.execute('message:received', {
        message: 'Create a new file',
        lastAssistantMessage: null,
      });
      // Contains "create" which is a task keyword
      assert(result === null || result?.skipComplexityCheck !== true, 'Should not skip when task keyword present');
    });
  }

  // ========== Integration Tests ==========
  console.log('\n--- Integration Tests ---\n');

  await test('simple replies would be handled by hook, not isLikelyComplex', async () => {
    const simpleMessages = ['Yes!', 'Do it', 'Be bold!', 'Sounds good, go for it'];

    for (const msg of simpleMessages) {
      if (hook?.execute) {
        const hookResult = await hook.execute('message:received', {
          message: msg,
          lastAssistantMessage: null,
        });
        // Either hook catches it, or isLikelyComplex is false
        const wouldBeComplex = isLikelyComplex(msg);
        const hookSkips = hookResult?.skipComplexityCheck === true;

        assert(hookSkips || !wouldBeComplex,
          `"${msg}" should either be caught by hook or not be complex`);
      }
    }
  });

  await test('complex requests still route to tasks', async () => {
    const complexMessage = 'I want you to explore all the files in the codebase and analyze each repository module, then create a comprehensive plan for improvements.';

    if (hook?.execute) {
      const hookResult = await hook.execute('message:received', {
        message: complexMessage,
        lastAssistantMessage: null,
      });
      // Hook should not interfere with complex requests
      assert(hookResult === null || hookResult?.skipComplexityCheck !== true, 'Hook should not skip complex');
    }

    // And isLikelyComplex should catch it
    assert(isLikelyComplex(complexMessage), 'isLikelyComplex should detect truly complex request');
  });

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n\u274c Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n\u2705 All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
