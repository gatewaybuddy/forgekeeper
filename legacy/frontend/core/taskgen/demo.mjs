#!/usr/bin/env node
/**
 * TGT Demo Script
 *
 * Demonstrates the Task Generator in action by:
 * 1. Loading ContextLog events
 * 2. Running all registered analyzers
 * 3. Displaying generated task cards
 *
 * Usage:
 *   node frontend/core/taskgen/demo.mjs [--window=60] [--min-confidence=0.7]
 */

import { AnalyzerRegistry } from './analyzer.mjs';
import { loadContextLog } from './contextlog-helpers.mjs';
import { sortTasksByPriority, filterTasks, formatTaskCard } from './taskcard.mjs';
import ContinuationAnalyzer from './analyzers/continuation.mjs';
import ErrorSpikeAnalyzer from './analyzers/error-spike.mjs';
import DocsGapAnalyzer from './analyzers/docs-gap.mjs';
import PerformanceAnalyzer from './analyzers/performance.mjs';
import UXIssueAnalyzer from './analyzers/ux-issue.mjs';

// Parse command line args
const args = process.argv.slice(2);
const windowMinutes = parseInt(args.find(a => a.startsWith('--window='))?.split('=')[1] || '60');
const minConfidence = parseFloat(args.find(a => a.startsWith('--min-confidence='))?.split('=')[1] || '0.7');

console.log('🔧 TGT Demo - Telemetry-Driven Task Generator\n');
console.log(`Configuration:`);
console.log(`  Time window: ${windowMinutes} minutes`);
console.log(`  Min confidence: ${(minConfidence * 100).toFixed(0)}%`);
console.log();

// Main execution
async function main() {
  const logDir = process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log';
  const windowMs = windowMinutes * 60000;

  // Step 1: Load ContextLog events
  console.log(`📁 Loading ContextLog events from ${logDir}...`);
  const contextLog = await loadContextLog(logDir, { windowMs });

  if (contextLog.length === 0) {
    console.log('⚠️  No ContextLog events found. Generating synthetic test data...\n');

    // Generate synthetic data for demo
    const syntheticLog = generateSyntheticData();
    return await runAnalyzers(syntheticLog, windowMs);
  }

  console.log(`✅ Loaded ${contextLog.length} events\n`);

  // Step 2: Run analyzers
  return await runAnalyzers(contextLog, windowMs);
}

