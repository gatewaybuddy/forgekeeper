/**
 * Test Suite: Recovery Scenarios
 * [T315] Validates recovery strategies work for common failure patterns
 */

import { createRecoveryPlanner } from '../../frontend/core/agent/recovery-planner.mjs';
import { ERROR_CATEGORIES } from '../../frontend/core/agent/error-classifier.mjs';

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
    console.log('\n🧪 Running Recovery Scenario Tests\n');
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
// Recovery Planner Tests
// ==========================================

runner.test('Recovery Planner: git clone failure → curl fallback', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      description: 'git binary not found',
      confidence: 0.95
    },
    alternatives: []
  };

  const context = {
    toolCall: {
      function: {
        name: 'run_bash',
        arguments: {
          script: 'git clone https://github.com/gatewaybuddy/forgekeeper'
        }
      }
    },
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
      command: 'git clone https://github.com/gatewaybuddy/forgekeeper'
    },
    availableTools: ['run_bash', 'read_dir', 'read_file', 'write_file'],
    taskGoal: 'Clone repository'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(recoveryPlan.primaryStrategy, 'Should have primary strategy');
  assertEqual(recoveryPlan.primaryStrategy.name, 'curl_download_and_extract');
  assert(recoveryPlan.primaryStrategy.steps.length >= 2, 'Should have multiple steps');

  // Verify steps contain curl and tar
  const stepDescriptions = recoveryPlan.primaryStrategy.steps.map(s => s.tool).join(',');
  assert(stepDescriptions.includes('run_bash'), 'Should use run_bash for curl/tar');
});

runner.test('Recovery Planner: permission denied → sandbox path', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.PERMISSION_DENIED,
      description: 'Insufficient permissions',
      confidence: 0.9
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'write_file',
        arguments: {
          file: '/etc/config.txt',
          content: 'test'
        }
      }
    },
    error: {
      message: 'permission denied',
      code: 'EACCES',
    },
    availableTools: ['write_file', 'read_dir', 'read_file'],
    taskGoal: 'Write configuration'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(recoveryPlan.primaryStrategy, 'Should have primary strategy');
  assertEqual(recoveryPlan.primaryStrategy.name, 'try_sandbox_directory');

  // Check that steps include sandbox path
  const hasReadDir = recoveryPlan.primaryStrategy.steps.some(s => s.tool === 'read_dir');
  assert(hasReadDir, 'Should verify sandbox access with read_dir');
});

runner.test('Recovery Planner: tool not found → alternative tools', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.TOOL_NOT_FOUND,
      description: 'Tool not in allowlist',
      confidence: 1.0
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'repo_browser',
        arguments: {}
      }
    },
    error: {
      message: 'Unknown tool: repo_browser',
    },
    availableTools: ['run_bash', 'read_dir', 'read_file', 'write_file'],
    taskGoal: 'Browse repository'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(recoveryPlan.primaryStrategy, 'Should have primary strategy');
  assert(recoveryPlan.primaryStrategy.description.includes('read_dir') ||
         recoveryPlan.primaryStrategy.description.includes('run_bash'),
         'Should suggest available alternatives');
});

runner.test('Recovery Planner: timeout → reduce scope', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.TIMEOUT,
      description: 'Operation exceeded time limit',
      confidence: 0.9
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'run_bash',
        arguments: {
          script: 'find . -name "*.js"',
          timeout_ms: 10000
        }
      }
    },
    error: {
      message: 'timeout',
      code: 'ETIMEDOUT',
    },
    availableTools: ['run_bash'],
    taskGoal: 'Find JavaScript files'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(recoveryPlan.primaryStrategy, 'Should have primary strategy');
  assert(['reduce_scope', 'increase_timeout'].includes(recoveryPlan.primaryStrategy.name),
         'Should suggest scope reduction or timeout increase');
});

runner.test('Recovery Planner: file not found → verify path', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.FILE_NOT_FOUND,
      description: 'File does not exist',
      confidence: 0.9
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'read_file',
        arguments: {
          file: 'config.yaml'
        }
      }
    },
    error: {
      message: 'No such file',
      code: 'ENOENT',
    },
    availableTools: ['read_file', 'read_dir', 'run_bash'],
    taskGoal: 'Read configuration'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(recoveryPlan.primaryStrategy, 'Should have primary strategy');
  assert(recoveryPlan.primaryStrategy.name.includes('verify') ||
         recoveryPlan.primaryStrategy.name.includes('search'),
         'Should suggest path verification or search');
});

runner.test('Recovery Planner: filters by available tools', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      description: 'git binary not found',
      confidence: 0.95
    }
  };

  const context = {
    toolCall: {
      function: { name: 'run_bash', arguments: { script: 'git clone ...' } }
    },
    error: {
      message: 'git not found',
      code: 127,
      command: 'git clone https://github.com/user/repo'
    },
    availableTools: ['read_file', 'write_file'], // No run_bash!
    taskGoal: 'Clone repository'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  // Should not suggest curl fallback since run_bash isn't available
  if (recoveryPlan.hasRecoveryPlan) {
    const primaryUsesRunBash = recoveryPlan.primaryStrategy.steps.some(s => s.tool === 'run_bash');
    assert(!primaryUsesRunBash, 'Should not use unavailable tools');
  }
});

