# Disciplined Development Process

## A Methodology for Complex Software Projects

**Version**: 1.0
**Created**: 2025-01-15
**Purpose**: Prevent common implementation pitfalls through systematic planning, testing, and validation

---

## The Problem

Large software projects often face these critical issues:

1. **Lost Progress**: Losing track of what's been implemented vs. planned
2. **Placeholder Confusion**: Mistaking stub/placeholder code for working implementations
3. **Integration Failures**: Difficulty wiring many small modules into coherent systems
4. **Missing Tests**: Code implemented without validation
5. **Incomplete Documentation**: Poor understanding of system architecture

**Result**: Projects that appear complete but don't actually work, or work partially with hidden gaps.

---

## The Solution: A Four-Phase Process

```
Phase 1: Architecture → Phase 2: Testing Infrastructure → Phase 3: Tracking → Phase 4: Implementation
```

---

## Phase 1: Architecture & Design

### Purpose
Create comprehensive architectural documentation BEFORE writing any code.

### Deliverables

#### 1.1 System Overview Diagram
**File**: `docs/architecture/{PROJECT_NAME}_ARCHITECTURE.md`

**Must include**:
- ASCII art system overview showing all layers
- Component breakdown per layer
- Technology stack per component
- Expected data flows
- Integration points between components

**Template**:
```
┌─────────────────────────────────────────┐
│           CLIENT LAYER                   │
│  [Component 1]  [Component 2]           │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│           API LAYER                      │
│  [Component 3]  [Component 4]           │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│           BUSINESS LOGIC LAYER           │
│  [Component 5]  [Component 6]           │
└─────────────────────────────────────────┘
```

#### 1.2 Data Flow Diagrams
**Must include**:
- Primary workflow from start to end
- Data transformations at each step
- Decision points (if/else, routing)
- Error paths and fallbacks

**Template**:
```
START
  │
  ▼
┌─────────────────┐
│ Step 1          │
│ Description     │
└────────┬────────┘
         │
         ▼
    Decision?
         │
   ┌─────┴─────┐
  YES         NO
   │           │
   ▼           ▼
[Path A]    [Path B]
```

#### 1.3 Module Dependency Graph
**Must show**:
- Which modules depend on which
- Direction of dependencies (arrows)
- Circular dependencies (if any - should be avoided)

**Template**:
```
┌──────────┐
│ Module A │
└────┬─────┘
     │
     ├────────┐
     │        │
     ▼        ▼
┌────────┐ ┌────────┐
│Module B│ │Module C│
└────────┘ └────┬───┘
                │
                ▼
           ┌────────┐
           │Module D│
           └────────┘
```

#### 1.4 Integration Points Reference
**Critical for preventing wiring issues**

Document EVERY integration point with:
- Source module
- Target module
- Method/function called
- Data passed
- Expected return value
- Example code snippet

**Template**:
```markdown
### Integration Point: Module A → Module B

**Location**: `module-a.mjs` line 45
**Calls**: `moduleB.process(data)`
**Input**: `{ type: string, content: any }`
**Output**: `{ success: boolean, result: any }`

```javascript
// In module-a.mjs
const result = await this.moduleB.process({
  type: 'example',
  content: data
})
```
```

#### 1.5 State Transition Diagrams
For stateful systems, document state machines:

```
idle ──[trigger]──> processing ──[complete]──> done
  ^                     │                       │
  │                     └──[error]──────────────┘
```

#### 1.6 Performance Expectations
Document expected latencies, throughput, resource usage.

#### 1.7 Error Handling Strategy
Document retry logic, fallback chains, recovery procedures.

### Checklist
- [ ] System overview diagram created
- [ ] Data flow diagrams for primary workflows
- [ ] Module dependency graph complete
- [ ] All integration points documented with examples
- [ ] State transitions documented (if applicable)
- [ ] Performance expectations defined
- [ ] Error handling strategy documented
- [ ] Architecture reviewed and approved

