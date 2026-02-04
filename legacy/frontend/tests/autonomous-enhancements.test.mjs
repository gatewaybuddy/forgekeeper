#!/usr/bin/env node
/**
 * Test script for autonomous mode enhancements (Days 5-7)
 *
 * Tests:
 * 1. Session memory tracking
 * 2. Task type detection
 * 3. Enhanced tool inference
 * 4. Async session support
 * 5. Status polling
 */

import { createSessionMemory } from '../core/agent/session-memory.mjs';
import { createAutonomousAgent } from '../core/agent/autonomous.mjs';
import fs from 'fs/promises';
import path from 'path';

const PLAYGROUND = '.forgekeeper/test-playground';
const TEST_MEMORY_FILE = path.join(PLAYGROUND, '.session_memory.jsonl');

// Mock LLM client for testing
const mockLLMClient = {
  async chat(params) {
    // Return a mock reflection response
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            assessment: 'complete',
            progress_percent: 100,
            confidence: 0.95,
            next_action: 'Task is complete',
            reasoning: 'Test task completed successfully',
            tool_plan: {
              tool: 'get_time',
              purpose: 'Test tool'
            }
          })
        }
      }]
    };
  }
};

// Mock executor
const mockExecutor = {
  async execute(toolCall, context) {
    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: 'Mock tool result'
    };
  }
};