async function runAnalyzers(contextLog, windowMs) {
  // Create analyzer registry
  console.log('🔍 Registering analyzers...');
  const registry = new AnalyzerRegistry();

  // Register all analyzers
  registry.register(new ContinuationAnalyzer({ threshold: 0.15 }));
  registry.register(new ErrorSpikeAnalyzer({ multiplier: 3.0 }));
  registry.register(new DocsGapAnalyzer({ minUsageCount: 20 }));
  registry.register(new PerformanceAnalyzer({ threshold: 1.5 }));
  registry.register(new UXIssueAnalyzer({ abortThreshold: 0.20 }));

  console.log();

  // Create analysis context
  const now = Date.now();
  const context = {
    contextLog,
    metrics: {}, // TODO: Load from /metrics endpoint
    timeWindow: {
      from: new Date(now - windowMs).toISOString(),
      to: new Date(now).toISOString(),
      durationMs: windowMs,
    },
  };

  // Step 3: Run all analyzers
  console.log('⚙️  Running analyzers...\n');
  const tasks = await registry.runAll(context);

  // Step 4: Filter by confidence
  const filteredTasks = filterTasks(tasks, { minConfidence });
  const sortedTasks = sortTasksByPriority(filteredTasks);

  console.log();
  console.log('='.repeat(70));
  console.log(`RESULTS: ${sortedTasks.length} tasks generated (${tasks.length - sortedTasks.length} filtered by confidence)`);
  console.log('='.repeat(70));
  console.log();

  if (sortedTasks.length === 0) {
    console.log('✅ No issues detected! System is healthy.');
    return;
  }

  // Step 5: Display tasks
  sortedTasks.forEach((task, index) => {
    console.log(`\n${'-'.repeat(70)}`);
    console.log(`Task ${index + 1} of ${sortedTasks.length}`);
    console.log(`${'-'.repeat(70)}`);
    console.log(formatTaskCard(task));
    console.log();
  });

  // Step 6: Summary statistics
  console.log();
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const bySeverity = {};
  sortedTasks.forEach(t => {
    bySeverity[t.severity] = (bySeverity[t.severity] || 0) + 1;
  });

  console.log('\nBy Severity:');
  Object.entries(bySeverity).forEach(([severity, count]) => {
    const emoji = severity === 'critical' ? '🔴' :
                  severity === 'high' ? '🟠' :
                  severity === 'medium' ? '🟡' : '🟢';
    console.log(`  ${emoji} ${severity.toUpperCase()}: ${count}`);
  });

  const avgPriority = sortedTasks.reduce((sum, t) => sum + t.priority, 0) / sortedTasks.length;
  const avgConfidence = sortedTasks.reduce((sum, t) => sum + t.confidence, 0) / sortedTasks.length;

  console.log(`\nAverage Priority: ${avgPriority.toFixed(1)}`);
  console.log(`Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);

  console.log();
}

/**
 * Generate synthetic ContextLog data for demo purposes
 */
function generateSyntheticData() {
  const now = Date.now();
  const events = [];
  const convIds = Array.from({ length: 15 }, (_, i) => `conv_${i}`);

  // Generate 200 assistant responses with 20% continuations
  for (let i = 0; i < 200; i++) {
    const isContinuation = Math.random() < 0.20;
    const convId = convIds[Math.floor(Math.random() * convIds.length)];
    events.push({
      id: `event_${i}`,
      ts: new Date(now - Math.random() * 3600000).toISOString(),
      actor: 'assistant',
      act: 'assistant_response',
      status: 'ok',
      conv_id: convId,
      elapsed_ms: 1500 + Math.random() * 2000, // 1.5-3.5s base latency
      metadata: {
        finish_reason: isContinuation ? 'length' : 'stop',
        continuation: isContinuation,
      },
    });
  }

  // Generate 50 errors (5x baseline of 10/hour)
  for (let i = 0; i < 50; i++) {
    const convId = convIds[Math.floor(Math.random() * convIds.length)];
    events.push({
      id: `error_${i}`,
      ts: new Date(now - Math.random() * 3600000).toISOString(),
      actor: 'system',
      act: 'tool_call',
      name: i < 30 ? 'read_file' : i < 45 ? 'write_file' : 'run_bash',
      status: 'error',
      conv_id: convId,
      elapsed_ms: 200 + Math.random() * 300, // Fast failures
      result_preview: i < 30 ? 'ENOENT: no such file or directory' :
                      i < 45 ? 'EACCES: permission denied' :
                      'Command not found: git',
    });
  }

  // Generate 100 tool calls for docs gap analyzer
  for (let i = 0; i < 100; i++) {
    const convId = convIds[Math.floor(Math.random() * convIds.length)];
    const toolName = i < 40 ? 'undocumented_tool' :
                     i < 70 ? 'read_file' :
                     i < 85 ? 'write_file' : 'list_directory';
    events.push({
      id: `tool_${i}`,
      ts: new Date(now - Math.random() * 3600000).toISOString(),
      actor: 'system',
      act: 'tool_call',
      name: toolName,
      status: 'ok',
      conv_id: convId,
      elapsed_ms: 100 + Math.random() * 400,
      args_preview: `args for ${toolName}`,
      result_preview: `result from ${toolName}`,
    });
  }

  // Generate some slow events for performance analyzer
  for (let i = 0; i < 30; i++) {
    const convId = convIds[Math.floor(Math.random() * convIds.length)];
    events.push({
      id: `slow_${i}`,
      ts: new Date(now - Math.random() * 3600000).toISOString(),
      actor: 'assistant',
      act: 'assistant_response',
      status: 'ok',
      conv_id: convId,
      elapsed_ms: 4000 + Math.random() * 8000, // 4-12s slow responses
      metadata: {
        finish_reason: 'stop',
      },
    });
  }

  // Generate aborted conversations for UX analyzer
  // Create 5 conversations with only user messages (no assistant completion)
  for (let i = 0; i < 5; i++) {
    const convId = `conv_abort_${i}`;
    events.push({
      id: `abort_user_${i}`,
      ts: new Date(now - Math.random() * 3600000).toISOString(),
      actor: 'user',
      act: 'message',
      status: 'ok',
      conv_id: convId,
      result_preview: 'User question...',
    });
    // No assistant response -> aborted conversation
  }

  return events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

// Run demo
main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
