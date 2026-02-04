# Consciousness System Tests

## Overview

This directory contains comprehensive tests for the Persistent Consciousness System, including unit tests, integration tests, end-to-end tests, and validation tests.

## Structure

```
__tests__/
├── unit/                  # Unit tests for individual modules
├── integration/           # Integration tests for module interactions
│   └── wiring/            # Integration wiring tests
├── e2e/                   # End-to-end workflow tests
├── validation/            # Stub detection and functional validation
│   └── stub-detection.test.mjs  # Critical: Prevents placeholder code
├── fixtures/              # Test data and fixtures
└── mocks/                 # Mock implementations for testing
```

## Test Categories

### 1. Unit Tests (`unit/`)
Test individual modules in isolation.

**Example**: `thought-classifier.test.mjs`
- Tests thought classification logic
- Verifies scoring algorithms
- Checks edge cases

### 2. Integration Tests (`integration/`)
Test how modules work together.

**Example**: `consciousness-to-inference.test.mjs`
- Tests consciousness engine → inference manager flow
- Verifies data passes correctly between modules
- Checks error propagation

### 3. End-to-End Tests (`e2e/`)
Test complete workflows from start to finish.

**Example**: `thinking-cycle.e2e.test.mjs`
- Tests full thinking cycle
- Verifies dream cycles
- Checks GraphQL subscriptions

### 4. Validation Tests (`validation/`)
**Critical**: Prevent implementation issues

#### Stub Detection (`stub-detection.test.mjs`)
Prevents:
- Empty/placeholder files
- Functions that just throw "not implemented"
- TODO/STUB/FIXME comments in production code
- Modules marked as implemented but not tested

This test is run first in CI to catch issues early.

### 5. Fixtures (`fixtures/`)
Reusable test data.

**Example**: `thoughts.mjs`
```javascript
export const simpleThought = { ... }
export const complexThought = { ... }
```

### 6. Mocks (`mocks/`)
Mock implementations for testing.

**Example**: `llm-provider.mjs`
```javascript
export class MockLLMProvider {
  async generate() { return { text: 'mock' } }
}
```

## Running Tests

### All Tests
```bash
npm test
```

### By Category
```bash
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests
npm run test:validation        # Stub detection + validation
```

### With Coverage
```bash
npm run test:coverage
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Single File
```bash
npm test -- thought-classifier.test.mjs
```

## Writing Tests

### Test File Template

```javascript
/**
 * @testfile consciousness/module-name
 * @description Brief description of what this tests
 *
 * Coverage:
 * - Feature 1
 * - Feature 2
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ModuleName } from '../module-name.mjs'

describe('ModuleName', () => {
  beforeEach(() => {
    // Reset state before each test
  })

  describe('feature1', () => {
    it('should do something specific', () => {
      // Arrange
      const module = new ModuleName()

      // Act
      const result = module.doSomething()

      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

### Best Practices

1. **Descriptive Names**: `should classify complex thoughts as deep tier`
2. **Arrange-Act-Assert**: Clear test structure
3. **Isolation**: Each test is independent
4. **Mock Externals**: Don't call real APIs
5. **Test Errors**: Test failure paths too

### File Header Standards

All implementation files must have:

```javascript
/**
 * @module consciousness/module-name
 * @description What this module does
 *
 * @status IMPLEMENTED | IN_PROGRESS | STUB
 * @tested true | false
 * @coverage 85%
 *
 * Dependencies:
 * - other-module.mjs
 *
 * Integration points:
 * - Called by: X
 * - Calls: Y
 *
 * Tests:
 * - unit: module-name.test.mjs
 * - integration: x-to-y.test.mjs
 */
```

## Coverage Requirements

| Test Type | Minimum | Target |
|-----------|---------|--------|
| Unit | 80% | 90% |
| Integration | 70% | 85% |
| E2E | 50% | 70% |
| **Overall** | **75%** | **85%** |

**Critical Paths** (100% required):
- Thought classification → inference routing
- Memory promotion pipeline
- Bias detection
- GraphQL communication

## CI Pipeline

Tests run in this order:

1. **Validation Tests** (stub detection) - Fails fast if stubs detected
2. **Unit Tests** - Fast feedback
3. **Integration Tests** - Module wiring
4. **E2E Tests** - Full workflows
5. **Coverage Report** - Must meet threshold

## Implementation Status

Check implementation status:

```bash
node scripts/check-implementation-status.mjs
```

This validates:
- All modules are implemented (not stubs)
- All modules have tests
- All modules are functionally validated
- Coverage meets requirements

## Troubleshooting

### Test Failing: "Stub detected"
Your module has placeholder code. Implement the actual functionality.

### Test Failing: "Missing @status annotation"
Add a file header with `@status IMPLEMENTED` (see template above).

### Test Failing: "@tested is true but no test file found"
Create a test file in `unit/` for your module.

### Coverage Too Low
Add more test cases, especially for edge cases and error paths.

## Adding New Tests

1. **Determine test type**: unit, integration, e2e?
2. **Create test file**: Follow naming convention
3. **Write tests**: Use template above
4. **Add fixtures** if needed (in `fixtures/`)
5. **Update `.implementation-status.json`**
6. **Run tests**: `npm test`
7. **Check coverage**: `npm run test:coverage`

## Resources

- [Test Infrastructure Guide](../../../docs/testing/TEST_INFRASTRUCTURE.md)
- [Architecture Documentation](../../../docs/architecture/CONSCIOUSNESS_ARCHITECTURE.md)
- [Vitest Documentation](https://vitest.dev/)

## Questions?

See the main documentation or run:

```bash
node scripts/check-implementation-status.mjs
```

for detailed status of all modules.