---

## Phase 2: Test Infrastructure

### Purpose
Set up comprehensive testing BEFORE writing production code.

### Deliverables

#### 2.1 Test Infrastructure Document
**File**: `docs/testing/TEST_INFRASTRUCTURE.md`

**Must define**:
1. **Test Categories**: Unit, Integration, E2E, Validation, Performance
2. **Coverage Requirements**: Minimum and target percentages
3. **Testing Philosophy**: TDD, BDD, or hybrid approach
4. **Naming Conventions**: How to name test files and test cases
5. **Best Practices**: Patterns to follow, anti-patterns to avoid

#### 2.2 Test Directory Structure
Create directories BEFORE implementation:

```
{project}/
├── __tests__/
│   ├── unit/                  # Individual module tests
│   ├── integration/           # Module interaction tests
│   │   └── wiring/            # Integration wiring tests
│   ├── e2e/                   # End-to-end workflow tests
│   ├── validation/            # Stub detection, functional validation
│   ├── performance/           # Performance/load tests (optional)
│   ├── fixtures/              # Test data
│   └── mocks/                 # Mock implementations
└── README.md                  # Test documentation
```

#### 2.3 Stub Detection Tests
**CRITICAL**: Create these tests FIRST to prevent placeholder issues.

**File**: `__tests__/validation/stub-detection.test.mjs`

**Must detect**:
- Empty/near-empty files (< 50 chars of code)
- Functions that only throw "not implemented" errors
- TODO/STUB/FIXME/PLACEHOLDER comments in production code
- Missing @status annotations
- @status marked as STUB
- Modules marked implemented but without tests
- Test file existence mismatching @tested annotation

**Template**: See `forgekeeper/frontend/core/consciousness/__tests__/validation/stub-detection.test.mjs`

#### 2.4 Functional Validation Tests
**File**: `__tests__/validation/functional-validation.test.mjs`

**Must verify**:
- Functions return expected types
- Database connections work
- API integrations succeed
- File I/O operations succeed
- No placeholder return values (null, undefined, empty objects)

#### 2.5 Integration Wiring Tests
**File**: `__tests__/integration/wiring/{integration-name}.test.mjs`

**Must verify**:
- Module A correctly calls Module B
- Data passes correctly between modules
- Events propagate as expected
- Error handling works across boundaries

#### 2.6 Test Fixtures & Mocks
Create reusable test data and mock implementations:

**Fixtures** (`__tests__/fixtures/`):
```javascript
// example-data.mjs
export const validInput = { ... }
export const invalidInput = { ... }
export const edgeCaseInput = { ... }
```

**Mocks** (`__tests__/mocks/`):
```javascript
// mock-external-service.mjs
export class MockExternalService {
  async call() {
    return { success: true, data: 'mock' }
  }
}
```

#### 2.7 Test README
**File**: `__tests__/README.md`

**Must include**:
- Overview of test structure
- How to run tests (commands)
- How to write new tests (templates)
- Coverage requirements
- CI/CD integration
- Troubleshooting guide

### Checklist
- [ ] Test infrastructure document created
- [ ] Test directory structure created
- [ ] Stub detection tests written
- [ ] Functional validation tests written
- [ ] Integration wiring test templates created
- [ ] Fixtures and mocks structure set up
- [ ] Test README written
- [ ] Test commands configured in package.json
- [ ] Coverage thresholds configured

---

## Phase 3: Implementation Tracking System

### Purpose
Track implementation progress to prevent losing track of what's complete.

### Deliverables

#### 3.1 Implementation Status File
**File**: `.implementation-status.json`

