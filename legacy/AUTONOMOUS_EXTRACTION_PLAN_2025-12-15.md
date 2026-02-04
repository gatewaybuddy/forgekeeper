# Autonomous.mjs Extraction Plan - December 15, 2025

**Status**: 📋 PLAN READY
**Target File**: `frontend/core/agent/autonomous.mjs` (3,937 lines)
**Goal**: Decompose into 4 focused modules + refactored orchestrator (~800 lines)
**Reduction**: 3,937 → 800 lines (**80% reduction** in main file)

---

## Executive Summary

The `autonomous.mjs` file has grown to 3,937 lines with a single `AutonomousAgent` class containing ~40 methods. This creates several problems:

- ❌ Hard to navigate and understand
- ❌ Difficult to test individual concerns
- ❌ High cognitive load for modifications
- ❌ Mixed responsibilities (LLM, memory, tools, reflection, orchestration)

**Solution**: Extract into 5 focused modules based on Single Responsibility Principle:

1. **llm-client.mjs** - LLM interaction and prompt building (~800 lines)
2. **memory-manager.mjs** - Memory system coordination (~500 lines)
3. **tool-handler.mjs** - Tool planning and execution (~700 lines)
4. **reflector.mjs** - Self-evaluation and meta-cognition (~600 lines)
5. **autonomous.mjs** (refactored) - Main orchestration (~800 lines)

**Total**: 3,400 lines well-organized vs 3,937 monolithic

---

## Current Structure Analysis

### File Breakdown (3,937 lines)

```
autonomous.mjs
├── Imports (1-67) ...................... 67 lines
│   └── 18 subsystem imports
│
├── AutonomousAgent class (68-3934) .... 3,867 lines
│   ├── Constructor (72-201) ........... 130 lines
│   ├── run() - Main loop (212-1122) ... 911 lines
│   ├── reflect() - LLM call (1132-1239) 108 lines
│   ├── executeIteration() (1249-1660+). 600+ lines
│   ├── executeRecoverySteps() ......... 62 lines
│   ├── Tool inference (1815-2306) ..... 492 lines
│   ├── Diagnostic reflection .......... 89 lines
│   ├── Prompt building (2378-2650+) ... 500+ lines
│   ├── Meta-cognition (2800-3098) ..... 299 lines
│   ├── Utilities (3100-3800+) ......... 700+ lines
│   └── Checkpoint ops (3594-3768) ..... 174 lines
│
└── Factory function (3935-3937) ....... 3 lines
```

### Key Methods by Concern

**LLM Interaction** (15 methods, ~800 lines):
- `reflect()` - Main LLM self-assessment call
- `buildReflectionPrompt()` - Construct complex prompt (156 lines)
- `runDiagnosticReflection()` - 5 Whys analysis
- `buildFailureWarnings()` - Failure prompt section
- `buildRepetitionWarning()` - Repetition detection section
- `buildSuccessPatternsGuidance()` - Success patterns section
- `buildMetaReflectionGuidance()` - Meta-reflection section
- `buildPlanningFeedbackGuidance()` - Planning feedback section
- `buildToolRecommendationsGuidance()` - Tool recommendations section
- `buildEpisodesGuidance()` - Episode guidance section
- `formatPastLearnings()` - Learning formatting
- `getTaskTypeGuidance()` - Task-specific guidance
- Plus JSON parsing and validation logic

**Memory Management** (10 methods, ~500 lines):
- Session memory loading (constructor)
- Episodic memory search (constructor)
- User preferences loading (constructor)
- Tool effectiveness loading (constructor)
- `saveCheckpoint()` - Persist state
- `loadCheckpoint()` - Restore state
- `resumeFromCheckpoint()` - Resume execution
- Memory system initialization
- State persistence logic
- Learning retrieval

