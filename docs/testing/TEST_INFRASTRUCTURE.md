# Consciousness System - Test Infrastructure

## Testing Philosophy

**Hybrid Approach**: Test-Driven Development (TDD) + Specification-Driven Development (SDD)

### Principles
1. **No Stubs in Production**: Validation tests detect placeholder code
2. **Integration-First**: Test wiring between modules, not just units
3. **Behavior-Driven**: Tests describe what the system should do
4. **Continuous Validation**: CI catches regressions
5. **Living Documentation**: Tests serve as examples

---

## Test Categories

### 1. Unit Tests
**Purpose**: Verify individual functions/classes work correctly

**Coverage**:
- Pure functions (classification scoring, etc.)
- State management (memory operations)
- Utility functions (summarization, scoring)

**Location**: `frontend/core/consciousness/__tests__/unit/`

**Example**:
```javascript
// thought-classifier.test.mjs
describe('ThoughtClassifier', () => {
  it('should score complex thoughts as deep tier', async () => {
    const classifier = new ThoughtClassifier()
    const thought = {
      content: 'Design a distributed consensus algorithm...',
      type: 'architecture'
    }
    const result = await classifier.classify(thought, {})

    expect(result.tier).toBe('deep')
    expect(result.confidence).toBeGreaterThan(0.7)
    expect(result.scores.complexity).toBeGreaterThan(0.8)
  })
})
```

### 2. Integration Tests
**Purpose**: Verify modules work together correctly

**Coverage**:
- Consciousness → Inference flow
- Memory promotion pipeline
- Dream cycle phases
- GraphQL → Engine communication

**Location**: `frontend/core/consciousness/__tests__/integration/`

**Example**:
```javascript
// consciousness-to-inference.test.mjs
describe('Consciousness → Inference Integration', () => {
  it('should classify and route thought to correct tier', async () => {
    const engine = new ConsciousnessEngine()
    const thought = await engine.generateThought()
    const result = await engine.inferenceManager.process(thought, {})

    // Verify wiring
    expect(result).toHaveProperty('tier')
    expect(result).toHaveProperty('classification')
    expect(result.classification.reasoning).toBeDefined()
    expect(['deep', 'rote']).toContain(result.tier)
  })
})
```

### 3. End-to-End Tests
**Purpose**: Verify complete workflows from start to finish

**Coverage**:
- Full thinking cycle (generate → classify → process → remember)
- Dream cycle (trigger → consolidate → challenge → integrate)
- GraphQL subscriptions (subscribe → cycle runs → events received)

**Location**: `frontend/core/consciousness/__tests__/e2e/`

**Example**:
```javascript
// thinking-cycle.e2e.test.mjs
describe('Complete Thinking Cycle', () => {
  it('should run full cycle and update state', async () => {
    const engine = new ConsciousnessEngine()
    const initialCycle = engine.cycleCount

    // Run one cycle
    await engine.runSingleCycle()

    // Verify all steps completed
    expect(engine.cycleCount).toBe(initialCycle + 1)
    expect(engine.shortTermMemory.buffer.length).toBeGreaterThan(0)
    expect(engine.lastThought).toBeDefined()
  })
})
```

### 4. Stub Detection Tests
**Purpose**: Ensure no placeholder/stub code in production

**Coverage**:
- Check for TODO/FIXME/STUB comments
- Verify functions have implementations
- Ensure required methods exist
- Validate non-empty return values

**Location**: `frontend/core/consciousness/__tests__/validation/`

**Example**:
```javascript
// stub-detection.test.mjs
import fs from 'fs'
import path from 'path'

describe('Stub Detection', () => {
  const consciousnessDir = path.join(__dirname, '../../')

  it('should have no TODO/STUB/FIXME comments in production code', () => {
    const files = getAllMjsFiles(consciousnessDir)
    const violations = []

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      lines.forEach((line, idx) => {
        if (/(TODO|STUB|FIXME|PLACEHOLDER)/i.test(line)) {
          violations.push(`${file}:${idx + 1} - ${line.trim()}`)
        }
      })
    })

    expect(violations).toEqual([])
  })

  it('should have no functions that just throw "not implemented"', () => {
    const files = getAllMjsFiles(consciousnessDir)
    const violations = []

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf-8')

      // Regex to find functions that only throw
      const stubPattern = /(?:async\s+)?function\s+\w+\([^)]*\)\s*{\s*throw\s+(?:new\s+)?Error\(['"](?:not implemented|TODO|stub)['"]\)/gi

      const matches = content.match(stubPattern)
      if (matches) {
        violations.push(`${file} - ${matches.length} stub function(s)`)
      }
    })

    expect(violations).toEqual([])
  })
})

function getAllMjsFiles(dir) {
  const files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...getAllMjsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      files.push(fullPath)
    }
  }

  return files
}
```