**Template**:
```json
{
  "project": "Project Name",
  "sprint": 1,
  "startDate": "2025-01-15",
  "modules": [
    {
      "name": "module-name",
      "path": "path/to/module.ext",
      "status": "NOT_STARTED | IN_PROGRESS | IMPLEMENTED | STUB",
      "tested": false,
      "coverage": 0,
      "integrationPoints": ["other-module-1", "other-module-2"],
      "testFiles": [],
      "functionallyValidated": false,
      "lastUpdated": null
    }
  ],
  "integrationTests": [
    {
      "name": "module-a-to-module-b",
      "status": "NOT_STARTED | PASSING | FAILING",
      "modules": ["module-a", "module-b"]
    }
  ],
  "e2eTests": [],
  "validationTests": {
    "stubDetection": false,
    "functionalValidation": false,
    "integrationWiring": false
  },
  "ciStatus": "NOT_CONFIGURED | PASSING | FAILING",
  "overallProgress": {
    "implemented": 0,
    "tested": 0,
    "validated": 0,
    "total": 10
  }
}
```

#### 3.2 Status Checker Script
**File**: `scripts/check-implementation-status.mjs`

**Must**:
- Read `.implementation-status.json`
- Display progress summary
- List issues (implemented but not tested, stubs, etc.)
- List warnings (low coverage, missing integration tests)
- Exit with error code if critical issues found
- Exit successfully if all complete

**Template**: See `forgekeeper/scripts/check-implementation-status.mjs`

#### 3.3 File Header Standard
**All implementation files must have**:

```javascript
/**
 * @module category/module-name
 * @description What this module does (1-2 sentences)
 *
 * @status IMPLEMENTED | IN_PROGRESS | STUB
 * @tested true | false
 * @coverage 85%
 *
 * Dependencies:
 * - dependency-1.ext
 * - dependency-2.ext
 *
 * Integration points:
 * - Called by: CallerModule.method()
 * - Calls: DependencyModule.method()
 *
 * Tests:
 * - unit: module-name.test.ext
 * - integration: module-a-to-module-b.test.ext
 */
```

**Enforced by**: Stub detection tests

#### 3.4 Update Script (Optional)
Create a script to update `.implementation-status.json`:

```bash
node scripts/update-status.mjs module-name IMPLEMENTED --tested --coverage 85
```

### Checklist
- [ ] `.implementation-status.json` created with all modules
- [ ] Status checker script created
- [ ] File header standard documented
- [ ] Update script created (optional)
- [ ] Status check added to CI pipeline

---

## Phase 4: Implementation (Test-Driven)

### Purpose
Implement features with tests driving development.

### Process

#### 4.1 For Each Module

##### Step 1: Plan
- Review architecture diagram
- Review integration points
- Identify dependencies
- List test cases

##### Step 2: Write Tests First (TDD)
1. Create unit test file: `__tests__/unit/module-name.test.ext`
2. Write test cases for:
   - Happy path
   - Edge cases
   - Error conditions
3. Tests should FAIL initially (red)

##### Step 3: Implement Module
1. Create module file with proper header
2. Implement minimum code to pass tests (green)
3. Refactor for clarity (refactor)

##### Step 4: Update Status
```bash
node scripts/update-status.mjs module-name IMPLEMENTED --tested --coverage XX
```

##### Step 5: Write Integration Tests
1. Create integration test: `__tests__/integration/wiring/module-a-to-module-b.test.ext`
2. Verify data flows correctly
3. Verify error handling

##### Step 6: Run Validation
```bash
npm run test:validation  # Should pass (no stubs detected)
```

##### Step 7: Update Documentation
- Update architecture diagrams if needed
- Update integration points if changed
- Add usage examples

#### 4.2 Integration Phase

After implementing related modules:

1. **Run Integration Tests**
   ```bash
   npm run test:integration
   ```

2. **Verify Wiring**
   - Check all integration points work
   - Verify data flows end-to-end
   - Test error propagation

3. **Update Status File**
   - Mark integration tests as PASSING
   - Update overall progress

#### 4.3 End-to-End Validation

After completing a sprint:

1. **Run E2E Tests**
   ```bash
   npm run test:e2e
   ```

2. **Check Implementation Status**
   ```bash
   node scripts/check-implementation-status.mjs
   ```
   Must show: All modules IMPLEMENTED, tested, validated