**Tool Orchestration** (12 methods, ~700 lines):
- `executeIteration()` - Main execution (412+ lines)
- `executeRecoverySteps()` - Recovery execution (62 lines)
- `planExecution()` - Convert reflection to plan
- `inferToolsFromAction()` - Heuristic inference (186+ lines)
- `inferToolArgs()` - Argument construction
- `buildToolsList()` - Tool registry access
- `convertInstructionsToPlan()` - Plan format conversion
- `extractFilePattern()` - Pattern extraction
- `extractSearchTerm()` - Search term extraction
- `extractKeywords()` - Keyword extraction (37 lines)
- `inferTestCommand()` - Test command inference
- `generateInitialContent()` - File content generation

**Self-Evaluation & Meta-Cognition** (8 methods, ~600 lines):
- `scorePlanningAccuracy()` - Plan accuracy assessment (63 lines)
- `scoreReflectionAccuracy()` - Reflection scoring
- Progress tracking integration
- Stuck detection logic
- Confidence calibration
- Self-evaluator integration
- Meta-reflection on predictions
- Planning feedback analysis

**Main Orchestration** (10+ methods, ~1,000 lines):
- `run()` - Main autonomous loop (911 lines)
- `shouldStop()` - Stopping criteria
- `emitCheckpoint()` - Progress checkpoint
- `complete()` - Session completion
- `buildResult()` - Result construction
- `generateSummary()` - Summary generation
- `detectTaskType()` - Task classification
- `askForClarification()` - Interactive mode
- `generateClarifyingQuestions()` - Question generation
- Event logging (ContextLog integration)
- State management
- Iteration coordination

---

## Extraction Plan

### Module 1: `orchestrator/llm-client.mjs`

**Purpose**: All LLM interaction, prompt building, and response parsing

**Size**: ~800 lines

**Exports**:
```javascript
export class LLMClient {
  constructor(llmClient, model, config) { ... }

  // Main reflection call
  async reflect(state, executor, selfEvaluator) { ... }

  // Diagnostic reflection (5 Whys)
  async runDiagnosticReflection(toolCall, error, executor, context) { ... }

  // Prompt building
  buildReflectionPrompt(state, executor, guidance) { ... }
  buildFailureWarnings(recentFailures) { ... }
  buildRepetitionWarning(state) { ... }
  buildSuccessPatternsGuidance(state) { ... }
  buildMetaReflectionGuidance(reflectionAccuracy) { ... }
  buildPlanningFeedbackGuidance(planningFeedback) { ... }
  buildToolRecommendationsGuidance(toolRecommendations, taskType) { ... }
  buildEpisodesGuidance(relevantEpisodes) { ... }
  formatPastLearnings(learnings) { ... }
  getTaskTypeGuidance(taskType) { ... }
}
```

**Dependencies**:
- LLM client (injected)
- Diagnostic reflection subsystem (injected)
- Self-evaluator (injected)
- ContextLog events

**Extracted From**:
- Lines 1132-1239: `reflect()` method
- Lines 2318-2370: `runDiagnosticReflection()`
- Lines 2378-2534: `buildReflectionPrompt()`
- Lines 2542-2596: `buildFailureWarnings()`
- Lines 2599-2650+: `buildRepetitionWarning()`
- Lines 2800-2925: `buildMetaReflectionGuidance()`
- Lines 2935-2997: `scorePlanningAccuracy()` (move to reflector)
- Lines 3005-3044: `buildPlanningFeedbackGuidance()`
- Lines 3052-3098: `buildToolRecommendationsGuidance()`
- Lines 3106-3130: `buildEpisodesGuidance()`
- Lines 3138-3164: `formatPastLearnings()`
- Lines 3230+: `getTaskTypeGuidance()`

**Benefits**:
- All LLM logic in one place
- Easy to test prompts and responses
- Clear separation from business logic
- Reusable prompt building components

---

### Module 2: `orchestrator/memory-manager.mjs`

**Purpose**: Coordinate all memory systems (session, episodic, preferences, checkpoints)

**Size**: ~500 lines