### 5. Functional Validation Tests
**Purpose**: Ensure modules actually work, not just exist

**Coverage**:
- Verify functions return expected types
- Check database connections work
- Validate API integrations
- Ensure file I/O succeeds

**Location**: `frontend/core/consciousness/__tests__/validation/`

**Example**:
```javascript
// functional-validation.test.mjs
describe('Functional Validation', () => {
  describe('ThoughtClassifier', () => {
    it('should actually classify and return valid scores', async () => {
      const classifier = new ThoughtClassifier()
      const thought = { content: 'Test thought', type: 'test' }
      const result = await classifier.classify(thought, {})

      // Type validation
      expect(result).toBeInstanceOf(Object)
      expect(result.tier).toMatch(/^(deep|rote)$/)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)

      // Structure validation
      expect(result.scores).toBeDefined()
      expect(result.scores.complexity).toBeDefined()
      expect(result.scores.novelty).toBeDefined()
      expect(result.scores.creativity).toBeDefined()
      expect(result.scores.uncertainty).toBeDefined()
      expect(result.scores.stakes).toBeDefined()

      // Functional validation - scores should be numbers
      Object.values(result.scores).forEach(score => {
        expect(typeof score).toBe('number')
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      })

      // Reasoning should be non-empty
      expect(result.reasoning).toBeDefined()
      expect(result.reasoning.length).toBeGreaterThan(10)
    })
  })

  describe('ShortTermMemory', () => {
    it('should actually store and retrieve memories', async () => {
      const stm = new ShortTermMemory()
      const memory = {
        id: 'test-1',
        summary: 'Test memory',
        importance: 0.8,
        timestamp: Date.now()
      }

      await stm.add(memory)

      // Verify it's actually in the buffer
      expect(stm.buffer.length).toBe(1)
      expect(stm.buffer[0].id).toBe('test-1')

      // Verify retrieval works
      const retrieved = await stm.getRelevant('test', 1)
      expect(retrieved.length).toBeGreaterThan(0)
      expect(retrieved[0].id).toBe('test-1')
    })
  })
})
```

### 6. Integration Wiring Tests
**Purpose**: Verify all module connections are correct

**Coverage**:
- GraphQL resolvers call correct engine methods
- Engine calls correct sub-modules
- Data flows correctly through pipeline
- Events propagate to subscribers

**Location**: `frontend/core/consciousness/__tests__/integration/wiring/`

**Example**:
```javascript
// graphql-wiring.test.mjs
describe('GraphQL Wiring', () => {
  it('should wire GraphQL query to consciousness engine', async () => {
    const mockEngine = {
      getState: jest.fn(() => ({
        state: 'thinking',
        cycleCount: 42
      }))
    }

    const context = { consciousness: mockEngine }
    const result = await resolvers.Query.consciousnessState(null, {}, context)

    expect(mockEngine.getState).toHaveBeenCalled()
    expect(result.state).toBe('thinking')
    expect(result.cycleCount).toBe(42)
  })

  it('should wire consciousness events to GraphQL subscriptions', async () => {
    const engine = new ConsciousnessEngine()
    const subscription = resolvers.Subscription.thoughtStream()
    const events = []

    subscription.subscribe(event => events.push(event))

    // Trigger cycle
    await engine.runSingleCycle()

    await sleep(100)  // Wait for event propagation

    expect(events.length).toBeGreaterThan(0)
    expect(events[0]).toHaveProperty('thought')
  })
})
```

### 7. Performance Tests
**Purpose**: Ensure system meets performance requirements

**Coverage**:
- Cycle duration within limits
- Memory usage stable
- API token consumption tracking
- No memory leaks

**Location**: `frontend/core/consciousness/__tests__/performance/`

**Example**:
```javascript
// performance.test.mjs
describe('Performance Requirements', () => {
  it('should complete classification in < 5 seconds', async () => {
    const classifier = new ThoughtClassifier()
    const start = Date.now()

    await classifier.classify({ content: 'test', type: 'test' }, {})

    const duration = Date.now() - start
    expect(duration).toBeLessThan(5000)
  })

  it('should not leak memory over 100 cycles', async () => {
    const engine = new ConsciousnessEngine()
    const initialMemory = process.memoryUsage().heapUsed

    for (let i = 0; i < 100; i++) {
      await engine.runSingleCycle()
    }

    const finalMemory = process.memoryUsage().heapUsed
    const growth = finalMemory - initialMemory

    // Should not grow more than 100MB
    expect(growth).toBeLessThan(100 * 1024 * 1024)
  })
})
```

