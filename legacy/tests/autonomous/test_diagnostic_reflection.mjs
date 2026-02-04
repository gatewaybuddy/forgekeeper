/**
 * Test Suite: Diagnostic Reflection
 * [T314] Validates "5 Whys" analysis quality and error classification
 */

import { createDiagnosticReflection } from '../../frontend/core/agent/diagnostic-reflection.mjs';
import { createErrorClassifier, ERROR_CATEGORIES, ERROR_SEVERITY } from '../../frontend/core/agent/error-classifier.mjs';

// Mock LLM client for testing
const mockLLMClient = {
  chat: async ({ messages, response_format }) => {
    // Return mock structured diagnosis
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            why_chain: {
              why1: "Tool execution failed",
              why2: "Binary not found in PATH",
              why3: "Agent assumed availability",
              why4: "No fallback prepared",
              why5: "Missing capability check"
            },
            root_cause: {
              category: "command_not_found",
              description: "Binary not available in environment",
              confidence: 0.95
            },
            can_recover: true,
            alternatives: [
              {
                strategy: "try_alternative",
                tools: ["run_bash"],
                description: "Use curl instead",
                confidence: 0.9,
                estimated_iterations: 2
              }
            ],
            recovery_plan: {
              priority: 1,
              strategy: "try_alternative",
              steps: [],
              fallback_chain: ["ask_user"]
            },
            learning_opportunity: {
              pattern: "git_not_found",
              rule: "Use curl when git unavailable",
              applicable_task_types: ["repository_clone"],
              generalizability: 0.8
            }
          })
        }
      }]
    };
  }
};

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running Diagnostic Reflection Tests\n');
    console.log('='.repeat(60));

    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`✅ ${test.name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        if (error.stack) {
          console.log(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`);
        }
      }
    }

    console.log('='.repeat(60));
    console.log(`\nResults: ${this.passed} passed, ${this.failed} failed\n`);

    return this.failed === 0;
  }
}

// Helper functions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Tests
const runner = new TestRunner();

// ==========================================
// Error Classification Tests
// ==========================================

runner.test('Error Classifier: command_not_found (exit 127)', () => {
  const classifier = createErrorClassifier();

  const context = {
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
      stdout: '',
    },
    toolCall: {
      function: { name: 'run_bash' }
    }
  };

  const classification = classifier.classify(context);

  assertEqual(classification.category, ERROR_CATEGORIES.COMMAND_NOT_FOUND);
  assertEqual(classification.severity, ERROR_SEVERITY.RECOVERABLE);
  assert(classification.confidence >= 0.9, 'Confidence should be high');
});

runner.test('Error Classifier: permission_denied (EACCES)', () => {
  const classifier = createErrorClassifier();

  const context = {
    error: {
      message: 'permission denied',
      code: 'EACCES',
      stderr: 'Permission denied',
    },
    toolCall: {
      function: { name: 'write_file' }
    }
  };

  const classification = classifier.classify(context);

  assertEqual(classification.category, ERROR_CATEGORIES.PERMISSION_DENIED);
  assertEqual(classification.severity, ERROR_SEVERITY.RECOVERABLE);
  assert(classification.confidence >= 0.5, `Confidence should be reasonable (got ${classification.confidence})`);
});

runner.test('Error Classifier: tool_not_found', () => {
  const classifier = createErrorClassifier();

  const context = {
    error: {
      message: 'Unknown tool: repo_browser',
    },
    toolCall: {
      function: { name: 'repo_browser' }
    }
  };

  const classification = classifier.classify(context);

  assertEqual(classification.category, ERROR_CATEGORIES.TOOL_NOT_FOUND);
  // Confidence is based on pattern matching (1 of 3 patterns matched = ~0.33)
  assert(classification.confidence > 0, `Should have non-zero confidence (got ${classification.confidence})`);
});

runner.test('Error Classifier: timeout', () => {
  const classifier = createErrorClassifier();

  const context = {
    error: {
      message: 'Operation timed out',
      code: 'ETIMEDOUT',
    },
    toolCall: {
      function: { name: 'run_bash' }
    }
  };

  const classification = classifier.classify(context);

  assertEqual(classification.category, ERROR_CATEGORIES.TIMEOUT);
  assertEqual(classification.severity, ERROR_SEVERITY.RECOVERABLE);
});

runner.test('Error Classifier: file_not_found (ENOENT)', () => {
  const classifier = createErrorClassifier();

  const context = {
    error: {
      message: 'No such file or directory',
      code: 'ENOENT',
    },
    toolCall: {
      function: { name: 'read_file' }
    }
  };

  const classification = classifier.classify(context);

  assertEqual(classification.category, ERROR_CATEGORIES.FILE_NOT_FOUND);
  assert(classification.confidence >= 0.5, `Confidence should be reasonable (got ${classification.confidence})`);
});