**Exports**:
```javascript
export class MemoryManager {
  constructor(config) { ... }

  // Memory loading
  async loadSessionMemory(taskType) { ... }
  async loadEpisodicMemory(task) { ... }
  async loadUserPreferences() { ... }
  async loadToolRecommendations(taskType) { ... }

  // Checkpoint operations
  async saveCheckpoint(sessionId, state, config, playgroundRoot) { ... }
  async loadCheckpoint(checkpointId, playgroundRoot) { ... }

  // Memory guidance generation
  generateLearningGuidance(pastLearnings, pastFailures) { ... }
  generateEpisodesGuidance(relevantEpisodes) { ... }
  generatePreferencesGuidance(userPreferenceGuidance) { ... }
  generateToolRecommendations(toolRecommendations) { ... }
}
```

**Dependencies**:
- Session memory subsystem
- Episodic memory subsystem
- Preference system
- Tool effectiveness tracker
- File system (fs/promises)

**Extracted From**:
- Lines 262-316: Memory loading in `run()` constructor
- Lines 3594-3629: `saveCheckpoint()`
- Lines 3638-3653: `loadCheckpoint()`
- Memory-related guidance generation scattered throughout

**Benefits**:
- Centralized memory coordination
- Easy to add new memory systems
- Clear data flow
- Testable in isolation

---

### Module 3: `orchestrator/tool-handler.mjs`

**Purpose**: Tool planning, execution, and recovery

**Size**: ~700 lines

**Exports**:
```javascript
export class ToolHandler {
  constructor(config) { ... }

  // Planning
  planExecution(reflection) { ... }
  convertInstructionsToPlan(instructionPlan) { ... }
  buildToolsList(executor) { ... }

  // Tool inference
  inferToolsFromAction(action, state) { ... }
  inferToolArgs(tool, action) { ... }
  extractFilePattern(action) { ... }
  extractSearchTerm(action) { ... }
  extractKeywords(text) { ... }
  inferTestCommand(action) { ... }
  generateInitialContent(fileName) { ... }

  // Execution
  async executePlan(plan, executor, context, state) { ... }
  async executeRecoverySteps(steps, executor, context) { ... }

  // Utilities
  detectTaskType(task) { ... }
}
```

**Dependencies**:
- Tool executor (injected)
- Task planner subsystem
- ContextLog events

**Extracted From**:
- Lines 1249-1660+: `executeIteration()` - plan execution logic
- Lines 1675-1736: `executeRecoverySteps()`
- Lines 1744-1762: `planExecution()`
- Lines 1771-1781: `buildToolsList()`
- Lines 1790-1804: `convertInstructionsToPlan()`
- Lines 1815-2306: `inferToolsFromAction()` + all helpers
- Lines 3172-3220+: `detectTaskType()`

**Benefits**:
- All tool logic isolated
- Easy to test heuristics
- Clear execution path
- Reusable tool inference

---

### Module 4: `orchestrator/reflector.mjs`

**Purpose**: Self-evaluation, meta-cognition, progress tracking

**Size**: ~600 lines

**Exports**:
```javascript
export class Reflector {
  constructor(config) { ... }

  // Self-evaluation
  scoreReflectionAccuracy(lastReflection, actualProgress, actualOutcome) { ... }
  scorePlanningAccuracy(instructionPlan, executionResult) { ... }
  calibrateConfidence(rawConfidence, context, selfEvaluator) { ... }

  // Progress tracking
  trackProgress(state, progressTracker) { ... }
  detectStuck(state, progressTracker, statusChecker) { ... }

  // Stopping criteria
  shouldStop(state, config) { ... }

  // Result building
  buildResult(state, reason) { ... }
  generateSummary(state, reason) { ... }
}
```

**Dependencies**:
- Progress tracker
- Status checker
- Self-evaluator

**Extracted From**:
- Lines 2935-2997: `scorePlanningAccuracy()`
- Lines 340-394: Stuck detection logic from `run()`
- Lines 404-430: Stopping criteria logic from `run()`
- Lines 3480-3520: `generateSummary()`
- Lines 3528-3543: `buildResult()`
- Confidence calibration logic scattered in `reflect()`