3. **Verify Coverage**
   ```bash
   npm run test:coverage
   ```
   Must meet minimum thresholds

4. **Manual Testing**
   - Test real workflows
   - Verify UI (if applicable)
   - Performance testing

### Checklist (Per Module)
- [ ] Test cases planned
- [ ] Unit tests written (failing)
- [ ] Module implemented (tests passing)
- [ ] Status updated to IMPLEMENTED
- [ ] Integration tests written
- [ ] Integration tests passing
- [ ] Stub detection passes
- [ ] Functional validation passes
- [ ] Coverage meets threshold
- [ ] Documentation updated

---

## Phase 5: Continuous Integration

### Purpose
Automate validation to catch issues early.

### Setup

#### 5.1 CI Pipeline Configuration
**File**: `.github/workflows/tests.yml` (for GitHub Actions)

**Pipeline order** (fail fast):
```yaml
1. Stub Detection       # Fast, catches critical issues
2. Unit Tests           # Fast feedback
3. Integration Tests    # Module wiring
4. E2E Tests            # Full workflows
5. Status Check         # Verify completeness
6. Coverage Report      # Verify thresholds
```

**Template**:
```yaml
name: Test Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm install

      - name: Stub Detection (Fail Fast)
        run: npm run test:validation

      - name: Unit Tests
        run: npm run test:unit

      - name: Integration Tests
        run: npm run test:integration

      - name: E2E Tests
        run: npm run test:e2e

      - name: Implementation Status Check
        run: node scripts/check-implementation-status.mjs

      - name: Coverage Report
        run: npm run test:coverage
        env:
          COVERAGE_THRESHOLD: 80

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
```

#### 5.2 Pre-commit Hooks (Optional)
Run tests before allowing commits:

**File**: `.husky/pre-commit`
```bash
#!/bin/sh
npm run test:validation || exit 1
```

### Checklist
- [ ] CI configuration file created
- [ ] Pipeline runs on push/PR
- [ ] Stub detection runs first
- [ ] All test categories included
- [ ] Status check included
- [ ] Coverage reporting configured
- [ ] Pre-commit hooks set up (optional)

---

## Quick Start Checklist

Use this checklist when starting a new project:

### Phase 1: Architecture (Day 1-2)
- [ ] Create `docs/architecture/` directory
- [ ] Write system overview diagram
- [ ] Write data flow diagrams
- [ ] Document module dependencies
- [ ] Document all integration points with examples
- [ ] Define state transitions (if applicable)
- [ ] Set performance expectations
- [ ] Define error handling strategy

### Phase 2: Testing Infrastructure (Day 2-3)
- [ ] Create `docs/testing/` directory
- [ ] Write test infrastructure document
- [ ] Create test directory structure
- [ ] Write stub detection tests
- [ ] Write functional validation tests
- [ ] Create integration test templates
- [ ] Set up fixtures and mocks
- [ ] Write test README

### Phase 3: Tracking System (Day 3)
- [ ] Create `.implementation-status.json`
- [ ] Write status checker script
- [ ] Document file header standard
- [ ] Test status checker works

### Phase 4: Implementation (Day 4+)
For each module:
- [ ] Write unit tests (TDD)
- [ ] Implement module
- [ ] Update status file
- [ ] Write integration tests
- [ ] Run validation tests
- [ ] Verify coverage
- [ ] Update documentation

### Phase 5: CI/CD (Day 3-4)
- [ ] Create CI configuration
- [ ] Test pipeline locally
- [ ] Push to trigger CI
- [ ] Verify all checks pass
- [ ] Set up pre-commit hooks (optional)

---

## Templates & Resources

### Project Structure Template

