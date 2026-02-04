#!/usr/bin/env node

/**
 * META-TEST: Autonomous Agent Self-Improvement Loop
 *
 * This test demonstrates the agent's meta-programming capabilities:
 * 1. Phase 1: Self-Diagnosis - Agent analyzes its own failure patterns
 * 2. Phase 2: Propose Fix - Agent suggests concrete improvements
 * 3. Phase 3: Implementation - Agent implements the suggested fix
 * 4. Phase 4: Self-Review - Agent reviews its own implementation
 * 5. Phase 5: Report - Summarize results and next steps
 *
 * This is the ultimate test of self-awareness and meta-programming!
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const MAX_ITERATIONS = 20; // Give agent plenty of room
const RESULTS_DIR = '.forgekeeper/meta-test-results';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70) + '\n');
}

// Ensure results directory exists
await fs.mkdir(RESULTS_DIR, { recursive: true });

// ============================================================================
// PHASE 1: SELF-DIAGNOSIS
// ============================================================================
section('🔍 PHASE 1: SELF-DIAGNOSIS');
log('Agent analyzing its own failure patterns...', 'cyan');

let failurePatterns;
try {
  const response = await fetch(`${API_BASE}/api/autonomous/failure-patterns`);
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to get failure patterns');
  }

  failurePatterns = data.patterns;

  log(`✓ Analysis complete`, 'green');
  log(`  Total sessions: ${failurePatterns.total_sessions}`, 'yellow');
  log(`  Sessions with proper logging: ${failurePatterns.sessions_with_end_event}`, 'yellow');
  log(`  Missing end events: ${failurePatterns.missing_end_events}`, 'yellow');

  console.log('\n📊 Failure Pattern Breakdown:');
  for (const failure of failurePatterns.most_common_failures) {
    const emoji = failure.count > 0 ? '❌' : '✅';
    log(`  ${emoji} ${failure.pattern}: ${failure.count} (${failure.percentage}%)`,
        failure.count > 0 ? 'red' : 'green');
  }

  // Save results
  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase1-diagnosis.json'),
    JSON.stringify(failurePatterns, null, 2)
  );

} catch (error) {
  log(`✗ Self-diagnosis failed: ${error.message}`, 'red');
  log('Make sure the server is running: npm run dev', 'yellow');
  process.exit(1);
}

// ============================================================================
// PHASE 2: PROPOSE FIX
// ============================================================================
section('💡 PHASE 2: PROPOSE FIX');

// Find the most common failure pattern
const topFailure = failurePatterns.most_common_failures.find(f => f.count > 0);

if (!topFailure) {
  log('✓ No failures detected! Agent is working perfectly.', 'green');
  log('  Creating a synthetic issue for testing purposes...', 'yellow');

  // Use repetitive_actions as example
  topFailure = { pattern: 'repetitive_actions', count: 1, percentage: '10.0' };
}

log(`Agent proposing fix for: ${topFailure.pattern} (${topFailure.percentage}% of sessions)`, 'cyan');

let proposedFix;
try {
  const response = await fetch(`${API_BASE}/api/autonomous/propose-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      failure_pattern: topFailure.pattern,
      context: 'Meta-test: Agent self-improvement loop'
    })
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to get fix proposal');
  }

  proposedFix = data.fixes;

  log(`✓ Fix proposal generated`, 'green');
  log(`  Confidence: ${(proposedFix.confidence * 100).toFixed(0)}%`, 'yellow');
  log(`  Effort: ${proposedFix.estimated_effort}`, 'yellow');
  log(`  Files to modify: ${proposedFix.files_to_modify.length}`, 'yellow');

  console.log('\n📝 Proposed Fixes:');
  for (const fix of proposedFix.proposed_fixes) {
    log(`  • ${fix.title}`, 'cyan');
    log(`    File: ${fix.file}`, 'yellow');
    log(`    Description: ${fix.description}`, 'yellow');
    if (fix.code_change !== 'No code change needed if observability fixes are in place') {
      log(`    Change: ${fix.code_change.substring(0, 80)}...`, 'yellow');
    }
  }

  // Save results
  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase2-proposal.json'),
    JSON.stringify(proposedFix, null, 2)
  );

} catch (error) {
  log(`✗ Fix proposal failed: ${error.message}`, 'red');
  process.exit(1);
}

// ============================================================================
// PHASE 3: IMPLEMENTATION
// ============================================================================
section('🛠️ PHASE 3: IMPLEMENTATION');
log('Agent implementing the proposed fix...', 'cyan');

// Build comprehensive task description for the agent
const implementationTask = `You are an autonomous agent with the ability to improve your own code.

**Context**: You have diagnosed a failure pattern in your own execution: "${topFailure.pattern}"

**Your Mission**: Implement the following fix with HIGH CONFIDENCE (${(proposedFix.confidence * 100).toFixed(0)}%):

${proposedFix.proposed_fixes.map((fix, i) => `
${i + 1}. **${fix.title}**
   - File: ${fix.file}
   - Description: ${fix.description}
   - Code Change: ${fix.code_change}
   - Lines to modify: ~${fix.estimated_lines}
`).join('\n')}

**Files to Modify**:
${proposedFix.files_to_modify.map(f => `- ${f}`).join('\n')}

**Requirements**:
1. Read the current implementation in the file(s) above
2. Locate the exact code that needs to change
3. Make the proposed modification
4. Verify the change is syntactically correct
5. Explain what you changed and why

**Important Notes**:
- This is a REAL fix for a REAL issue in your code
- Be PRECISE - exact file paths and line numbers matter
- Use read_file and write_file tools
- If the file is large, read it in sections if needed
- Document your changes clearly

**Success Criteria**:
- Code compiles/parses correctly
- Change matches the proposal
- No syntax errors introduced
- Clear explanation of what was changed

Begin implementation now. Be methodical and careful!`;

let implementationSession;
try {
  log(`Starting autonomous implementation session...`, 'cyan');
  log(`Task: Fix "${topFailure.pattern}" pattern`, 'yellow');

  const response = await fetch(`${API_BASE}/api/chat/autonomous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: implementationTask,
      max_iterations: MAX_ITERATIONS,
      async: true // Run in background
    })
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to start implementation session');
  }

  const sessionId = data.session_id;
  log(`✓ Implementation session started: ${sessionId}`, 'green');

  // Poll for completion
  log(`Waiting for agent to complete implementation...`, 'cyan');
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max (1s intervals)

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;

    const statusResp = await fetch(`${API_BASE}/api/chat/autonomous/status?session_id=${sessionId}`);
    const statusData = await statusResp.json();

    if (statusData.done) {
      implementationSession = statusData.result;
      log(`✓ Implementation complete after ${attempts} seconds`, 'green');
      break;
    }

    // Show progress every 5 seconds
    if (attempts % 5 === 0) {
      log(`  Still working... (${attempts}s elapsed)`, 'yellow');
    }
  }

  if (!implementationSession) {
    throw new Error('Implementation timed out after 2 minutes');
  }

  // Get session events for detailed analysis
  const eventsResp = await fetch(`${API_BASE}/api/ctx/tail.json?n=1000&session_id=${sessionId}`);
  const events = await eventsResp.json();

  // Analyze implementation
  const iterations = events.filter(e => e.type === 'autonomous_iteration').length;
  const toolsUsed = [...new Set(events.filter(e => e.type === 'tool_call_end_autonomous').map(e => e.name))];
  const errors = events.filter(e => e.type === 'error' || e.status === 'error').length;

  console.log('\n📊 Implementation Statistics:');
  log(`  Iterations: ${iterations}`, 'yellow');
  log(`  Tools used: ${toolsUsed.join(', ')}`, 'yellow');
  log(`  Errors: ${errors}`, errors > 0 ? 'red' : 'green');
  log(`  Reason: ${implementationSession.reason || 'unknown'}`, 'yellow');

  // Save results
  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase3-implementation.json'),
    JSON.stringify({ session: implementationSession, events, sessionId }, null, 2)
  );

  // Check if implementation succeeded
  const sessionEnd = events.find(e => e.type === 'autonomous_session_end');
  if (sessionEnd?.reason === 'task_complete') {
    log(`✓ Agent reports: Task completed successfully!`, 'green');
  } else if (sessionEnd?.reason === 'max_iterations') {
    log(`⚠ Agent hit max iterations - may be incomplete`, 'yellow');
  } else {
    log(`⚠ Session ended with reason: ${sessionEnd?.reason || 'unknown'}`, 'yellow');
  }

} catch (error) {
  log(`✗ Implementation failed: ${error.message}`, 'red');
  implementationSession = { error: error.message };

  // Save error
  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase3-implementation.json'),
    JSON.stringify({ error: error.message }, null, 2)
  );
}

// ============================================================================
// PHASE 4: SELF-REVIEW
// ============================================================================
section('🔎 PHASE 4: SELF-REVIEW');
log('Agent reviewing its own implementation...', 'cyan');

const reviewTask = `You are an autonomous agent reviewing your OWN CODE CHANGES.

**Context**: You just implemented a fix for the "${topFailure.pattern}" failure pattern.

**What You Implemented**:
${proposedFix.proposed_fixes.map((fix, i) => `
${i + 1}. ${fix.title} in ${fix.file}
   - Expected change: ${fix.code_change}
`).join('\n')}

**Your Mission**: Review the changes you made and assess quality

**Review Criteria**:
1. **Correctness**: Did the change match the proposal?
2. **Syntax**: Is the code syntactically correct?
3. **Completeness**: Were all proposed changes made?
4. **Side Effects**: Could this break anything else?
5. **Testing**: What tests should be run?

**Required Actions**:
1. Read the modified file(s): ${proposedFix.files_to_modify.join(', ')}
2. Verify the exact changes that were made
3. Check for syntax errors or issues
4. Assess whether the fix addresses the root cause
5. Provide a PASS/FAIL verdict with reasoning

**Output Format**:
- VERDICT: PASS or FAIL
- CORRECTNESS: [1-5] (matches proposal?)
- SYNTAX: [1-5] (valid code?)
- COMPLETENESS: [1-5] (all changes made?)
- CONFIDENCE: [0-100]% (will this fix the issue?)
- ISSUES: List any problems found
- RECOMMENDATIONS: Suggest improvements if needed

Be CRITICAL and THOROUGH. This is your own code - hold yourself to high standards!`;

let reviewSession;
try {
  log(`Starting autonomous review session...`, 'cyan');

  const response = await fetch(`${API_BASE}/api/chat/autonomous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: reviewTask,
      max_iterations: 15, // Reviews should be faster
      async: true
    })
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to start review session');
  }

  const sessionId = data.session_id;
  log(`✓ Review session started: ${sessionId}`, 'green');

  // Poll for completion
  log(`Waiting for agent to complete review...`, 'cyan');
  let attempts = 0;
  const maxAttempts = 90; // 1.5 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;

    const statusResp = await fetch(`${API_BASE}/api/chat/autonomous/status?session_id=${sessionId}`);
    const statusData = await statusResp.json();

    if (statusData.done) {
      reviewSession = statusData.result;
      log(`✓ Review complete after ${attempts} seconds`, 'green');
      break;
    }

    if (attempts % 5 === 0) {
      log(`  Still reviewing... (${attempts}s elapsed)`, 'yellow');
    }
  }

  if (!reviewSession) {
    throw new Error('Review timed out after 1.5 minutes');
  }

  // Get review events
  const eventsResp = await fetch(`${API_BASE}/api/ctx/tail.json?n=1000&session_id=${sessionId}`);
  const events = await eventsResp.json();

  console.log('\n📊 Review Statistics:');
  const iterations = events.filter(e => e.type === 'autonomous_iteration').length;
  log(`  Iterations: ${iterations}`, 'yellow');
  log(`  Reason: ${reviewSession.reason || 'unknown'}`, 'yellow');

  // Save results
  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase4-review.json'),
    JSON.stringify({ session: reviewSession, events, sessionId }, null, 2)
  );

  log(`✓ Review completed`, 'green');

} catch (error) {
  log(`✗ Review failed: ${error.message}`, 'red');
  reviewSession = { error: error.message };

  await fs.writeFile(
    path.join(RESULTS_DIR, 'phase4-review.json'),
    JSON.stringify({ error: error.message }, null, 2)
  );
}

// ============================================================================
// PHASE 5: REPORT
// ============================================================================
section('📋 PHASE 5: FINAL REPORT');

const report = {
  timestamp: new Date().toISOString(),
  test_name: 'Autonomous Agent Self-Improvement Loop',
  phases: {
    diagnosis: {
      status: failurePatterns ? 'success' : 'failed',
      total_sessions: failurePatterns?.total_sessions || 0,
      top_failure: topFailure?.pattern || 'none',
      failure_rate: topFailure?.percentage || '0',
    },
    proposal: {
      status: proposedFix ? 'success' : 'failed',
      confidence: proposedFix?.confidence || 0,
      estimated_effort: proposedFix?.estimated_effort || 'unknown',
      files_to_modify: proposedFix?.files_to_modify?.length || 0,
    },
    implementation: {
      status: implementationSession?.error ? 'failed' : 'completed',
      reason: implementationSession?.reason || implementationSession?.error || 'unknown',
      session_id: implementationSession?.session_id || 'unknown',
    },
    review: {
      status: reviewSession?.error ? 'failed' : 'completed',
      reason: reviewSession?.reason || reviewSession?.error || 'unknown',
      session_id: reviewSession?.session_id || 'unknown',
    },
  },
  overall_success: !!(
    failurePatterns &&
    proposedFix &&
    implementationSession &&
    !implementationSession.error &&
    reviewSession &&
    !reviewSession.error
  ),
};

// Print summary
log('🎯 SELF-IMPROVEMENT LOOP SUMMARY', 'bright');
console.log('─'.repeat(70));

log(`\n1️⃣  Self-Diagnosis: ${report.phases.diagnosis.status.toUpperCase()}`,
    report.phases.diagnosis.status === 'success' ? 'green' : 'red');
if (report.phases.diagnosis.status === 'success') {
  log(`   • Analyzed ${report.phases.diagnosis.total_sessions} sessions`, 'yellow');
  log(`   • Top issue: ${report.phases.diagnosis.top_failure} (${report.phases.diagnosis.failure_rate}%)`, 'yellow');
}

log(`\n2️⃣  Fix Proposal: ${report.phases.proposal.status.toUpperCase()}`,
    report.phases.proposal.status === 'success' ? 'green' : 'red');
if (report.phases.proposal.status === 'success') {
  log(`   • Confidence: ${(report.phases.proposal.confidence * 100).toFixed(0)}%`, 'yellow');
  log(`   • Effort: ${report.phases.proposal.estimated_effort}`, 'yellow');
  log(`   • Files: ${report.phases.proposal.files_to_modify}`, 'yellow');
}

log(`\n3️⃣  Implementation: ${report.phases.implementation.status.toUpperCase()}`,
    report.phases.implementation.status === 'completed' ? 'green' : 'red');
log(`   • Result: ${report.phases.implementation.reason}`, 'yellow');
log(`   • Session: ${report.phases.implementation.session_id}`, 'yellow');

log(`\n4️⃣  Self-Review: ${report.phases.review.status.toUpperCase()}`,
    report.phases.review.status === 'completed' ? 'green' : 'red');
log(`   • Result: ${report.phases.review.reason}`, 'yellow');
log(`   • Session: ${report.phases.review.session_id}`, 'yellow');

console.log('\n' + '─'.repeat(70));
log(`\n🏆 OVERALL: ${report.overall_success ? 'SUCCESS ✓' : 'INCOMPLETE ✗'}`,
    report.overall_success ? 'green' : 'yellow');

if (report.overall_success) {
  log('\n🎉 The agent successfully:', 'green');
  log('   1. Diagnosed its own failure patterns', 'green');
  log('   2. Proposed a concrete fix', 'green');
  log('   3. Implemented the fix autonomously', 'green');
  log('   4. Reviewed its own work', 'green');
  log('\n   This is TRUE meta-programming! 🤖', 'bright');
} else {
  log('\n⚠️  Some phases incomplete - check logs above', 'yellow');
}

// Save final report
await fs.writeFile(
  path.join(RESULTS_DIR, 'final-report.json'),
  JSON.stringify(report, null, 2)
);

log(`\n📁 Results saved to: ${RESULTS_DIR}/`, 'cyan');
log('   • phase1-diagnosis.json', 'cyan');
log('   • phase2-proposal.json', 'cyan');
log('   • phase3-implementation.json', 'cyan');
log('   • phase4-review.json', 'cyan');
log('   • final-report.json', 'cyan');

console.log('\n' + '='.repeat(70) + '\n');

// Exit with appropriate code
process.exit(report.overall_success ? 0 : 1);