**Benefits**:
- Meta-cognition logic centralized
- Easy to improve accuracy algorithms
- Testable progress tracking
- Clear evaluation boundaries

---

### Module 5: `autonomous.mjs` (Refactored)

**Purpose**: Main orchestration - coordinate all subsystems

**Size**: ~800 lines (was 3,937)

**Structure**:
```javascript
import { LLMClient } from './orchestrator/llm-client.mjs';
import { MemoryManager } from './orchestrator/memory-manager.mjs';
import { ToolHandler } from './orchestrator/tool-handler.mjs';
import { Reflector } from './orchestrator/reflector.mjs';
// ... other imports

export class AutonomousAgent {
  constructor(config) {
    // Initialize subsystems
    this.llmClient = new LLMClient(config.llmClient, config.model, config);
    this.memoryManager = new MemoryManager(config);
    this.toolHandler = new ToolHandler(config);
    this.reflector = new Reflector(config);

    // Legacy subsystems (unchanged)
    this.sessionMemory = config.sessionMemory;
    this.episodicMemory = config.episodicMemory;
    // ... etc
  }

  async run(task, executor, context) {
    // Initialize session
    this.sessionId = ulid();
    this.state = { /* ... */ };

    // Load memories via MemoryManager
    const memories = await this.memoryManager.loadSessionMemory(taskType);
    const episodes = await this.memoryManager.loadEpisodicMemory(task);
    const preferences = await this.memoryManager.loadUserPreferences();
    const toolRecs = await this.memoryManager.loadToolRecommendations(taskType);

    // Main loop
    while (true) {
      this.state.iteration++;

      // Stuck detection (via Reflector)
      if (this.state.iteration % 5 === 0) {
        await this.reflector.detectStuck(this.state, this.progressTracker, this.statusChecker);
      }

      // Check stopping (via Reflector)
      const stopCheck = this.reflector.shouldStop(this.state, this.config);
      if (stopCheck.stop) {
        await this.complete(stopCheck.reason, context);
        return this.reflector.buildResult(this.state, stopCheck.reason);
      }

      // Checkpoint
      if (this.state.iteration % this.checkpointInterval === 0) {
        await this.memoryManager.saveCheckpoint(this.sessionId, this.state, this.config, this.playgroundRoot);
        await this.emitCheckpoint(context);
      }

      // Reflection (via LLMClient)
      const reflection = await this.llmClient.reflect(
        this.state,
        executor,
        this.selfEvaluator
      );
      this.state.reflections.push(reflection);

      // Meta-cognition (via Reflector)
      if (this.state.lastReflection) {
        const accuracy = this.reflector.scoreReflectionAccuracy(
          this.state.lastReflection,
          reflection.progress_percent,
          reflection.assessment
        );
        this.state.reflectionAccuracy.push(accuracy);
      }

      // Execute iteration (via ToolHandler)
      const executionResult = await this.toolHandler.executePlan(
        reflection,
        executor,
        context,
        this.state
      );

      // Update state
      this.state.history.push({
        iteration: this.state.iteration,
        action: reflection.next_action,
        result: executionResult.summary,
        progress: reflection.progress_percent,
        confidence: reflection.confidence,
        tools_used: executionResult.tools_used,
        artifacts: executionResult.artifacts,
      });

      this.state.lastReflection = reflection;
    }
  }

  async resumeFromCheckpoint(checkpointId, executor, context) {
    const checkpoint = await this.memoryManager.loadCheckpoint(checkpointId, this.playgroundRoot);
    // ... restore and resume ...
  }

  requestStop() { this.stopRequested = true; }
  getProgress() { return this.progressTracker.getStatus(); }
  // ... other public API methods
}

export function createAutonomousAgent(config) {
  return new AutonomousAgent(config);
}
```