---

## Implementation Status Tracking

### File Header Standard

Every implementation file MUST have this header:

```javascript
/**
 * @module consciousness/thought-classifier
 * @description Classifies thoughts as deep reasoning or rote tasks
 *
 * @status IMPLEMENTED | IN_PROGRESS | STUB
 * @tested true | false
 * @coverage 85%
 *
 * Dependencies:
 * - inference-manager.mjs
 * - budget-manager.mjs
 *
 * Integration points:
 * - Called by: InferenceManager.process()
 * - Calls: BudgetManager.hasCredit()
 *
 * Tests:
 * - unit: thought-classifier.test.mjs
 * - integration: consciousness-to-inference.test.mjs
 */
```

### Implementation Checklist

Create `.implementation-status.json` to track progress:

```json
{
  "sprint": 1,
  "modules": [
    {
      "name": "thought-classifier",
      "path": "frontend/core/consciousness/thought-classifier.mjs",
      "status": "IMPLEMENTED",
      "tested": true,
      "coverage": 92,
      "integrationPoints": [
        "inference-manager",
        "budget-manager"
      ],
      "testFiles": [
        "__tests__/unit/thought-classifier.test.mjs",
        "__tests__/integration/consciousness-to-inference.test.mjs"
      ],
      "functionallyValidated": true,
      "lastUpdated": "2025-01-15T10:30:00Z"
    },
    {
      "name": "inference-manager",
      "path": "frontend/core/consciousness/inference-manager.mjs",
      "status": "IN_PROGRESS",
      "tested": false,
      "coverage": 0,
      "integrationPoints": [
        "consciousness-engine",
        "thought-classifier"
      ],
      "testFiles": [],
      "functionallyValidated": false,
      "lastUpdated": "2025-01-15T08:00:00Z"
    }
  ],
  "integrationTests": [
    {
      "name": "consciousness-to-inference",
      "status": "PASSING",
      "modules": ["consciousness-engine", "inference-manager", "thought-classifier"]
    }
  ]
}
```

### Automated Status Check

```javascript
// scripts/check-implementation-status.mjs
import fs from 'fs'
import path from 'path'

const statusFile = '.implementation-status.json'
const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'))

console.log('Implementation Status Report\n')

// Module status
const total = status.modules.length
const implemented = status.modules.filter(m => m.status === 'IMPLEMENTED').length
const tested = status.modules.filter(m => m.tested).length
const validated = status.modules.filter(m => m.functionallyValidated).length

console.log(`Modules: ${implemented}/${total} implemented`)
console.log(`Tests: ${tested}/${total} tested`)
console.log(`Validation: ${validated}/${total} validated\n`)

// Find issues
const issues = []

status.modules.forEach(module => {
  if (module.status === 'IMPLEMENTED' && !module.tested) {
    issues.push(`${module.name}: Implemented but not tested`)
  }
  if (module.status === 'IMPLEMENTED' && !module.functionallyValidated) {
    issues.push(`${module.name}: Implemented but not validated`)
  }
  if (module.status === 'STUB') {
    issues.push(`${module.name}: Still a stub`)
  }
})

if (issues.length > 0) {
  console.log('Issues:')
  issues.forEach(issue => console.log(`  - ${issue}`))
  process.exit(1)
}

console.log('✓ All modules implemented, tested, and validated')
```

---

## Test Execution Strategy

### Local Development

```bash
# Run unit tests (fast)
npm run test:unit

# Run integration tests
npm run test:integration

# Run stub detection
npm run test:validation

# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### CI Pipeline

```yaml
# .github/workflows/consciousness-tests.yml
name: Consciousness System Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm --prefix forgekeeper/frontend install

      - name: Stub Detection
        run: npm --prefix forgekeeper/frontend run test:validation

      - name: Unit Tests
        run: npm --prefix forgekeeper/frontend run test:unit

      - name: Integration Tests
        run: npm --prefix forgekeeper/frontend run test:integration

      - name: E2E Tests
        run: npm --prefix forgekeeper/frontend run test:e2e

      - name: Implementation Status Check
        run: node forgekeeper/scripts/check-implementation-status.mjs

      - name: Coverage Report
        run: npm --prefix forgekeeper/frontend run test:coverage
        env:
          COVERAGE_THRESHOLD: 80