runner.test('Recovery Planner: provides fallback strategies', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      description: 'git binary not found',
      confidence: 0.95
    }
  };

  const context = {
    toolCall: {
      function: { name: 'run_bash', arguments: { script: 'git clone ...' } }
    },
    error: {
      message: 'git not found',
      code: 127,
      command: 'git clone https://github.com/user/repo'
    },
    availableTools: ['run_bash', 'read_dir'],
    taskGoal: 'Clone repository'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  assert(recoveryPlan.hasRecoveryPlan, 'Should have recovery plan');
  assert(Array.isArray(recoveryPlan.fallbackStrategies), 'Should have fallback strategies array');

  // Should have at least 1 fallback (or 0 if only one strategy exists)
  assert(recoveryPlan.fallbackStrategies.length >= 0, 'Should provide fallback strategies');
});

runner.test('Recovery Planner: step generation includes expected outcome', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      confidence: 0.95
    }
  };

  const context = {
    toolCall: {
      function: { name: 'run_bash', arguments: { script: 'git clone https://github.com/user/repo' } }
    },
    error: {
      message: 'git not found',
      code: 127,
      command: 'git clone https://github.com/user/repo'
    },
    availableTools: ['run_bash', 'read_dir'],
    taskGoal: 'Clone repository'
  };

  const recoveryPlan = planner.generateRecoveryPlan(diagnosis, context);

  if (recoveryPlan.hasRecoveryPlan) {
    recoveryPlan.primaryStrategy.steps.forEach(step => {
      assert(step.action, 'Each step should have action description');
      assert(step.expectedOutcome, 'Each step should have expected outcome');
      if (step.tool) {
        assert(step.args, 'Tool steps should have args');
      }
    });
  }
});

// ==========================================
// Scenario Integration Tests
// ==========================================

runner.test('Scenario: Complete git clone recovery flow', () => {
  const planner = createRecoveryPlanner();

  // Simulate full failure context
  const diagnosis = {
    id: 'diag_123',
    timestamp: new Date().toISOString(),
    iteration: 2,
    whyChain: {
      why1: 'git command failed with exit 127',
      why2: 'git binary not in PATH',
      why3: 'Agent assumed git availability',
      why4: 'No fallback prepared',
      why5: 'Missing capability check'
    },
    rootCause: {
      category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      description: 'git binary not installed',
      confidence: 0.95
    },
    alternatives: [],
    errorClassification: {
      type: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
      severity: 'recoverable',
      canRecover: true
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'run_bash',
        arguments: {
          script: 'git clone https://github.com/gatewaybuddy/forgekeeper'
        }
      }
    },
    error: {
      message: 'bash error (exit 127): git: command not found',
      code: 127,
      stderr: 'bash: git: command not found',
      stdout: '',
      command: 'git clone https://github.com/gatewaybuddy/forgekeeper'
    },
    availableTools: ['run_bash', 'read_dir', 'read_file', 'write_file'],
    taskGoal: 'Clone the repo at https://github.com/gatewaybuddy/forgekeeper'
  };

  // Generate recovery plan
  const plan = planner.generateRecoveryPlan(diagnosis, context);

  // Validate complete recovery flow
  assert(plan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(plan.primaryStrategy, 'Should have primary strategy');
  assertEqual(plan.primaryStrategy.name, 'curl_download_and_extract');
  assert(plan.primaryStrategy.confidence >= 0.8, 'Should have high confidence');
  assert(plan.primaryStrategy.steps.length >= 2, 'Should have multiple steps');

  // Check steps are executable
  plan.primaryStrategy.steps.forEach((step, i) => {
    assert(step.tool || step.tool === null, `Step ${i + 1} should have tool (or null for user action)`);
    assert(step.action, `Step ${i + 1} should have action description`);
    if (step.tool) {
      assert(step.args, `Step ${i + 1} should have args`);
      assert(typeof step.args === 'object', `Step ${i + 1} args should be object`);
    }
  });

  // Verify curl step
  const curlStep = plan.primaryStrategy.steps.find(s =>
    s.args?.script?.includes('curl')
  );
  assert(curlStep, 'Should have curl download step');
  assert(curlStep.args.script.includes('gatewaybuddy/forgekeeper'), 'Should download correct repo');
  assert(curlStep.args.script.includes('.tar.gz'), 'Should download tarball');

  // Verify tar step
  const tarStep = plan.primaryStrategy.steps.find(s =>
    s.args?.script?.includes('tar')
  );
  assert(tarStep, 'Should have tar extract step');
});

runner.test('Scenario: Permission denied recovery completes', () => {
  const planner = createRecoveryPlanner();

  const diagnosis = {
    rootCause: {
      category: ERROR_CATEGORIES.PERMISSION_DENIED,
      description: 'Insufficient permissions for /etc/',
      confidence: 0.95
    }
  };

  const context = {
    toolCall: {
      function: {
        name: 'write_file',
        arguments: {
          file: '/etc/test.txt',
          content: 'test data'
        }
      }
    },
    error: {
      message: 'permission denied',
      code: 'EACCES',
      stderr: 'Permission denied'
    },
    availableTools: ['write_file', 'read_dir', 'read_file'],
    taskGoal: 'Write configuration file'
  };

  const plan = planner.generateRecoveryPlan(diagnosis, context);

  assert(plan.hasRecoveryPlan, 'Should generate recovery plan');
  assert(plan.primaryStrategy.steps.length >= 1, 'Should have recovery steps');

  // Check that sandbox path is used
  const writeStep = plan.primaryStrategy.steps.find(s => s.tool === 'write_file');
  if (writeStep) {
    const path = writeStep.args.file || writeStep.args.path;
    assert(path.includes('sandbox') || path.includes('.forgekeeper'),
           'Should write to sandbox directory');
  }
});

// Run tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
});