**Responsibilities** (only):
- Session lifecycle management
- Iteration coordination
- State management
- Event logging (ContextLog)
- Subsystem coordination
- Public API surface

**Benefits**:
- Crystal clear orchestration flow
- Easy to understand main loop
- Each concern delegated to specialist
- Main file reduced 80% (3,937 → 800 lines)

---

## Implementation Strategy

### Phase 1: Extract LLM Client (2-3 hours)

1. Create `frontend/core/agent/orchestrator/` directory
2. Create `orchestrator/llm-client.mjs`
3. Copy LLM-related methods and tests
4. Update imports and dependencies
5. Refactor `autonomous.mjs` to use `LLMClient`
6. Run tests to verify no regressions

**Test Command**: `npm --prefix frontend run test -- --testPathPattern=autonomous`

### Phase 2: Extract Memory Manager (2-3 hours)

1. Create `orchestrator/memory-manager.mjs`
2. Copy memory-related methods
3. Update constructor to use `MemoryManager`
4. Refactor checkpoint operations
5. Run tests

### Phase 3: Extract Tool Handler (3-4 hours)

1. Create `orchestrator/tool-handler.mjs`
2. Copy tool planning and execution
3. Copy all heuristic inference methods (large!)
4. Refactor `executeIteration()` to delegate
5. Run tests

### Phase 4: Extract Reflector (2-3 hours)

1. Create `orchestrator/reflector.mjs`
2. Copy meta-cognition methods
3. Copy progress tracking integration
4. Refactor stopping criteria
5. Run tests

### Phase 5: Refactor Main Orchestrator (2-3 hours)

1. Simplify `run()` method to pure coordination
2. Remove all extracted code
3. Update method signatures
4. Ensure clean delegation
5. Run full test suite
6. Update documentation

**Total Effort**: 12-16 hours

---

## Testing Strategy

### Existing Tests

The autonomous agent has existing tests in:
- `frontend/tests/autonomous*.test.mjs` (if exists)
- Integration tests that use the agent

**IMPORTANT**: We must maintain 100% backward compatibility. All existing tests must pass without modification.

### New Tests

For each extracted module, create focused unit tests:

1. **llm-client.test.mjs**:
   - Test prompt building with various states
   - Test reflection parsing
   - Test diagnostic reflection
   - Test guidance generation

2. **memory-manager.test.mjs**:
   - Test memory loading
   - Test checkpoint save/load
   - Test guidance generation

3. **tool-handler.test.mjs**:
   - Test tool inference heuristics
   - Test plan execution
   - Test recovery steps

4. **reflector.test.mjs**:
   - Test accuracy scoring
   - Test stuck detection
   - Test stopping criteria

### Test Approach

1. **Before extraction**: Run all existing tests → establish baseline
2. **After each phase**: Run all tests → verify no regressions
3. **After completion**: Run full suite + new unit tests
4. **Integration**: Test end-to-end autonomous runs

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality

**Mitigation**:
- Extract conservatively (copy methods exactly)
- Keep method signatures identical
- Run tests after each extraction
- Use feature flag if needed (`ENABLE_REFACTORED_AUTONOMOUS=1`)

### Risk 2: Hidden Dependencies

**Mitigation**:
- Analyze all `this.state` accesses
- Map all subsystem usages
- Create explicit dependency injection
- Document all cross-module interactions

### Risk 3: Regression in Autonomous Behavior

**Mitigation**:
- Run full autonomous agent end-to-end tests
- Compare session logs before/after
- Test all 7 phases of autonomous agent
- Verify meta-cognition still works

### Risk 4: Performance Impact

**Mitigation**:
- Measure iteration time before/after
- Profile LLM call frequency
- Ensure no extra overhead from modules
- Keep delegation lightweight

---

## Success Criteria

### Code Quality

- ✅ Main `autonomous.mjs` reduced to ~800 lines (80% reduction)
- ✅ Each module has single clear responsibility
- ✅ No circular dependencies
- ✅ Clean import structure

### Functionality