```

---

## Test Data Management

### Fixtures

**Location**: `frontend/core/consciousness/__tests__/fixtures/`

```javascript
// fixtures/thoughts.mjs
export const simpleThought = {
  content: 'Run npm install',
  type: 'command',
  context: {}
}

export const complexThought = {
  content: 'Design a distributed consensus algorithm considering Byzantine failures',
  type: 'architecture',
  context: { domain: 'distributed-systems' }
}

export const memories = [
  {
    id: 'mem-1',
    summary: 'Successfully implemented feature X',
    importance: 0.8,
    emotionalSalience: 0.9,
    timestamp: Date.now() - 1000000
  },
  // ... more fixtures
]
```

### Mocks

**Location**: `frontend/core/consciousness/__tests__/mocks/`

```javascript
// mocks/llm-provider.mjs
export class MockLLMProvider {
  async generate(prompt, options) {
    // Return deterministic responses for testing
    if (prompt.includes('classify')) {
      return {
        text: 'DEEP\nReasoning: This is complex...',
        tokensUsed: 100
      }
    }
    return { text: 'Mock response', tokensUsed: 50 }
  }
}
```

---

## Coverage Requirements

| Test Type | Minimum Coverage | Target Coverage |
|-----------|------------------|-----------------|
| Unit | 80% | 90% |
| Integration | 70% | 85% |
| E2E | 50% | 70% |
| Overall | 75% | 85% |

**Critical Paths** (must be 100%):
- Thought classification → inference routing
- Memory promotion pipeline
- Bias detection and challenge
- GraphQL → Engine communication

---

## Testing Best Practices

### 1. Arrange-Act-Assert Pattern

```javascript
test('should promote high-importance memories', async () => {
  // Arrange
  const stm = new ShortTermMemory()
  const memory = { importance: 0.9, ... }

  // Act
  await stm.add(memory)
  const promoted = await stm.evaluateForPromotion(memory)

  // Assert
  expect(promoted).toBe(true)
})
```

### 2. Descriptive Test Names

✅ Good: `should classify novel architectural questions as deep tier`
❌ Bad: `test1`

### 3. Test Isolation

```javascript
// Each test should be independent
beforeEach(() => {
  // Reset state
  consciousness = new ConsciousnessEngine()
  clearDatabase()
})
```

### 4. Mock External Dependencies

```javascript
// Don't call real API in tests
jest.mock('./anthropic-provider', () => ({
  generate: jest.fn(() => Promise.resolve({ text: 'mock' }))
}))
```

### 5. Test Error Paths

```javascript
test('should fallback to rote tier when API fails', async () => {
  const manager = new InferenceManager()
  manager.deepTier.generate = jest.fn(() => Promise.reject(new Error('API down')))

  const result = await manager.process(thought, context)

  expect(result.tier).toBe('rote')
})
```

---

## Documentation Standards

### Test Documentation

Every test file should have:

```javascript
/**
 * @testfile consciousness/thought-classifier
 * @description Unit tests for thought classification logic
 *
 * Coverage:
 * - Complexity scoring
 * - Novelty detection
 * - Tier determination
 * - Edge cases (empty thoughts, etc.)
 *
 * Integration:
 * - See: consciousness-to-inference.test.mjs
 */
```

### README in Test Directories

`__tests__/README.md`:

```markdown
# Consciousness System Tests

## Structure

- `unit/` - Individual module tests
- `integration/` - Module interaction tests
- `e2e/` - Full workflow tests
- `validation/` - Stub detection, functional validation
- `fixtures/` - Test data
- `mocks/` - Mock implementations

## Running Tests

See [TEST_INFRASTRUCTURE.md](../../docs/testing/TEST_INFRASTRUCTURE.md)

## Adding New Tests

1. Determine test type (unit, integration, e2e)
2. Create test file with descriptive name
3. Add fixtures if needed
4. Update .implementation-status.json
5. Run `npm test` to verify
```

---

## Success Criteria

Before considering a module "complete":

- ✅ Implementation status: `IMPLEMENTED`
- ✅ Unit tests written and passing
- ✅ Integration tests covering all wiring points
- ✅ Stub detection passes (no placeholders)
- ✅ Functional validation passes (actually works)
- ✅ Coverage > 80%
- ✅ Documentation complete (JSDoc + README)
- ✅ Added to `.implementation-status.json`
- ✅ CI pipeline passes

---

## Next: Implement Test Infrastructure

1. Set up test framework (vitest already available)
2. Create test directories
3. Write stub detection tests
4. Create `.implementation-status.json`
5. Set up CI pipeline
6. Begin Sprint 1 implementation with TDD
