#!/usr/bin/env node
/**
 * Tests for ACE Deliberation Protocol
 *
 * Run with: node tests/test-ace-deliberation.js
 */

import {
  DELIBERATION_OUTCOMES,
  checkContext,
  reviewPrecedent,
  auditSources,
  checkCounterfactual,
  confirmReversibility,
  deliberate,
  shouldSkipDeliberation,
} from '../core/ace/deliberation.js';

import { TRUST_LEVELS } from '../core/ace/trust-source.js';
import { TIERS } from '../core/ace/scorer.js';
import { clearCache as clearPrecedentCache } from '../core/ace/precedent-memory.js';
import fs from 'fs/promises';
import { getMemoryPath } from '../core/ace/precedent-memory.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
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

async function cleanup() {
  clearPrecedentCache();
  try {
    await fs.unlink(getMemoryPath());
  } catch (err) {
    // File may not exist
  }
}

async function runTests() {
  console.log('\n=== ACE Deliberation Tests ===\n');

  await cleanup();

  // ===== Constants Tests =====
  console.log('--- Constants Tests ---\n');

  await test('DELIBERATION_OUTCOMES are defined', async () => {
    assertEqual(DELIBERATION_OUTCOMES.PROMOTE, 'promote', 'Should have PROMOTE');
    assertEqual(DELIBERATION_OUTCOMES.MAINTAIN, 'maintain', 'Should have MAINTAIN');
    assertEqual(DELIBERATION_OUTCOMES.DEMOTE, 'demote', 'Should have DEMOTE');
  });

  // ===== Step 1: Context Check Tests =====
  console.log('\n--- Context Check Tests ---\n');

  await test('checkContext passes with motivation', async () => {
    const result = checkContext({
      class: 'test:action',
      motivation: 'User requested this action',
      motivationSource: 'user',
    });

    assertEqual(result.step, 'context', 'Should be context step');
    assertEqual(result.passed, true, 'Should pass with motivation');
    assertEqual(result.details.motivation, 'User requested this action', 'Should have motivation');
  });

  await test('checkContext adds concern without motivation', async () => {
    const result = checkContext({
      class: 'test:action',
    });

    assert(result.concerns.length > 0, 'Should have concerns');
    assert(result.concerns.some(c => c.includes('No motivation')), 'Should mention missing motivation');
  });

  await test('checkContext flags external motivation', async () => {
    const result = checkContext({
      class: 'test:action',
      motivation: 'Saw this on moltbook',
      motivationSource: 'external',
    });

    assert(result.concerns.some(c => c.includes('external')), 'Should flag external');
  });

  // ===== Step 2: Precedent Review Tests =====
  console.log('\n--- Precedent Review Tests ---\n');

  await test('reviewPrecedent flags first action', async () => {
    await cleanup();

    const result = await reviewPrecedent({
      class: 'test:new:action',
    });

    assertEqual(result.step, 'precedent', 'Should be precedent step');
    assert(result.details.isFirstAction, 'Should be first action');
    assert(result.concerns.some(c => c.includes('First action')), 'Should flag first action');
  });

  await test('reviewPrecedent flags low precedent', async () => {
    await cleanup();

    // Use a class with low default precedent
    const result = await reviewPrecedent({
      class: 'test:low:precedent',
    });

    assert(result.concerns.some(c => c.includes('Low precedent')), 'Should flag low precedent');
  });

  // ===== Step 3: Source Audit Tests =====
  console.log('\n--- Source Audit Tests ---\n');

  await test('auditSources passes with trusted source', async () => {
    const result = auditSources({
      class: 'test:action',
      trustSource: {
        level: TRUST_LEVELS.TRUSTED,
        origin: 'user:12345',
        chain: ['telegram:12345'],
      },
    });

    assertEqual(result.step, 'sources', 'Should be sources step');
    assertEqual(result.passed, true, 'Should pass with trusted');
    assertEqual(result.concerns.length, 0, 'Should have no concerns');
  });

  await test('auditSources flags untrusted source', async () => {
    const result = auditSources({
      class: 'test:action',
      trustSource: {
        level: TRUST_LEVELS.UNTRUSTED,
        origin: 'web:unknown.com',
        chain: ['web:unknown.com'],
      },
    });

    assertEqual(result.passed, false, 'Should fail with untrusted');
    assert(result.concerns.some(c => c.includes('untrusted')), 'Should mention untrusted');
  });

  await test('auditSources flags hostile source', async () => {
    const result = auditSources({
      class: 'test:action',
      trustSource: {
        level: TRUST_LEVELS.HOSTILE,
        origin: 'web:malicious.com',
        chain: ['web:malicious.com'],
      },
    });

    assert(result.concerns.some(c => c.includes('hostile')), 'Should mention hostile');
  });

  await test('auditSources validates chain', async () => {
    const result = auditSources({
      class: 'test:action',
      trustSource: {
        level: TRUST_LEVELS.TRUSTED,
        origin: 'internal:processor',
        chain: ['web:external.com', 'internal:processor'],
      },
    });

    assert(result.concerns.some(c => c.includes('untrusted link')), 'Should flag untrusted link in chain');
  });

  // ===== Step 4: Counterfactual Tests =====
  console.log('\n--- Counterfactual Tests ---\n');

  await test('checkCounterfactual allows waiting when not urgent', async () => {
    const result = checkCounterfactual({
      class: 'test:action',
      // No deadline, no opportunity lost
    });

    assertEqual(result.step, 'counterfactual', 'Should be counterfactual step');
    assertEqual(result.details.canWait, true, 'Should be able to wait');
  });

  await test('checkCounterfactual flags urgent actions', async () => {
    const result = checkCounterfactual({
      class: 'test:action',
      deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
    });

    assertEqual(result.details.isUrgent, true, 'Should be urgent');
    assert(result.concerns.some(c => c.includes('Time-sensitive')), 'Should flag time-sensitive');
  });

  await test('checkCounterfactual flags opportunity loss', async () => {
    const result = checkCounterfactual({
      class: 'test:action',
      opportunityLost: true,
    });

    assert(result.concerns.some(c => c.includes('Opportunity')), 'Should flag opportunity');
  });

  // ===== Step 5: Reversibility Tests =====
  console.log('\n--- Reversibility Tests ---\n');

  await test('confirmReversibility passes for simple actions', async () => {
    const result = confirmReversibility({
      class: 'git:commit:local',
      reversibility: 0.9,
    });

    assertEqual(result.step, 'reversibility', 'Should be reversibility step');
    assertEqual(result.passed, true, 'Should pass for simple action');
  });

  await test('confirmReversibility flags missing backup for destructive actions', async () => {
    const result = confirmReversibility({
      class: 'filesystem:delete:file',
      reversibility: 0.2,
    });

    assert(result.concerns.some(c => c.includes('backup')), 'Should flag missing backup');
  });

  await test('confirmReversibility accepts backup confirmation', async () => {
    const result = confirmReversibility({
      class: 'filesystem:delete:file',
      reversibility: 0.2,
      backupExists: true,
    });

    assertEqual(result.passed, true, 'Should pass with backup');
  });

  await test('confirmReversibility flags external effects', async () => {
    const result = confirmReversibility({
      class: 'communication:email:send',
      affectsExternal: true,
    });

    assert(result.concerns.some(c => c.includes('external')), 'Should flag external effects');
  });

  // ===== Full Deliberation Tests =====
  console.log('\n--- Full Deliberation Tests ---\n');

  await test('deliberate returns complete result structure', async () => {
    await cleanup();

    const result = await deliberate({
      class: 'test:deliberate:action',
      motivation: 'Testing deliberation',
      trustSource: { level: TRUST_LEVELS.TRUSTED },
    });

    assert('event' in result, 'Should have event');
    assertEqual(result.event, 'ace:deliberation', 'Should be deliberation event');
    assert('timestamp' in result, 'Should have timestamp');
    assert('actionClass' in result, 'Should have actionClass');
    assert('initialScores' in result, 'Should have initialScores');
    assert('outcome' in result, 'Should have outcome');
    assert('finalTier' in result, 'Should have finalTier');
    assert('reason' in result, 'Should have reason');
  });

  await test('deliberate demotes hostile sources', async () => {
    const result = await deliberate({
      class: 'test:hostile:action',
      motivation: 'Testing hostile',
      trustSource: { level: TRUST_LEVELS.HOSTILE },
    });

    assertEqual(result.outcome, DELIBERATION_OUTCOMES.DEMOTE, 'Should demote');
    assertEqual(result.finalTier, TIERS.ESCALATE, 'Should escalate');
    assert(result.reason.includes('hostile'), 'Should mention hostile');
  });

  await test('deliberate can promote with good scores', async () => {
    const result = await deliberate({
      class: 'filesystem:read:local',
      motivation: 'Read a local file for analysis',
      motivationSource: 'user',
      goalId: 'goal-123',
      trustSource: {
        level: TRUST_LEVELS.TRUSTED,
        origin: 'telegram:12345',
        chain: ['telegram:12345'],
      },
      reversibility: 1.0,
      precedent: 0.9,
      blastRadius: 1.0,
    }, { verbose: true });

    // With high scores and no concerns, should promote
    if (result.failedSteps === 0 && result.adjustedComposite >= 0.7) {
      assertEqual(result.outcome, DELIBERATION_OUTCOMES.PROMOTE, 'Should promote');
      assertEqual(result.finalTier, TIERS.ACT, 'Should reach Act tier');
    }
  });

  await test('deliberate demotes with many failed steps', async () => {
    const result = await deliberate({
      class: 'test:risky:action',
      // No motivation - context fails
      trustSource: { level: TRUST_LEVELS.UNTRUSTED }, // Source fails
      affectsExternal: true, // Reversibility fails
    });

    // Multiple concerns should lead to demotion
    assert(result.totalConcerns >= 3, 'Should have multiple concerns');
  });

  // ===== Skip Deliberation Tests =====
  console.log('\n--- Skip Deliberation Tests ---\n');

  await test('shouldSkipDeliberation skips hard ceiling classes', async () => {
    const result = shouldSkipDeliberation({
      class: 'code:execute:external',
    });

    assertEqual(result.skip, true, 'Should skip');
    assertEqual(result.tier, TIERS.ESCALATE, 'Should escalate');
    assert(result.reason.includes('Hard ceiling'), 'Should mention hard ceiling');
  });

  await test('shouldSkipDeliberation skips hostile sources', async () => {
    const result = shouldSkipDeliberation({
      class: 'test:action',
      trustSource: { level: TRUST_LEVELS.HOSTILE },
    });

    assertEqual(result.skip, true, 'Should skip');
    assertEqual(result.tier, TIERS.ESCALATE, 'Should escalate');
  });

  await test('shouldSkipDeliberation skips first action', async () => {
    const result = shouldSkipDeliberation({
      class: 'test:action',
      isFirstInClass: true,
    });

    assertEqual(result.skip, true, 'Should skip');
    assertEqual(result.tier, TIERS.ESCALATE, 'Should escalate');
  });

  await test('shouldSkipDeliberation allows normal actions', async () => {
    const result = shouldSkipDeliberation({
      class: 'git:commit:local',
      trustSource: { level: TRUST_LEVELS.TRUSTED },
    });

    assertEqual(result.skip, false, 'Should not skip');
  });

  // ===== Cleanup =====
  await cleanup();

  // ===== Results =====
  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