- ✅ All existing tests pass
- ✅ Autonomous agent 7 phases work identically
- ✅ Meta-cognition accuracy unchanged
- ✅ Tool inference works same as before
- ✅ Memory systems load correctly

### Maintainability

- ✅ Easy to find LLM prompt logic (in llm-client.mjs)
- ✅ Easy to find tool logic (in tool-handler.mjs)
- ✅ Easy to find memory logic (in memory-manager.mjs)
- ✅ Easy to find meta-cognition (in reflector.mjs)
- ✅ Main orchestration flow clear and simple

### Performance

- ✅ No measurable performance degradation
- ✅ Iteration time within 5% of baseline
- ✅ Memory usage unchanged

---

## File Map

### Before (1 file)

```
frontend/core/agent/
└── autonomous.mjs ............... 3,937 lines
```

### After (5 files)

```
frontend/core/agent/
├── autonomous.mjs ............... ~800 lines (refactored)
└── orchestrator/
    ├── llm-client.mjs ........... ~800 lines
    ├── memory-manager.mjs ....... ~500 lines
    ├── tool-handler.mjs ......... ~700 lines
    └── reflector.mjs ............ ~600 lines
```

**Total**: 3,400 lines well-organized (vs 3,937 monolithic)

---

## Rollback Plan

If extraction introduces regressions:

1. **Immediate**: Git revert to pre-extraction commit
2. **Debug**: Identify specific regression
3. **Fix**: Address in isolated branch
4. **Validate**: Full test suite + autonomous runs
5. **Retry**: Merge when validated

**Git Strategy**:
- Create branch: `refactor/autonomous-extraction`
- Commit after each phase
- Tag baseline: `autonomous-baseline-pre-extraction`
- Can cherry-pick individual phases if needed

---

## Documentation Updates

After extraction, update:

1. **CLAUDE.md** - Update Autonomous Agent section with new structure
2. **docs/autonomous/architecture.md** - Document new module layout
3. **frontend/core/agent/README.md** - Add orchestrator module guide
4. **tasks.md** - Mark extraction task complete

---

## Expected Impact

### Developer Experience

**Before**:
```javascript
// Hard to find LLM prompt logic
vim frontend/core/agent/autonomous.mjs  // 3,937 lines!
// Search for "buildReflectionPrompt"...
// Scroll through 200 lines of code...
```

**After**:
```javascript
// Easy to navigate
vim frontend/core/agent/orchestrator/llm-client.mjs  // 800 lines, focused on LLM
// Or just:
import { LLMClient } from './orchestrator/llm-client.mjs';
```

### Importing

**Before**:
```javascript
// Can't easily reuse prompt building
// Everything tied to AutonomousAgent class
```

**After**:
```javascript
// Reusable components
import { LLMClient } from './orchestrator/llm-client.mjs';
import { ToolHandler } from './orchestrator/tool-handler.mjs';

// Use independently
const llmClient = new LLMClient(config);
const prompt = llmClient.buildReflectionPrompt(state, executor, guidance);
```

### Testing

**Before**:
```javascript
// Hard to test prompt building in isolation
// Must instantiate entire AutonomousAgent
```

**After**:
```javascript
// Easy unit tests
import { LLMClient } from './orchestrator/llm-client.mjs';

test('buildReflectionPrompt includes failure warnings', () => {
  const client = new LLMClient(mockLLM, 'test-model', {});
  const prompt = client.buildReflectionPrompt(mockState, mockExecutor, {});
  expect(prompt).toContain('Recent Failures');
});
```

---

## Comparison: Before vs After

### Before (Monolithic)

```javascript
// autonomous.mjs - 3,937 lines

class AutonomousAgent {
  constructor() {
    // 130 lines of initialization
  }

  async run() {
    // 911 lines mixing:
    // - Memory loading
    // - LLM calls
    // - Tool execution
    // - Progress tracking
    // - Event logging
    // - State management
  }

  async reflect() {
    // 108 lines of LLM interaction
  }

  buildReflectionPrompt() {
    // 156 lines of prompt building
    // Mixed with state access, memory access, etc.
  }

  // ... 35+ more methods mixing all concerns
}
```