runner.test('Error Classifier: recovery difficulty assessment', () => {
  const classifier = createErrorClassifier();

  const invalidArgs = classifier.classify({
    error: { message: 'Missing required parameter: file' },
    toolCall: { function: { name: 'read_file' } }
  });

  const difficulty = classifier.getRecoveryDifficulty(invalidArgs);
  assertEqual(difficulty, 'easy', 'Invalid args should be easy to recover');
});

// ==========================================
// Diagnostic Reflection Tests
// ==========================================

runner.test('Diagnostic Reflection: creates structured diagnosis', async () => {
  const diagnostic = createDiagnosticReflection(mockLLMClient, 'test-model');

  const context = {
    toolCall: {
      function: {
        name: 'run_bash',
        arguments: { script: 'git clone https://github.com/user/repo' }
      }
    },
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
      stdout: '',
    },
    iteration: 2,
    previousActions: [],
    availableTools: ['run_bash', 'read_dir', 'read_file'],
    workspaceState: { files: [], directories: [] },
    taskGoal: 'Clone repository'
  };

  const diagnosis = await diagnostic.runDiagnosticReflection(context);

  assert(diagnosis, 'Diagnosis should be returned');
  assert(diagnosis.id, 'Diagnosis should have ID');
  assert(diagnosis.whyChain, 'Diagnosis should have why-chain');
  assert(diagnosis.rootCause, 'Diagnosis should have root cause');
  assert(diagnosis.alternatives, 'Diagnosis should have alternatives');
  assert(Array.isArray(diagnosis.alternatives), 'Alternatives should be array');
  assert(diagnosis.alternatives.length > 0, 'Should have at least one alternative');
});

runner.test('Diagnostic Reflection: fallback works without LLM', async () => {
  // Mock LLM that fails
  const failingLLM = {
    chat: async () => {
      throw new Error('LLM unavailable');
    }
  };

  const diagnostic = createDiagnosticReflection(failingLLM, 'test-model');

  const context = {
    toolCall: {
      function: {
        name: 'run_bash',
        arguments: { script: 'git clone https://github.com/user/repo' }
      }
    },
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
    },
    iteration: 1,
    previousActions: [],
    availableTools: ['run_bash'],
    workspaceState: { files: [], directories: [] },
    taskGoal: 'Clone repository'
  };

  const diagnosis = await diagnostic.runDiagnosticReflection(context);

  // Should still return a diagnosis (fallback)
  assert(diagnosis, 'Fallback diagnosis should be returned');
  assert(diagnosis.rootCause, 'Fallback should have root cause');
  assert(diagnosis.rootCause.category === ERROR_CATEGORIES.COMMAND_NOT_FOUND);
});

runner.test('Diagnostic Reflection: includes error details', async () => {
  const diagnostic = createDiagnosticReflection(mockLLMClient, 'test-model');

  const context = {
    toolCall: {
      function: { name: 'run_bash', arguments: { script: 'ls /nonexistent' } }
    },
    error: {
      message: 'No such file or directory',
      code: 2,
      stderr: 'ls: /nonexistent: No such file or directory',
      stdout: '',
    },
    iteration: 1,
    previousActions: [],
    availableTools: ['run_bash', 'read_dir'],
    workspaceState: { files: [], directories: [] },
    taskGoal: 'List files'
  };

  const diagnosis = await diagnostic.runDiagnosticReflection(context);

  assert(diagnosis.rootCause.confidence > 0, 'Should have confidence score');
  assert(diagnosis.errorClassification, 'Should have error classification');
});

// ==========================================
// Integration Tests
// ==========================================

runner.test('Integration: git clone failure full flow', async () => {
  const classifier = createErrorClassifier();
  const diagnostic = createDiagnosticReflection(mockLLMClient, 'test-model');

  // Step 1: Classify error
  const errorContext = {
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
      stdout: '',
      command: 'git clone https://github.com/user/repo'
    },
    toolCall: {
      function: { name: 'run_bash', arguments: { script: 'git clone ...' } }
    }
  };

  const classification = classifier.classify(errorContext);
  assertEqual(classification.category, ERROR_CATEGORIES.COMMAND_NOT_FOUND);

  // Step 2: Run diagnostic reflection
  const fullContext = {
    ...errorContext,
    iteration: 1,
    previousActions: [],
    availableTools: ['run_bash', 'read_dir'],
    workspaceState: { files: [], directories: [] },
    taskGoal: 'Clone repository'
  };

  const diagnosis = await diagnostic.runDiagnosticReflection(fullContext);

  assert(diagnosis.rootCause.category === ERROR_CATEGORIES.COMMAND_NOT_FOUND);
  assert(diagnosis.alternatives.length > 0);
  assert(diagnosis.alternatives[0].strategy, 'Should have strategy name');
  assert(diagnosis.alternatives[0].description, 'Should have description');
});

// Run tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
});