```
project/
├── docs/
│   ├── architecture/
│   │   └── {PROJECT}_ARCHITECTURE.md
│   ├── testing/
│   │   └── TEST_INFRASTRUCTURE.md
│   └── methodology/
│       └── DISCIPLINED_DEVELOPMENT_PROCESS.md (this file)
├── src/
│   └── {module}/
│       ├── __tests__/
│       │   ├── unit/
│       │   ├── integration/
│       │   │   └── wiring/
│       │   ├── e2e/
│       │   ├── validation/
│       │   │   ├── stub-detection.test.ext
│       │   │   └── functional-validation.test.ext
│       │   ├── fixtures/
│       │   └── mocks/
│       └── README.md
├── scripts/
│   ├── check-implementation-status.mjs
│   └── update-status.mjs (optional)
├── .implementation-status.json
├── .github/
│   └── workflows/
│       └── tests.yml
└── package.json (with test scripts)
```

### Package.json Scripts Template

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run __tests__/unit",
    "test:integration": "vitest run __tests__/integration",
    "test:e2e": "vitest run __tests__/e2e",
    "test:validation": "vitest run __tests__/validation",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "status": "node scripts/check-implementation-status.mjs"
  }
}
```

---

## Benefits

### What This Process Prevents

1. ✅ **Lost Progress**: Status file tracks everything
2. ✅ **Placeholder Confusion**: Stub detection catches it immediately
3. ✅ **Integration Failures**: Integration tests verify wiring
4. ✅ **Missing Tests**: Status check enforces testing
5. ✅ **Poor Documentation**: Architecture docs required upfront

### What This Process Enables

1. ✅ **Confidence**: Know what's done vs. what's left
2. ✅ **Quality**: High test coverage, validated implementations
3. ✅ **Maintainability**: Clear documentation and architecture
4. ✅ **Collaboration**: Team members can see progress
5. ✅ **Onboarding**: New developers understand the system

### Metrics

Track these metrics over time:
- Implementation completion rate
- Test coverage percentage
- Stub detection violations (should be 0)
- Integration test pass rate
- Time to implement (decreases with practice)

---

## Adapting This Process

### For Small Projects
- Simplify architecture (single diagram)
- Combine test categories (unit + integration)
- Manual status tracking (skip .json file)

### For Large Projects
- Multiple architecture documents per subsystem
- Separate status files per module
- Automated status updates
- Performance testing required
- Security testing added

### For Different Languages
- Adjust file extensions (.py, .java, .ts, etc.)
- Use appropriate test frameworks
- Adapt CI configuration
- Keep principles the same

---

## Examples

### This Process Applied: Forgekeeper Consciousness System

See the Forgekeeper project for a complete example:

- Architecture: `forgekeeper/docs/architecture/CONSCIOUSNESS_ARCHITECTURE.md`
- Testing: `forgekeeper/docs/testing/TEST_INFRASTRUCTURE.md`
- Status: `forgekeeper/.implementation-status.json`
- Tests: `forgekeeper/frontend/core/consciousness/__tests__/`

**Result**: 8 modules, clear architecture, comprehensive tests, no stubs, full tracking.

---

## Success Criteria

A project using this process is successful when:

- [ ] All modules have status = IMPLEMENTED
- [ ] All modules have tested = true
- [ ] All modules have functionallyValidated = true
- [ ] Stub detection passes (0 violations)
- [ ] Coverage meets thresholds (typically 80%+)
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] CI pipeline is green
- [ ] Documentation is complete
- [ ] `check-implementation-status.mjs` reports: "ALL SYSTEMS GO"

---

## Conclusion

This disciplined process transforms complex software development from an error-prone, chaotic process into a systematic, validated approach.

**Key Insight**: By investing time upfront in architecture, testing infrastructure, and tracking, you prevent far more costly issues during and after implementation.

**Recommended**: Use this process for any project with 5+ modules or 2+ developers.

**Next Steps**:
1. Bookmark this document
2. Use it as a template for your next project
3. Refine based on your experience
4. Share with your team

---

**Version History**:
- v1.0 (2025-01-15): Initial version based on Forgekeeper Consciousness System implementation