**Problems**:
- ❌ Can't understand flow without reading entire file
- ❌ Can't test prompt building without full agent
- ❌ Can't reuse tool inference logic
- ❌ Hard to find where LLM calls happen
- ❌ State management scattered everywhere

### After (Modular)

```javascript
// autonomous.mjs - 800 lines (orchestration only)

import { LLMClient } from './orchestrator/llm-client.mjs';
import { MemoryManager } from './orchestrator/memory-manager.mjs';
import { ToolHandler } from './orchestrator/tool-handler.mjs';
import { Reflector } from './orchestrator/reflector.mjs';

class AutonomousAgent {
  constructor(config) {
    this.llmClient = new LLMClient(config);
    this.memoryManager = new MemoryManager(config);
    this.toolHandler = new ToolHandler(config);
    this.reflector = new Reflector(config);
  }

  async run(task, executor, context) {
    // 300 lines of CLEAR orchestration:

    // 1. Load memories
    const memories = await this.memoryManager.loadAll(taskType);

    // 2. Main loop
    while (true) {
      // 3. Reflect (via LLMClient)
      const reflection = await this.llmClient.reflect(this.state, executor);

      // 4. Execute (via ToolHandler)
      const result = await this.toolHandler.executePlan(reflection, executor);

      // 5. Evaluate (via Reflector)
      const accuracy = this.reflector.scoreAccuracy(reflection, result);

      // 6. Update state
      this.state.history.push({ reflection, result, accuracy });

      // 7. Check stopping (via Reflector)
      if (this.reflector.shouldStop(this.state)) break;
    }

    return this.reflector.buildResult(this.state, 'task_complete');
  }
}
```

```javascript
// orchestrator/llm-client.mjs - 800 lines (LLM only)

export class LLMClient {
  async reflect(state, executor, selfEvaluator) {
    const prompt = this.buildReflectionPrompt(state, executor);
    const response = await this.llmClient.chat({ ... });
    return this.parseReflection(response);
  }

  buildReflectionPrompt(state, executor) {
    // Clear, focused prompt building
    // No state management mixed in
    // Easy to test
  }
}
```

```javascript
// orchestrator/tool-handler.mjs - 700 lines (tools only)

export class ToolHandler {
  async executePlan(reflection, executor, context, state) {
    const plan = this.planExecution(reflection);
    const results = [];

    for (const step of plan.steps) {
      const result = await executor.executeTool(step);
      results.push(result);
    }

    return { summary, tools_used, artifacts };
  }

  inferToolsFromAction(action, state) {
    // 186 lines of pure heuristic logic
    // No LLM calls, no memory access
    // Easy to test
  }
}
```

**Benefits**:
- ✅ Clear orchestration flow in main file
- ✅ Each concern isolated and testable
- ✅ Easy to find LLM logic (llm-client.mjs)
- ✅ Easy to find tool logic (tool-handler.mjs)
- ✅ Reusable components
- ✅ Simple imports

---

## Next Steps

1. ✅ Create this plan document (YOU ARE HERE)
2. ⏳ Get user approval/feedback
3. ⏳ Create `orchestrator/` directory
4. ⏳ Phase 1: Extract LLM Client
5. ⏳ Phase 2: Extract Memory Manager
6. ⏳ Phase 3: Extract Tool Handler
7. ⏳ Phase 4: Extract Reflector
8. ⏳ Phase 5: Refactor Main Orchestrator
9. ⏳ Run full test suite
10. ⏳ Update documentation
11. ⏳ Create completion report

---

**Created**: 2025-12-15
**Estimated Effort**: 12-16 hours
**Expected Completion**: Within 1 work day
**Regressions Expected**: 0 (with careful extraction)
**Developer Happiness**: 📈 Significantly improved
