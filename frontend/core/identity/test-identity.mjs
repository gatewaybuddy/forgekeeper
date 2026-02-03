#!/usr/bin/env node
/**
 * Identity Persistence Layer - CLI Test Script
 *
 * Tests the identity system by:
 * 1. Creating a new agent identity
 * 2. Saving it
 * 3. Reloading it in a simulated new session
 * 4. Verifying continuity
 *
 * Usage:
 *   node frontend/core/identity/test-identity.mjs
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import {
  createIdentityState,
  createGoal,
  validateIdentityState,
  getIdentitySummary,
  detectIdentityIssues,
} from './identity-state.mjs';

import {
  createIdentityPersistence,
  EVENT_TYPES,
} from './identity-persistence.mjs';

import {
  generateContinuityContext,
  generateWhoAmIResponse,
  detectIdentityDrift,
} from './identity-continuity.mjs';

import { createGoalManager } from './goal-manager.mjs';
import { createScoutMonitor } from './scout-monitor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.join(__dirname, '../../../.forgekeeper/identity-test');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(` ${title}`, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function logSuccess(message) {
  log(`  ${message}`, 'green');
}

function logError(message) {
  log(`  ${message}`, 'red');
}

function logInfo(message) {
  log(`  ${message}`, 'dim');
}

async function cleanup() {
  try {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  await cleanup();

  logSection('Identity Persistence Layer - Test Suite');

  // Test 1: Create Identity State
  logSection('Test 1: Create Identity State');
  try {
    const identity = createIdentityState({
      name: 'TestAgent',
      purpose: 'Testing the identity persistence layer',
      values: ['accuracy', 'helpfulness', 'transparency'],
      capabilities: ['code_review', 'testing', 'documentation'],
      limitations: ['limited_context_window'],
    });

    const validation = validateIdentityState(identity);
    if (validation.valid) {
      logSuccess('Identity state created and validated');
      logInfo(`Agent ID: ${identity.agent_id}`);
      logInfo(`Name: ${identity.name}`);
      logInfo(`Values: ${identity.values.join(', ')}`);
      passed++;
    } else {
      logError(`Validation failed: ${validation.errors.join(', ')}`);
      failed++;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 2: Persistence Store - Create and Save
  logSection('Test 2: Persistence Store - Create and Save');
  let persistence;
  let agentId;
  try {
    persistence = createIdentityPersistence(TEST_ROOT);
    await persistence.initialize();

    const identity = await persistence.createIdentity({
      name: 'PersistentAgent',
      purpose: 'Testing persistence across sessions',
      values: ['reliability', 'efficiency', 'learning'],
      capabilities: ['task_execution', 'self_reflection'],
      active_goals: [
        createGoal({
          description: 'Complete the identity system',
          success_criteria: ['All tests pass', 'Documentation complete'],
          priority: 'high',
          provenance_who: 'user',
          provenance_why: 'Core feature implementation',
        }),
      ],
    });

    agentId = identity.agent_id;
    logSuccess('Identity created and persisted');
    logInfo(`Agent ID: ${agentId}`);
    logInfo(`Session count: ${identity.session_count}`);
    passed++;
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 3: Load Identity from Storage
  logSection('Test 3: Load Identity from Storage');
  try {
    // Clear cache to simulate fresh load
    persistence.clearCache();

    const loaded = await persistence.loadIdentity(agentId);
    if (loaded && loaded.name === 'PersistentAgent') {
      logSuccess('Identity loaded successfully');
      logInfo(`Name: ${loaded.name}`);
      logInfo(`Purpose: ${loaded.purpose}`);
      logInfo(`Active goals: ${loaded.active_goals.length}`);
      passed++;
    } else {
      logError('Failed to load identity or data mismatch');
      failed++;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 4: Session Management
  logSection('Test 4: Session Management');
  try {
    const beforeSession = await persistence.loadIdentity(agentId);
    const sessionCountBefore = beforeSession.session_count;

    await persistence.startSession(agentId);
    const afterStart = await persistence.loadIdentity(agentId);

    if (afterStart.session_count === sessionCountBefore + 1) {
      logSuccess('Session started - count incremented');
      logInfo(`Session count: ${afterStart.session_count}`);

      await persistence.endSession(agentId, {
        learning_edges: ['identity_persistence'],
      });

      const afterEnd = await persistence.loadIdentity(agentId);
      if (afterEnd.context_windows_survived > beforeSession.context_windows_survived) {
        logSuccess('Session ended - context windows survived incremented');
        logInfo(`Context windows survived: ${afterEnd.context_windows_survived}`);
        logInfo(`Learning edges: ${afterEnd.learning_edges.join(', ')}`);
        passed++;
      } else {
        logError('Context windows not incremented');
        failed++;
      }
    } else {
      logError('Session count not incremented');
      failed++;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 5: Goal Manager
  logSection('Test 5: Goal Manager');
  try {
    const goalManager = createGoalManager(persistence);

    // Add a goal (using forceAdd to demonstrate override of alignment check)
    const { goal, alignment } = await goalManager.addGoal(agentId, {
      description: 'Learn to improve test coverage efficiently',
      success_criteria: ['Coverage above 80%', 'Tests run reliably'],
      priority: 'medium',
      provenance_who: 'system',
      provenance_why: 'Quality improvement through learning',
    }, { forceAdd: true });

    logSuccess('Goal added successfully');
    logInfo(`Goal ID: ${goal.id}`);
    logInfo(`Alignment score: ${alignment?.alignment_score?.toFixed(2) || 'N/A'}`);

    // Update progress
    await goalManager.updateProgress(agentId, goal.id, 50);
    logSuccess('Goal progress updated to 50%');

    // Complete the goal
    await goalManager.completeGoal(agentId, goal.id, {
      summary: 'Achieved 85% coverage',
    });
    logSuccess('Goal completed');

    const finalIdentity = await persistence.loadIdentity(agentId);
    const completedGoal = finalIdentity.completed_goals.find(g => g.id === goal.id);
    if (completedGoal && completedGoal.status === 'completed') {
      logSuccess('Goal moved to completed list');
      passed++;
    } else {
      logError('Goal not properly completed');
      failed++;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 6: Scout Monitor
  logSection('Test 6: Scout Monitor');
  try {
    const scout = createScoutMonitor({
      challengeThreshold: 0.7,
      groupthinkWindow: 5,
    });

    await scout.initialize();

    // Record some observations
    await scout.observe(agentId, 'decision', 'Chose to use TypeScript', {
      assumptions: {
        primary_optimization: 'type_safety',
        assumed_constraints: ['existing_codebase'],
        tradeoffs_accepted: ['compilation_time'],
        confidence: 'high',
        would_reconsider_if: ['performance_critical'],
      },
    });

    await scout.observe(agentId, 'action', 'Ran test suite', {});

    // Check for groupthink (should not trigger with only 2 observations)
    const groupthinkChallenge = scout.detectGroupthink();
    if (!groupthinkChallenge) {
      logSuccess('No false groupthink detection');
    }

    // Audit identity state
    const identity = await persistence.loadIdentity(agentId);
    const challenges = await scout.auditIdentityState(identity);

    logSuccess(`Scout audit completed: ${challenges.length} challenge(s) generated`);

    // Get statistics
    const stats = scout.getStatistics();
    logInfo(`Total observations: ${stats.total_observations}`);
    logInfo(`Total challenges: ${stats.total_challenges}`);

    passed++;
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 7: Continuity Context Generation
  logSection('Test 7: Continuity Context Generation');
  try {
    const identity = await persistence.loadIdentity(agentId);
    const events = await persistence.readEvents(agentId);

    const continuity = generateContinuityContext(identity, events);

    logSuccess('Continuity context generated');
    logInfo(`Recent changes: ${continuity.recent_changes.length}`);
    logInfo(`Warnings: ${continuity.warnings.length}`);
    logInfo(`Recommendations: ${continuity.recommendations.length}`);

    console.log('\n--- Continuity Prompt Preview ---');
    console.log(continuity.continuity_prompt.slice(0, 500) + '...');

    passed++;
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 8: Who Am I Response
  logSection('Test 8: Who Am I Response');
  try {
    const identity = await persistence.loadIdentity(agentId);
    const whoAmI = generateWhoAmIResponse(identity);

    logSuccess('Who Am I response generated');
    console.log('\n--- Who Am I Preview ---');
    console.log(whoAmI.slice(0, 400) + '...');

    passed++;
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 9: Identity Drift Detection
  logSection('Test 9: Identity Drift Detection');
  try {
    const currentIdentity = await persistence.loadIdentity(agentId);

    // Simulate a modified identity
    const modifiedIdentity = {
      ...currentIdentity,
      name: 'DifferentAgent', // Changed name
      values: ['speed'], // Changed values significantly
    };

    const drift = detectIdentityDrift(currentIdentity, modifiedIdentity);

    if (drift.drifted) {
      logSuccess('Identity drift correctly detected');
      logInfo(`Drift score: ${drift.driftScore}`);
      logInfo(`Details: ${drift.details.join('; ')}`);
      passed++;
    } else {
      logError('Failed to detect obvious identity drift');
      failed++;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Test 10: Event Log Statistics
  logSection('Test 10: Event Log Statistics');
  try {
    const stats = await persistence.getStatistics(agentId);

    logSuccess('Statistics retrieved');
    logInfo(`Total events: ${stats.total_events}`);
    logInfo(`Snapshots: ${stats.snapshot_count}`);
    logInfo(`Events since last snapshot: ${stats.events_since_last_snapshot}`);
    logInfo(`Event types: ${Object.keys(stats.event_types).join(', ')}`);

    passed++;
  } catch (error) {
    logError(`Error: ${error.message}`);
    failed++;
  }

  // Summary
  logSection('Test Summary');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`  Total:  ${passed + failed}`);

  // Cleanup
  await cleanup();
  logInfo('\nTest directory cleaned up');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
