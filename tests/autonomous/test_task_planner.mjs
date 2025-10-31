/**
 * Task Planner Tests
 * [T400] Tests for intelligent task planning module
 */

import { createTaskPlanner } from '../../frontend/core/agent/task-planner.mjs';
import assert from 'node:assert';

// Mock LLM client for testing
function createMockLLM(mockResponse) {
  return {
    chat: async (params) => {
      if (mockResponse === 'THROW_ERROR') {
        throw new Error('Mock LLM error');
      }
      if (mockResponse === 'TIMEOUT') {
        await new Promise(r => setTimeout(r, 5000)); // Longer than timeout
      }
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(mockResponse),
            },
          },
        ],
      };
    },
  };
}

// Test context
function createTestContext() {
  return {
    taskGoal: 'Clone and review repository',
    availableTools: [
      { name: 'run_bash', description: 'Run bash commands' },
      { name: 'read_file', description: 'Read file contents' },
      { name: 'read_dir', description: 'List directory contents' },
      { name: 'write_file', description: 'Write to file' },
      { name: 'get_time', description: 'Get current time' },
    ],
    cwd: '.forgekeeper/playground',
    iteration: 1,
    previousActions: [],
    recentFailures: [],
  };
}

console.log('🧪 Testing Task Planner\n');

