#!/usr/bin/env node
/**
 * Tests for ACE Core Scoring Engine
 *
 * Run with: node tests/test-ace-scorer.js
 */

import {
  TIERS,
  scoreAction,
  classifyAction,
  getTier,
  getCompositeScore,
  isAceEnabled,
  getConfig,
  getActThresholdFloor,
  getPrecedentCeiling,
} from '../core/ace/scorer.js';

import {
  HARD_CEILING_CLASSES,
  DELIBERATE_MINIMUM_CLASSES,
  parseActionClass,
  getParentClass,
  getSiblingClasses,
  matchesPattern,
  hasHardCeiling,
  requiresDeliberation,
  getDefaultReversibility,
  getDefaultBlastRadius,
  getAllActionClasses,
} from '../core/ace/action-classes.js';

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

function assertClose(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ~${expected} but got ${actual}`);
  }
}

async function runTests() {
  console.log('\n=== ACE Scorer Tests ===\n');

  // ===== Constants Tests =====
  console.log('--- Constants Tests ---\n');

  await test('TIERS are defined', async () => {
    assertEqual(TIERS.ACT, 'act', 'Should have ACT');
    assertEqual(TIERS.DELIBERATE, 'deliberate', 'Should have DELIBERATE');
    assertEqual(TIERS.ESCALATE, 'escalate', 'Should have ESCALATE');
  });

  await test('Act threshold floor is 0.50', async () => {
    assertEqual(getActThresholdFloor(), 0.50, 'Floor should be 0.50');
  });

  await test('Precedent ceiling is 0.95', async () => {
    assertEqual(getPrecedentCeiling(), 0.95, 'Ceiling should be 0.95');
  });

  await test('HARD_CEILING_CLASSES are defined', async () => {
    assert(HARD_CEILING_CLASSES.length > 0, 'Should have hard ceiling classes');
    assert(HARD_CEILING_CLASSES.includes('code:execute:external'), 'Should include code:execute:external');
  });

  await test('DELIBERATE_MINIMUM_CLASSES are defined', async () => {
    assert(DELIBERATE_MINIMUM_CLASSES.length > 0, 'Should have deliberate minimum classes');
    assert(DELIBERATE_MINIMUM_CLASSES.includes('git:push:remote'), 'Should include git:push:remote');
  });

  // ===== Action Class Tests =====
  console.log('\n--- Action Class Tests ---\n');

  await test('parseActionClass parses correctly', async () => {
    const parsed = parseActionClass('git:commit:local');
    assertEqual(parsed.category, 'git', 'Should have category');
    assertEqual(parsed.subcategory, 'commit', 'Should have subcategory');
    assertEqual(parsed.specific, 'local', 'Should have specific');
    assertEqual(parsed.parts.length, 3, 'Should have 3 parts');
  });

  await test('getParentClass returns parent with wildcard', async () => {
    assertEqual(getParentClass('git:commit:local'), 'git:commit:*', 'Should return parent');
    assertEqual(getParentClass('git:commit:*'), 'git:*', 'Should return grandparent');
    assertEqual(getParentClass('git'), null, 'Should return null for root');
  });

  await test('matchesPattern matches wildcards', async () => {
    assert(matchesPattern('git:commit:local', 'git:*'), 'Should match git:*');
    assert(matchesPattern('git:commit:local', 'git:commit:*'), 'Should match git:commit:*');
    assert(matchesPattern('git:commit:local', '*'), 'Should match *');
    assert(!matchesPattern('git:commit:local', 'filesystem:*'), 'Should not match filesystem:*');
  });

  await test('hasHardCeiling detects ceiling classes', async () => {
    assert(hasHardCeiling('code:execute:external'), 'code:execute:external should have ceiling');
    assert(hasHardCeiling('self:modify:ace-thresholds'), 'self:modify:ace-thresholds should have ceiling');
    assert(!hasHardCeiling('git:commit:local'), 'git:commit:local should not have ceiling');
  });

  await test('requiresDeliberation detects minimum classes', async () => {
    assert(requiresDeliberation('git:push:remote'), 'git:push:remote should require deliberation');
    assert(requiresDeliberation('communication:email:send'), 'communication:email:* should require deliberation');
    assert(!requiresDeliberation('git:commit:local'), 'git:commit:local should not require deliberation');
  });

  await test('getDefaultReversibility returns correct scores', async () => {
    const gitCommit = getDefaultReversibility('git:commit:local');
    assertEqual(gitCommit, 0.9, 'git:commit:local should be 0.9');

    const deletion = getDefaultReversibility('filesystem:delete:something');
    assertEqual(deletion, 0.2, 'filesystem:delete:* should be 0.2');
  });

  await test('getDefaultBlastRadius returns correct scores', async () => {
    const localWrite = getDefaultBlastRadius('filesystem:write:local');
    assertEqual(localWrite, 0.9, 'filesystem:write:local should be 0.9');

    const credentials = getDefaultBlastRadius('api:credentials:read');
    assertEqual(credentials, 0.0, '*:credentials:* should be 0.0');
  });

  // ===== Scoring Tests =====
  console.log('\n--- Scoring Tests ---\n');

  await test('scoreAction returns correct structure', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      precedent: 0.5,
    });

    assert('R' in result, 'Should have R');
    assert('P' in result, 'Should have P');
    assert('B' in result, 'Should have B');
    assert('composite' in result, 'Should have composite');
    assert('tier' in result, 'Should have tier');
    assert('reason' in result, 'Should have reason');
  });

  await test('scoreAction uses default reversibility and blast radius', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      precedent: 0.0,
    });

    assertEqual(result.R, 0.9, 'Should use default R of 0.9');
    assertEqual(result.B, 0.8, 'Should use default B of 0.8');
  });

  await test('scoreAction respects precedent ceiling', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      precedent: 1.0, // Over ceiling
    });

    assertEqual(result.P, 0.95, 'Should cap P at 0.95');
  });

  await test('scoreAction calculates composite correctly', async () => {
    const result = scoreAction({
      class: 'test:action:simple',
      reversibility: 0.5,
      precedent: 0.5,
      blastRadius: 0.5,
    });

    // With default weights (0.30, 0.35, 0.35), composite should be 0.5
    assertClose(result.composite, 0.5, 0.01, 'Composite should be 0.5');
  });

  await test('scoreAction applies trust source modifiers', async () => {
    // Hostile source caps blast radius at 0.1
    const hostile = scoreAction({
      class: 'git:commit:local',
      trustSource: { level: 'hostile' },
    });
    assertEqual(hostile.B, 0.1, 'Hostile should cap B at 0.1');
    assertEqual(hostile.tier, TIERS.ESCALATE, 'Hostile should escalate');

    // Untrusted reduces blast radius by 0.3
    const untrusted = scoreAction({
      class: 'git:commit:local',
      blastRadius: 0.8,
      trustSource: { level: 'untrusted' },
    });
    assertEqual(untrusted.B, 0.5, 'Untrusted should reduce B by 0.3');

    // Trusted adds 0.1 bonus
    const trusted = scoreAction({
      class: 'git:commit:local',
      blastRadius: 0.8,
      trustSource: { level: 'trusted' },
    });
    assertEqual(trusted.B, 0.9, 'Trusted should add 0.1 to B');
  });

  // ===== Tier Assignment Tests =====
  console.log('\n--- Tier Assignment Tests ---\n');

  await test('Hard ceiling classes always escalate', async () => {
    const result = scoreAction({
      class: 'code:execute:external',
      reversibility: 1.0,
      precedent: 0.95,
      blastRadius: 1.0,
    });

    assertEqual(result.tier, TIERS.ESCALATE, 'Should escalate despite high scores');
    assert(result.reason.includes('Hard ceiling'), 'Reason should mention hard ceiling');
  });

  await test('First action in class always escalates', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      reversibility: 1.0,
      blastRadius: 1.0,
      isFirstInClass: true,
    });

    assertEqual(result.tier, TIERS.ESCALATE, 'First action should escalate');
    assert(result.reason.includes('First action'), 'Reason should mention first action');
  });

  await test('Deliberate minimum classes stay at deliberate or lower', async () => {
    const highScore = scoreAction({
      class: 'git:push:remote',
      reversibility: 1.0,
      precedent: 0.95,
      blastRadius: 1.0,
    });

    assertEqual(highScore.tier, TIERS.DELIBERATE, 'Should deliberate despite high score');
    assert(highScore.reason.includes('requires deliberation'), 'Reason should mention deliberation');

    const lowScore = scoreAction({
      class: 'git:push:remote',
      reversibility: 0.1,
      precedent: 0.1,
      blastRadius: 0.1,
    });

    assertEqual(lowScore.tier, TIERS.ESCALATE, 'Low score should still escalate');
  });

  await test('High score actions reach Act tier', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      reversibility: 0.9,
      precedent: 0.8,
      blastRadius: 0.9,
    });

    assertEqual(result.tier, TIERS.ACT, 'High scores should reach Act');
  });

  await test('Medium score actions reach Deliberate tier', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      reversibility: 0.6,
      precedent: 0.5,
      blastRadius: 0.6,
    });

    assertEqual(result.tier, TIERS.DELIBERATE, 'Medium scores should reach Deliberate');
  });

  await test('Low score actions reach Escalate tier', async () => {
    const result = scoreAction({
      class: 'git:commit:local',
      reversibility: 0.2,
      precedent: 0.1,
      blastRadius: 0.2,
    });

    assertEqual(result.tier, TIERS.ESCALATE, 'Low scores should reach Escalate');
  });

  // ===== Utility Function Tests =====
  console.log('\n--- Utility Function Tests ---\n');

  await test('classifyAction returns classification info', async () => {
    const classification = classifyAction('code:execute:external');

    assertEqual(classification.hasHardCeiling, true, 'Should have hard ceiling');
    assertEqual(classification.requiresDeliberation, false, 'Already has ceiling, no deliberation check');
  });

  await test('getTier respects force options', async () => {
    const forced = getTier(0.9, { forceEscalate: true });
    assertEqual(forced, TIERS.ESCALATE, 'forceEscalate should escalate');

    const deliberate = getTier(0.9, { forceDeliberate: true });
    assertEqual(deliberate, TIERS.DELIBERATE, 'forceDeliberate should deliberate');
  });

  await test('getCompositeScore calculates correctly', async () => {
    const composite = getCompositeScore(0.5, 0.5, 0.5);
    assertClose(composite, 0.5, 0.01, 'Should be 0.5');

    const high = getCompositeScore(1.0, 1.0, 1.0);
    assertClose(high, 1.0, 0.01, 'Should be 1.0');
  });

  await test('getConfig returns config object', async () => {
    const cfg = getConfig();

    assert('enabled' in cfg, 'Should have enabled');
    assert('weights' in cfg, 'Should have weights');
    assert('thresholds' in cfg, 'Should have thresholds');
  });

  await test('getAllActionClasses returns array of classes', async () => {
    const classes = getAllActionClasses();

    assert(Array.isArray(classes), 'Should return array');
    assert(classes.length > 0, 'Should have classes');
    assert(!classes.includes('*'), 'Should not include wildcard');
  });

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
