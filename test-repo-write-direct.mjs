#!/usr/bin/env node
/**
 * Direct test of write_repo_file tool (no LLM required)
 *
 * This test directly imports and calls the write_repo_file tool module
 * to verify that REPO_WRITE_ALLOW configuration is working.
 *
 * Usage: node test-repo-write-direct.mjs
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = __dirname;

// Set environment to match our local setup (not container)
process.env.REPO_ROOT = REPO_ROOT; // Use local path
process.env.FRONTEND_ENABLE_REPO_WRITE = '1';
process.env.REPO_WRITE_ALLOW = process.env.REPO_WRITE_ALLOW || 'frontend/Dockerfile,docker-compose.yml,frontend/src/**/*.tsx,frontend/src/**/*.ts,frontend/src/**/*.jsx,frontend/src/**/*.js,frontend/src/**/*.mjs,frontend/src/**/*.css,frontend/src/**/*.json,frontend/tests/**/*.mjs,frontend/tests/**/*.js,frontend/tests/**/*.test.ts,frontend/tests/**/*.test.tsx,frontend/tools/**/*.mjs,frontend/core/**/*.mjs,frontend/package.json,frontend/vite.config.ts,frontend/tsconfig.json,docs/**/*.md,README.md,.env.example,forgekeeper/**/*.py,forgekeeper/**/*.mjs,scripts/**/*.sh,scripts/**/*.ps1,scripts/**/*.py,scripts/**/*.mjs,.github/**/*.yml,.github/**/*.yaml,tasks.md,CONTRIBUTING.md';

// Now import the tool (after env is set)
const toolModule = await import('./frontend/tools/write_repo_file.mjs');
const { run: writeRepoFile } = toolModule;

const TEST_CASES = [
  // Should SUCCEED (in allowlist)
  {
    name: 'Markdown doc file',
    path: 'docs/TEST_WRITE_PERMISSIONS.md',
    content: '# Test\n\nThis verifies write permissions.\n',
    shouldSucceed: true,
  },
  {
    name: 'Frontend TypeScript component',
    path: 'frontend/src/components/TestWriteComponent.tsx',
    content: '// Test component\nexport const Test = () => null;\n',
    shouldSucceed: true,
  },
  {
    name: 'Frontend test file',
    path: 'frontend/tests/test-write-permissions.mjs',
    content: '// Test file\nconsole.log("test");\n',
    shouldSucceed: true,
  },
  {
    name: 'Python backend file',
    path: 'forgekeeper/test_write.py',
    content: '# Test\nprint("test")\n',
    shouldSucceed: true,
  },
  {
    name: 'Frontend tool',
    path: 'frontend/tools/test_tool.mjs',
    content: '// Test tool\nexport const def = {};\n',
    shouldSucceed: true,
  },
  {
    name: 'Script file',
    path: 'scripts/test-write.sh',
    content: '#!/bin/bash\necho "test"\n',
    shouldSucceed: true,
  },
  {
    name: 'Docker compose test file',
    path: 'docker-compose.test.yml',
    content: '# Test\nversion: "3"\n',
    shouldSucceed: false, // Not in allowlist - intentionally
  },

  // Should FAIL (not in allowlist)
  {
    name: 'Root package.json (blocked)',
    path: 'package.json',
    content: '{}',
    shouldSucceed: false,
  },
  {
    name: 'Random root file (blocked)',
    path: 'random-file.txt',
    content: 'test',
    shouldSucceed: false,
  },
  {
    name: 'Path traversal attempt (blocked)',
    path: '../outside.txt',
    content: 'test',
    shouldSucceed: false,
  },
];

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 DIRECT WRITE_REPO_FILE TOOL TEST');
  console.log('='.repeat(70) + '\n');

  console.log(`Repository root: ${REPO_ROOT}`);
  console.log(`REPO_ROOT env: ${process.env.REPO_ROOT}`);
  console.log(`FRONTEND_ENABLE_REPO_WRITE: ${process.env.FRONTEND_ENABLE_REPO_WRITE}`);
  console.log(`Allowlist patterns: ${process.env.REPO_WRITE_ALLOW.split(',').length} patterns\n`);

  const results = {
    passed: 0,
    failed: 0,
    details: [],
  };

  for (const test of TEST_CASES) {
    console.log(`\n📝 Testing: ${test.name}`);
    console.log(`   Path: ${test.path}`);
    console.log(`   Expected: ${test.shouldSucceed ? 'SUCCESS' : 'BLOCKED'}`);

    try {
      const result = await writeRepoFile({
        path: test.path,
        content: test.content,
      });

      if (test.shouldSucceed) {
        console.log(`   ✅ PASS - File written successfully`);
        console.log(`      Result: ${JSON.stringify(result)}`);
        results.passed++;
        results.details.push({ test: test.name, status: 'PASS', expected: true });

        // Clean up successful test file
        try {
          const fullPath = path.join(REPO_ROOT, test.path);
          await fs.unlink(fullPath);
          console.log(`   🗑️  Cleaned up test file`);
        } catch (err) {
          console.log(`   ⚠️  Could not clean up: ${err.message}`);
        }
      } else {
        console.log(`   ❌ FAIL - Should have been blocked but succeeded!`);
        console.log(`      Result: ${JSON.stringify(result)}`);
        results.failed++;
        results.details.push({ test: test.name, status: 'FAIL', expected: false, actual: 'succeeded' });
      }
    } catch (error) {
      if (!test.shouldSucceed) {
        console.log(`   ✅ PASS - Correctly blocked`);
        console.log(`      Error: ${error.message}`);
        results.passed++;
        results.details.push({ test: test.name, status: 'PASS', expected: false });
      } else {
        console.log(`   ❌ FAIL - Should have succeeded but was blocked!`);
        console.log(`      Error: ${error.message}`);
        results.failed++;
        results.details.push({ test: test.name, status: 'FAIL', expected: true, actual: 'blocked', error: error.message });
      }
    }
  }

  return results;
}

async function printSummary(results) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70) + '\n');

  console.log(`Total tests: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\n❌ Failed tests:');
    results.details
      .filter(d => d.status === 'FAIL')
      .forEach(d => {
        console.log(`   - ${d.test}`);
        if (d.error) {
          console.log(`     Error: ${d.error}`);
        } else if (d.actual) {
          console.log(`     Expected: ${d.expected ? 'allow' : 'block'}, Got: ${d.actual}`);
        }
      });
  }

  console.log('\n' + '='.repeat(70));

  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('Repository write permissions are configured correctly.');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('Review the REPO_WRITE_ALLOW configuration.');
  }

  console.log('='.repeat(70) + '\n');

  return results.failed === 0 ? 0 : 1;
}

async function main() {
  try {
    const results = await runTests();
    const exitCode = await printSummary(results);
    process.exit(exitCode);
  } catch (error) {
    console.error('\n❌ TEST SUITE CRASHED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