// ===== Test 1: Basic Instruction Generation =====
console.log('=== Test 1: Basic Instruction Generation ===');
try {
  const mockResponse = {
    approach: 'Use gh to clone the repository',
    prerequisites: ['gh command available'],
    steps: [
      {
        step_number: 1,
        description: 'Check gh availability',
        tool: 'run_bash',
        args: { script: 'gh --version' },
        expected_outcome: 'Version displayed',
        error_handling: 'Fall back to git',
        confidence: 0.95,
      },
      {
        step_number: 2,
        description: 'Clone repository',
        tool: 'run_bash',
        args: { script: 'gh repo clone gatewaybuddy/forgekeeper' },
        expected_outcome: 'Repository cloned',
        error_handling: 'Try git clone',
        confidence: 0.90,
      },
    ],
    verification: {
      check_command: 'test -d forgekeeper',
      success_criteria: 'Directory exists',
    },
    alternatives: [],
  };

  const mockLLM = createMockLLM(mockResponse);
  const planner = createTaskPlanner(mockLLM, 'test-model');

  const plan = await planner.generateInstructions(
    'Clone repository from https://github.com/gatewaybuddy/forgekeeper',
    createTestContext()
  );

  assert.ok(plan.id, 'Plan should have ID');
  assert.ok(plan.timestamp, 'Plan should have timestamp');
  assert.strictEqual(plan.steps.length, 2, 'Should have 2 steps');
  assert.strictEqual(plan.steps[0].tool, 'run_bash', 'Step 1 should use run_bash');
  assert.strictEqual(plan.steps[1].tool, 'run_bash', 'Step 2 should use run_bash');
  assert.ok(plan.verification, 'Should have verification');
  assert.strictEqual(plan.fallbackUsed, false, 'Should not use fallback');
  assert.ok(plan.overallConfidence > 0.8, 'Should have high confidence');
  assert.ok(plan.planningTimeMs >= 0, 'Should track planning time');

  console.log('✓ Plan generated with correct structure');
  console.log(`✓ Overall confidence: ${(plan.overallConfidence * 100).toFixed(0)}%`);
  console.log(`✓ Planning time: ${plan.planningTimeMs}ms`);
  console.log(`✓ Steps: ${plan.steps.length}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 2: Tool Name Validation and Mapping =====
console.log('\n=== Test 2: Tool Name Validation and Mapping ===');
try {
  const mockResponse = {
    approach: 'Test invalid tool names',
    prerequisites: [],
    steps: [
      {
        step_number: 1,
        description: 'Use invalid tool name',
        tool: 'bash', // Invalid - should be mapped to run_bash
        args: { script: 'echo test' },
        expected_outcome: 'Test output',
        error_handling: 'Retry',
        confidence: 0.8,
      },
      {
        step_number: 2,
        description: 'Another invalid tool',
        tool: 'shell', // Invalid - should be mapped to run_bash
        args: { script: 'ls' },
        expected_outcome: 'List files',
        error_handling: 'Check path',
        confidence: 0.7,
      },
      {
        step_number: 3,
        description: 'Valid tool',
        tool: 'read_file', // Valid
        args: { path: 'test.txt' },
        expected_outcome: 'File contents',
        error_handling: 'Check file exists',
        confidence: 0.9,
      },
    ],
    verification: null,
    alternatives: [],
  };

  const mockLLM = createMockLLM(mockResponse);
  const planner = createTaskPlanner(mockLLM, 'test-model');

  const plan = await planner.generateInstructions(
    'Test tool validation',
    createTestContext()
  );

  assert.strictEqual(plan.steps[0].tool, 'run_bash', 'bash should be mapped to run_bash');
  assert.strictEqual(plan.steps[1].tool, 'run_bash', 'shell should be mapped to run_bash');
  assert.strictEqual(plan.steps[2].tool, 'read_file', 'read_file should remain unchanged');

  console.log('✓ Tool name mapping works correctly');
  console.log(`✓ Mapped: bash → ${plan.steps[0].tool}`);
  console.log(`✓ Mapped: shell → ${plan.steps[1].tool}`);
  console.log(`✓ Valid tool preserved: ${plan.steps[2].tool}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 3: Fallback Behavior =====
console.log('\n=== Test 3: Fallback Behavior on LLM Failure ===');
try {
  const mockLLM = createMockLLM('THROW_ERROR'); // Will throw error
  const planner = createTaskPlanner(mockLLM, 'test-model', { enableFallback: true });

  const plan = await planner.generateInstructions(
    'Clone repository from https://github.com/gatewaybuddy/forgekeeper',
    createTestContext()
  );

  assert.ok(plan.fallbackUsed, 'Should use fallback plan');
  assert.ok(plan.steps.length > 0, 'Fallback should have steps');
  assert.ok(plan.overallConfidence >= 0, 'Should have some confidence');

  console.log('✓ Fallback plan generated when LLM fails');
  console.log(`✓ Fallback used: ${plan.fallbackUsed}`);
  console.log(`✓ Fallback steps: ${plan.steps.length}`);
  console.log(`✓ Fallback confidence: ${(plan.overallConfidence * 100).toFixed(0)}%`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 4: Timeout Handling =====
console.log('\n=== Test 4: Timeout Handling ===');
try {
  const mockLLM = createMockLLM('TIMEOUT'); // Will timeout
  const planner = createTaskPlanner(mockLLM, 'test-model', {
    enableFallback: true,
    timeout: 100, // Very short timeout
  });

  const plan = await planner.generateInstructions(
    'Some task',
    createTestContext()
  );

  assert.ok(plan.fallbackUsed, 'Should fallback on timeout');
  assert.ok(plan.planningTimeMs >= 100, 'Should track actual time before fallback');

  console.log('✓ Timeout handled gracefully');
  console.log(`✓ Fallback triggered: ${plan.fallbackUsed}`);
  console.log(`✓ Planning time before timeout: ${plan.planningTimeMs}ms`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 5: Confidence Calculation =====
console.log('\n=== Test 5: Confidence Calculation ===');
try {
  const mockResponse = {
    approach: 'Test confidence',
    prerequisites: [],
    steps: [
      {
        step_number: 1,
        description: 'High confidence step',
        tool: 'run_bash',
        args: { script: 'echo test' },
        expected_outcome: 'Output',
        error_handling: 'Retry',
        confidence: 0.95,
      },
      {
        step_number: 2,
        description: 'Medium confidence step',
        tool: 'run_bash',
        args: { script: 'complex command' },
        expected_outcome: 'Result',
        error_handling: 'Fallback',
        confidence: 0.60,
      },
      {
        step_number: 3,
        description: 'Low confidence step',
        tool: 'run_bash',
        args: { script: 'risky operation' },
        expected_outcome: 'Maybe works',
        error_handling: 'Handle error',
        confidence: 0.40,
      },
    ],
    verification: null,
    alternatives: [],
  };

  const mockLLM = createMockLLM(mockResponse);
  const planner = createTaskPlanner(mockLLM, 'test-model');

  const plan = await planner.generateInstructions('Test task', createTestContext());

  const expectedAvg = (0.95 + 0.60 + 0.40) / 3;
  const tolerance = 0.01;

  assert.ok(
    Math.abs(plan.overallConfidence - expectedAvg) < tolerance,
    `Overall confidence should be average of step confidences (expected ${expectedAvg.toFixed(2)}, got ${plan.overallConfidence.toFixed(2)})`
  );

  console.log('✓ Confidence calculated correctly');
  console.log(`✓ Step confidences: 0.95, 0.60, 0.40`);
  console.log(`✓ Overall confidence: ${plan.overallConfidence.toFixed(2)}`);
  console.log(`✓ Expected average: ${expectedAvg.toFixed(2)}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 6: Prerequisites and Verification =====
console.log('\n=== Test 6: Prerequisites and Verification ===');
try {
  const mockResponse = {
    approach: 'Complete plan with prerequisites',
    prerequisites: ['gh command available', 'internet connection'],
    steps: [
      {
        step_number: 1,
        description: 'Main step',
        tool: 'run_bash',
        args: { script: 'gh repo clone test/repo' },
        expected_outcome: 'Cloned',
        error_handling: 'Fallback',
        confidence: 0.8,
      },
    ],
    verification: {
      check_command: 'test -d repo',
      success_criteria: 'Directory created',
    },
    alternatives: [
      {
        approach: 'Use git instead',
        when_to_use: 'If gh not available',
        confidence: 0.7,
      },
    ],
  };

  const mockLLM = createMockLLM(mockResponse);
  const planner = createTaskPlanner(mockLLM, 'test-model');

  const plan = await planner.generateInstructions('Clone task', createTestContext());

  assert.strictEqual(plan.prerequisites.length, 2, 'Should have prerequisites');
  assert.ok(plan.prerequisites.includes('gh command available'), 'Should include gh prerequisite');
  assert.ok(plan.verification, 'Should have verification');
  assert.strictEqual(plan.verification.check_command, 'test -d repo', 'Should have check command');
  assert.strictEqual(plan.alternatives.length, 1, 'Should have alternatives');

  console.log('✓ Prerequisites captured');
  console.log(`✓ Prerequisites: ${plan.prerequisites.join(', ')}`);
  console.log('✓ Verification included');
  console.log(`✓ Verification: ${plan.verification.check_command}`);
  console.log('✓ Alternatives provided');
  console.log(`✓ Alternative: ${plan.alternatives[0].approach}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 7: Context Integration (Recent Failures) =====
console.log('\n=== Test 7: Context Integration with Recent Failures ===');
try {
  const contextWithFailures = {
    ...createTestContext(),
    recentFailures: [
      {
        tool: 'run_bash',
        error: 'Authentication failed',
        diagnosis: {
          rootCause: {
            description: 'Git clone failed due to missing credentials',
          },
        },
      },
    ],
  };

  const mockResponse = {
    approach: 'Avoid previous failure',
    prerequisites: [],
    steps: [
      {
        step_number: 1,
        description: 'Use gh to avoid auth issues',
        tool: 'run_bash',
        args: { script: 'gh repo clone test/repo' },
        expected_outcome: 'Success',
        error_handling: 'Check auth',
        confidence: 0.85,
      },
    ],
    verification: null,
    alternatives: [],
  };

  const mockLLM = createMockLLM(mockResponse);
  const planner = createTaskPlanner(mockLLM, 'test-model');

  const plan = await planner.generateInstructions('Clone with auth', contextWithFailures);

  assert.ok(plan.steps.length > 0, 'Should generate plan despite failures');
  // The prompt would include recent failures, helping LLM avoid them

  console.log('✓ Plan generated with failure context');
  console.log(`✓ Recent failures considered: ${contextWithFailures.recentFailures.length}`);
  console.log(`✓ Plan steps: ${plan.steps.length}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Summary =====
console.log('\n' + '='.repeat(50));
console.log('✅ All Task Planner Tests Passed!');
console.log('='.repeat(50));
console.log('\nTest Coverage:');
console.log('  ✓ Basic instruction generation');
console.log('  ✓ Tool name validation and mapping');
console.log('  ✓ Fallback behavior on errors');
console.log('  ✓ Timeout handling');
console.log('  ✓ Confidence calculation');
console.log('  ✓ Prerequisites and verification');
console.log('  ✓ Context integration with failures');
console.log('\n✅ Task Planner (T400) implementation validated!');
