import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Globals (describe, it, expect) available without imports
    globals: false,

    // Environment
    environment: 'node',

    // Test file patterns
    include: [
      'test/**/*.test.mjs',
      'tests/truncator.test.mjs',
      'tests/autonomous.async.test.mjs',
      'tests/tgt-week8.smoke.test.mjs',
      'tests/orchestrator/**/*.test.mjs',
      'tests/utils/**/*.test.mjs'
    ],

    // Exclude integration tests that need server and standalone test scripts
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Integration tests that require server to be running
      'tests/integration.test.mjs',
      'tests/tgt.integration.test.mjs',
      // Standalone test scripts using node:test or custom runners
      'tests/autonomous-enhancements.test.mjs',
      'tests/week8-week9-integration.test.mjs',
      'core/agent/__tests__/*.test.mjs'
    ],

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.mjs',
        '**/__tests__/**'
      ]
    }
  }
});