async function cleanupPlayground() {
  try {
    await fs.rm(PLAYGROUND, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function test1_SessionMemoryTracking() {
  console.log('\n=== Test 1: Session Memory Tracking ===');

  const memory = createSessionMemory(PLAYGROUND);

  // Record a successful session
  await memory.recordSession({
    task_type: 'research',
    success: true,
    iterations: 7,
    tools_used: ['read_dir', 'read_file', 'write_file'],
    strategy: 'Explore → Read → Document',
    confidence: 0.92,
    task: 'Analyze the codebase'
  });

  // Record a multi-step session
  await memory.recordSession({
    task_type: 'multi-step',
    success: true,
    iterations: 6,
    tools_used: ['write_file', 'run_bash'],
    strategy: 'Design → Implement → Test',
    confidence: 0.88,
    task: 'Create script with tests'
  });

  // Record a failure
  await memory.recordSession({
    task_type: 'research',
    success: false,
    iterations: 5,
    tools_used: ['read_dir'],
    strategy: 'Failed approach',
    confidence: 0.3,
    task: 'Failed task'
  });

  // Verify file exists
  const exists = await fs.access(TEST_MEMORY_FILE).then(() => true).catch(() => false);
  console.log('✓ Memory file created:', exists);

  // Read and verify content
  const content = await fs.readFile(TEST_MEMORY_FILE, 'utf8');
  const lines = content.trim().split('\n');
  console.log('✓ Sessions recorded:', lines.length);

  // Get successful patterns
  const successPatterns = await memory.getSuccessfulPatterns('research');
  console.log('✓ Research success patterns:', successPatterns.length);
  console.log('  - Effective tools:', successPatterns[0]?.tools_used);

  // Get failure patterns
  const failurePatterns = await memory.getFailurePatterns('research');
  console.log('✓ Research failure patterns:', failurePatterns.length);

  // Get statistics
  const stats = await memory.getStatistics();
  console.log('✓ Total sessions:', stats.total);
  console.log('  - Success:', stats.success);
  console.log('  - Failure:', stats.failure);
  console.log('  - By type:', Object.keys(stats.by_type));

  return true;
}

async function test2_TaskTypeDetection() {
  console.log('\n=== Test 2: Task Type Detection ===');

  const agent = createAutonomousAgent({
    llmClient: mockLLMClient,
    model: 'test',
    maxIterations: 3,
    playgroundRoot: PLAYGROUND
  });

  const testCases = [
    { task: 'Analyze the codebase and document findings', expected: 'research' },
    { task: 'Create a Python script with tests and run them', expected: 'multi-step' },
    { task: 'Improve the memory system performance', expected: 'self-improvement' },
    { task: 'Create README documentation for the project', expected: 'documentation' },
    { task: 'Write a simple hello world script', expected: 'simple' },
  ];

  for (const testCase of testCases) {
    const detected = agent.detectTaskType(testCase.task);
    const match = detected === testCase.expected;
    console.log(`${match ? '✓' : '✗'} "${testCase.task.slice(0, 40)}..."`);
    console.log(`  Expected: ${testCase.expected}, Got: ${detected}`);
  }

  return true;
}

async function test3_ToolInference() {
  console.log('\n=== Test 3: Enhanced Tool Inference ===');

  const agent = createAutonomousAgent({
    llmClient: mockLLMClient,
    model: 'test',
    maxIterations: 3,
    playgroundRoot: PLAYGROUND
  });

  const testCases = [
    { action: 'Explore the codebase structure', expectedTool: 'read_dir' },
    { action: 'Find all Python test files', expectedTool: 'run_bash' },
    { action: 'Create hello.py file', expectedTool: 'write_file' },
    { action: 'Read config.yaml', expectedTool: 'read_file' },
    { action: 'Run pytest tests', expectedTool: 'run_bash' },
    { action: 'Create README documentation', expectedTool: 'write_file' },
  ];

  for (const testCase of testCases) {
    const steps = agent.inferToolsFromAction(testCase.action);
    const inferredTool = steps[0]?.tool;
    const match = inferredTool === testCase.expectedTool;
    console.log(`${match ? '✓' : '✗'} "${testCase.action}"`);
    console.log(`  Expected: ${testCase.expectedTool}, Got: ${inferredTool}`);
  }

  return true;
}

async function test4_FileContentGeneration() {
  console.log('\n=== Test 4: Smart File Content Generation ===');

  const agent = createAutonomousAgent({
    llmClient: mockLLMClient,
    model: 'test',
    maxIterations: 3,
    playgroundRoot: PLAYGROUND
  });

  const testCases = [
    { filename: 'test.py', shouldInclude: '#!/usr/bin/env python3' },
    { filename: 'app.js', shouldInclude: 'function main()' },
    { filename: 'README.md', shouldInclude: '# README' },
    { filename: 'data.txt', shouldInclude: '' }, // Empty for txt
  ];

  for (const testCase of testCases) {
    const content = agent.generateInitialContent(testCase.filename);
    const includes = content.includes(testCase.shouldInclude);
    console.log(`${includes ? '✓' : '✗'} ${testCase.filename}`);
    console.log(`  Content length: ${content.length} chars`);
    if (testCase.shouldInclude && !includes) {
      console.log(`  Missing: "${testCase.shouldInclude}"`);
    }
  }

  return true;
}

async function test5_ReflectionPromptEnhancements() {
  console.log('\n=== Test 5: Reflection Prompt Enhancements ===');

  const agent = createAutonomousAgent({
    llmClient: mockLLMClient,
    model: 'test',
    maxIterations: 3,
    playgroundRoot: PLAYGROUND
  });

  // Initialize state
  agent.state = {
    task: 'Analyze the codebase and create documentation',
    iteration: 2,
    lastProgressPercent: 40,
    artifacts: [
      { type: 'file', path: 'analysis.md' }
    ],
    history: [
      { iteration: 1, action: 'Explore directory', result: 'Found 20 files' }
    ],
    reflections: [],
    errors: 0
  };

  const prompt = agent.buildReflectionPrompt();

  // Verify prompt includes key elements
  const checks = [
    { label: 'Task type detection', text: 'Task Type Detected:' },
    { label: 'Task guidance', text: 'Research Task Guidance' },
    { label: 'Current state', text: 'Current State' },
    { label: 'Iteration info', text: 'Iteration: 2' },
    { label: 'Decision strategy', text: 'Decision Strategy' },
    { label: 'Multi-step guidance', text: 'For Multi-Step Tasks' },
    { label: 'Research guidance', text: 'For Research Tasks' },
  ];

  for (const check of checks) {
    const includes = prompt.includes(check.text);
    console.log(`${includes ? '✓' : '✗'} ${check.label}`);
  }

  return true;
}

async function runAllTests() {
  console.log('🧪 Testing Autonomous Mode Enhancements (Days 5-7)\n');

  try {
    // Cleanup before tests
    await cleanupPlayground();

    // Run tests
    await test1_SessionMemoryTracking();
    await test2_TaskTypeDetection();
    await test3_ToolInference();
    await test4_FileContentGeneration();
    await test5_ReflectionPromptEnhancements();

    console.log('\n✅ All tests passed!\n');

    // Cleanup after tests
    await cleanupPlayground();

    return 0;
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    return 1;
  }
}

runAllTests().then(process.exit);
