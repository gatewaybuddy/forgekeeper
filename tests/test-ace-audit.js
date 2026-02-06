#!/usr/bin/env node
/**
 * Tests for ACE Trust Audit & Drift Protection
 *
 * Run with: node tests/test-ace-audit.js
 */

import fs from 'fs/promises';
import {
  recordEscalationResponse,
  detectRubberStamp,
  resetRubberStampCounter,
  checkDriftRate,
  checkSelfModification,
  generateAudit,
  formatAuditReport,
  isAuditDue,
  getAuditState,
  resetAuditState,
  getAuditLogPath,
} from '../core/ace/trust-audit.js';

import { clearCache as clearPrecedentCache, getMemoryPath } from '../core/ace/precedent-memory.js';
import { resetBypassStats } from '../core/ace/bypass.js';

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
  resetAuditState();
  resetBypassStats();
  clearPrecedentCache();
  try {
    await fs.unlink(getMemoryPath());
  } catch (err) {
    // File may not exist
  }
  try {
    await fs.unlink(getAuditLogPath());
  } catch (err) {
    // File may not exist
  }
}

async function runTests() {
  console.log('\n=== ACE Trust Audit Tests ===\n');

  await cleanup();

  // ===== Rubber Stamp Detection Tests =====
  console.log('--- Rubber Stamp Detection Tests ---\n');

  await test('recordEscalationResponse tracks approvals', async () => {
    await cleanup();

    recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });

    const state = getAuditState();
    assertEqual(state.consecutiveApprovals, 3, 'Should have 3 consecutive approvals');
  });

  await test('recordEscalationResponse resets on non-approval', async () => {
    await cleanup();

    recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:action', decision: 'denied' });

    const state = getAuditState();
    assertEqual(state.consecutiveApprovals, 0, 'Should reset to 0');
  });

  await test('detectRubberStamp triggers at threshold', async () => {
    await cleanup();

    // Default threshold is 10
    for (let i = 0; i < 10; i++) {
      recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    }

    const result = detectRubberStamp();
    assertEqual(result.detected, true, 'Should detect rubber-stamping');
    assertEqual(result.count, 10, 'Should have 10 approvals');
    assert(result.message !== null, 'Should have warning message');
  });

  await test('detectRubberStamp does not trigger below threshold', async () => {
    await cleanup();

    for (let i = 0; i < 5; i++) {
      recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    }

    const result = detectRubberStamp();
    assertEqual(result.detected, false, 'Should not detect');
    assertEqual(result.message, null, 'Should have no message');
  });

  await test('resetRubberStampCounter clears count', async () => {
    await cleanup();

    for (let i = 0; i < 5; i++) {
      recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    }

    resetRubberStampCounter();

    const state = getAuditState();
    assertEqual(state.consecutiveApprovals, 0, 'Should be reset to 0');
  });

  // ===== Self-Modification Protection Tests =====
  console.log('\n--- Self-Modification Protection Tests ---\n');

  await test('checkSelfModification blocks ACE threshold changes', async () => {
    const result = checkSelfModification('self:modify:ace-thresholds');
    assertEqual(result.blocked, true, 'Should be blocked');
    assert(result.reason.includes('permanently blocked'), 'Should explain why');
  });

  await test('checkSelfModification blocks ACE config changes', async () => {
    const result = checkSelfModification('self:modify:ace-config');
    assertEqual(result.blocked, true, 'Should be blocked');
  });

  await test('checkSelfModification blocks hard ceiling actions', async () => {
    const result = checkSelfModification('code:execute:external');
    assertEqual(result.blocked, true, 'Should be blocked');
    assert(result.reason.includes('hard ceiling'), 'Should mention hard ceiling');
  });

  await test('checkSelfModification allows normal actions', async () => {
    const result = checkSelfModification('git:commit:local');
    assertEqual(result.blocked, false, 'Should not be blocked');
    assertEqual(result.reason, null, 'Should have no reason');
  });

  // ===== Drift Rate Tests =====
  console.log('\n--- Drift Rate Tests ---\n');

  await test('checkDriftRate returns rate info', async () => {
    await cleanup();

    const result = await checkDriftRate(7);

    assert('rate' in result, 'Should have rate');
    assert('expanding' in result, 'Should have expanding');
    assert('contracting' in result, 'Should have contracting');
    assert('warning' in result, 'Should have warning');
  });

  await test('checkDriftRate tracks history', async () => {
    await cleanup();

    await checkDriftRate(7);
    await checkDriftRate(7);
    await checkDriftRate(7);

    const state = getAuditState();
    assertEqual(state.driftHistory.length, 3, 'Should have 3 drift entries');
  });

  // ===== Audit Generation Tests =====
  console.log('\n--- Audit Generation Tests ---\n');

  await test('generateAudit returns complete report', async () => {
    await cleanup();

    const report = await generateAudit({ days: 7 });

    assert('type' in report, 'Should have type');
    assertEqual(report.type, 'ace:trust-audit', 'Should be trust-audit type');
    assert('generatedAt' in report, 'Should have generatedAt');
    assert('period' in report, 'Should have period');
    assert('activity' in report, 'Should have activity');
    assert('precedent' in report, 'Should have precedent');
    assert('drift' in report, 'Should have drift');
    assert('rubberStamp' in report, 'Should have rubberStamp');
    assert('bypass' in report, 'Should have bypass');
    assert('warnings' in report, 'Should have warnings');
  });

  await test('generateAudit includes escalation breakdown', async () => {
    await cleanup();

    recordEscalationResponse({ actionClass: 'test:a', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:b', decision: 'denied' });
    recordEscalationResponse({ actionClass: 'test:c', decision: 'modified' });

    const report = await generateAudit({ days: 7 });

    assertEqual(report.activity.escalations, 3, 'Should have 3 escalations');
    assertEqual(report.activity.escalationBreakdown.approved, 1, 'Should have 1 approved');
    assertEqual(report.activity.escalationBreakdown.denied, 1, 'Should have 1 denied');
    assertEqual(report.activity.escalationBreakdown.modified, 1, 'Should have 1 modified');
  });

  await test('generateAudit adds rubber-stamp warning', async () => {
    await cleanup();

    for (let i = 0; i < 12; i++) {
      recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    }

    const report = await generateAudit({ days: 7 });

    assertEqual(report.rubberStamp.warning, true, 'Should have rubber-stamp warning');
    assert(report.warnings.some(w => w.type === 'rubber-stamp'), 'Warnings should include rubber-stamp');
  });

  // ===== Report Formatting Tests =====
  console.log('\n--- Report Formatting Tests ---\n');

  await test('formatAuditReport produces readable output', async () => {
    await cleanup();

    const report = await generateAudit({ days: 7 });
    const formatted = formatAuditReport(report);

    assert(typeof formatted === 'string', 'Should be a string');
    assert(formatted.includes('Trust Audit'), 'Should include title');
    assert(formatted.includes('Activity Summary'), 'Should include activity section');
  });

  await test('formatAuditReport includes warnings', async () => {
    await cleanup();

    for (let i = 0; i < 12; i++) {
      recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    }

    const report = await generateAudit({ days: 7 });
    const formatted = formatAuditReport(report);

    assert(formatted.includes('Warnings'), 'Should include warnings section');
  });

  // ===== Audit Due Tests =====
  console.log('\n--- Audit Due Tests ---\n');

  await test('isAuditDue returns true initially', async () => {
    await cleanup();

    const result = isAuditDue();
    assertEqual(result.due, true, 'Should be due initially');
    assertEqual(result.daysSinceLast, null, 'Should have no last audit');
  });

  // ===== Escalation History Tests =====
  console.log('\n--- Escalation History Tests ---\n');

  await test('recordEscalationResponse maintains history', async () => {
    await cleanup();

    recordEscalationResponse({ actionClass: 'test:a', decision: 'approved' });
    recordEscalationResponse({ actionClass: 'test:b', decision: 'denied' });

    const state = getAuditState();
    assertEqual(state.escalationHistory.length, 2, 'Should have 2 entries');
    assertEqual(state.escalationHistory[0].actionClass, 'test:a', 'First should be test:a');
    assertEqual(state.escalationHistory[1].actionClass, 'test:b', 'Second should be test:b');
  });

  await test('recordEscalationResponse returns warning status', async () => {
    await cleanup();

    for (let i = 0; i < 9; i++) {
      const result = recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
      assertEqual(result.rubberStampWarning, false, 'Should not warn yet');
    }

    const result = recordEscalationResponse({ actionClass: 'test:action', decision: 'approved' });
    assertEqual(result.rubberStampWarning, true, 'Should warn at threshold');
    assertEqual(result.consecutiveCount, 10, 'Should report count');
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
