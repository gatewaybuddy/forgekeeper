# Autonomous.mjs Integration Guide - December 15, 2025

**Purpose**: Step-by-step guide to integrate the 4 extracted orchestrator modules into `autonomous.mjs`
**Estimated Effort**: 2-3 hours of careful implementation + testing
**Safety**: Backup created at `autonomous.mjs.backup`

---

## Overview

**Status**: ✅ Extraction Complete (4 modules, 2,579 lines)
**Next**: Integrate modules into main `autonomous.mjs` file

**Extraction Summary**:
- `orchestrator/llm-client.mjs` (810 lines) - LLM interactions
- `orchestrator/memory-manager.mjs` (209 lines) - Memory coordination
- `orchestrator/tool-handler.mjs` (898 lines) - Tool planning/execution
- `orchestrator/reflector.mjs` (662 lines) - Self-evaluation

---

## Integration Steps

### Step 1: Add Module Imports (lines 13-34)

**Current** (lines 13-34):
```javascript
import { ulid } from 'ulid';
import fs from 'fs/promises';
import path from 'path';
import { contextLogEvents } from '../services/contextlog-events.mjs';
import { createSessionMemory } from './session-memory.mjs';
import { createEpisodicMemory } from './episodic-memory.mjs';
import { createDiagnosticReflection } from './diagnostic-reflection.mjs';
import { createRecoveryPlanner } from './recovery-planner.mjs';
import { createPatternLearner } from './pattern-learner.mjs';
import { createTaskPlanner } from './task-planner.mjs';
import { createToolEffectivenessTracker } from './tool-effectiveness.mjs';
import { ProgressTracker } from './progress-tracker.mjs';
import { ConcurrentStatusChecker } from './concurrent-status-checker.mjs';
import { SelfEvaluator } from './self-evaluator.mjs';
import { createAlternativeGenerator } from './alternative-generator.mjs';
import { createEffortEstimator } from './effort-estimator.mjs';
import { createPlanAlignmentChecker } from './plan-alignment-checker.mjs';
import { createAlternativeEvaluator } from './alternative-evaluator.mjs';
import { createTaskGraphBuilder } from './task-graph-builder.mjs';
import { createMultiStepEvaluator } from './multi-step-evaluator.mjs';
import { createOutcomeTracker } from './outcome-tracker.mjs';
import { createWeightLearner } from './weight-learner.mjs';
```

**Add After Line 34**:
```javascript
// Orchestrator modules (extracted for modularity)
import { LLMClient } from './orchestrator/llm-client.mjs';
import { MemoryManager } from './orchestrator/memory-manager.mjs';
import { ToolHandler } from './orchestrator/tool-handler.mjs';
import { Reflector } from './orchestrator/reflector.mjs';
```

---

### Step 2: Update Constructor (lines 72-201)

**Current** (lines 72-201):
```javascript
constructor(config) {
  this.llmClient = config.llmClient;
  this.model = config.model || 'gpt-4';
  this.maxIterations = config.maxIterations || 50;
  this.checkpointInterval = config.checkpointInterval || 5;
  this.errorThreshold = config.errorThreshold || 5;
  this.playgroundRoot = config.playgroundRoot || process.cwd();
  this.interactiveMode = config.interactiveMode || false;
  this.waitingForClarification = false;

  // Initialize subsystems
  this.sessionMemory = config.sessionMemory || createSessionMemory(config);
  this.episodicMemory = config.episodicMemory || createEpisodicMemory(config);
  this.preferenceSystem = config.preferenceSystem || null;
  this.diagnosticReflection = createDiagnosticReflection(config.llmClient, config.model);
  this.recoveryPlanner = createRecoveryPlanner(config.llmClient, config.model);
  this.patternLearner = createPatternLearner();
  this.taskPlanner = createTaskPlanner(config.llmClient, config.model);
  this.toolEffectiveness = createToolEffectivenessTracker(config.playgroundRoot);

  // Phase 6: Proactive planning subsystems
  this.alternativeGenerator = createAlternativeGenerator(config.llmClient, config.model);
  this.effortEstimator = createEffortEstimator(config.llmClient, config.model);
  this.planAlignmentChecker = createPlanAlignmentChecker(config.llmClient, config.model);

  // Phase 7: Multi-step lookahead
  this.taskGraphBuilder = createTaskGraphBuilder(config.llmClient, config.model);
  this.multiStepEvaluator = createMultiStepEvaluator(config.llmClient, config.model);
  this.outcomeTracker = createOutcomeTracker(config.playgroundRoot);
  this.weightLearner = createWeightLearner(config.playgroundRoot);

  // Enhanced self-evaluator
  this.selfEvaluator = new SelfEvaluator(/* ... */);

  // State tracking
  this.sessionId = null;
  this.state = null;
  this.stopRequested = false;
  this.terminationReason = null;
  this.startTime = null;

  // ... more initialization
}
```

**Add After Subsystem Initialization** (around line 160):
```javascript
// Orchestrator modules (delegated concerns)
this.llmClientModule = new LLMClient(
  config.llmClient,
  config.model,
  this.diagnosticReflection
);

this.memoryManagerModule = new MemoryManager({
  sessionMemory: this.sessionMemory,
  episodicMemory: this.episodicMemory,
  preferenceSystem: this.preferenceSystem,
  toolEffectiveness: this.toolEffectiveness,
  playgroundRoot: this.playgroundRoot,
});

this.toolHandlerModule = new ToolHandler({
  taskPlanner: this.taskPlanner,
});

this.reflectorModule = new Reflector({
  maxIterations: this.maxIterations,
  errorThreshold: this.errorThreshold,
  interactiveMode: this.interactiveMode,
});
```

---

### Step 3: Refactor run() Method - Memory Loading (lines 262-316)

**Current** (lines 262-316):
```javascript
// Load past learnings for this task type (successes + failures)
const taskType = this.detectTaskType(task);
this.pastLearnings = await this.sessionMemory.getSuccessfulPatterns(taskType);
this.pastFailures = await this.sessionMemory.getFailurePatterns(taskType);
this.learningGuidance = await this.sessionMemory.getGuidance(taskType);

if (this.pastLearnings.length > 0) {
  console.log(`[AutonomousAgent] Loaded ${this.pastLearnings.length} successful patterns for ${taskType} tasks`);
}
if (this.pastFailures.length > 0) {
  console.log(`[AutonomousAgent] Loaded ${this.pastFailures.length} failure patterns to avoid`);
}

// Load user preferences [Phase 5 Option D]
if (this.preferenceSystem) {
  try {
    this.userPreferenceGuidance = await this.preferenceSystem.generatePreferenceGuidance();
    if (this.userPreferenceGuidance && this.userPreferenceGuidance.trim().length > 0) {
      console.log('[AutonomousAgent] Loaded user preferences');
    }
  } catch (err) {
    console.warn('[AutonomousAgent] Failed to load user preferences:', err);
  }
}

// Search for relevant episodes using semantic similarity [Phase 5 Option A]
try {
  const similarEpisodes = await this.episodicMemory.searchSimilar(task, {
    limit: 3,
    minScore: 0.4,
    successOnly: true,
  });

  if (similarEpisodes.length > 0) {
    this.relevantEpisodes = similarEpisodes;
    console.log(`[AutonomousAgent] Found ${similarEpisodes.length} relevant episodes (scores: ${similarEpisodes.map(e => e.score.toFixed(2)).join(', ')})`);
  }
} catch (err) {
  console.warn('[AutonomousAgent] Failed to search episodes:', err);
}

// Load tool recommendations from historical data [Phase 3]
try {
  this.toolRecommendations = await this.toolEffectiveness.getRecommendations(taskType, {
    minSampleSize: 3,
    maxRecommendations: 5,
  });

  if (this.toolRecommendations.length > 0) {
    console.log(`[AutonomousAgent] Found ${this.toolRecommendations.length} tool recommendations for ${taskType} tasks`);
    console.log(`[AutonomousAgent] Top recommendation: ${this.toolRecommendations[0].tool} (${(this.toolRecommendations[0].successRate * 100).toFixed(0)}% success rate)`);
  }
} catch (err) {
  console.warn('[AutonomousAgent] Failed to load tool recommendations:', err);
}
```

**Replace With** (delegate to MemoryManager):
```javascript
// Load all memories via MemoryManager
const taskType = this.toolHandlerModule.detectTaskType(task);
const memories = await this.memoryManagerModule.loadAll(taskType, task);

// Unpack memories for backward compatibility
this.pastLearnings = memories.pastLearnings;
this.pastFailures = memories.pastFailures;
this.learningGuidance = memories.learningGuidance;
this.relevantEpisodes = memories.relevantEpisodes;
this.userPreferenceGuidance = memories.userPreferenceGuidance;
this.toolRecommendations = memories.toolRecommendations;
```

**Lines Saved**: ~54 lines → ~9 lines (45 lines saved)

---

### Step 4: Refactor reflect() Method (lines 1132-1239)

**Current** (lines 1132-1239):
```javascript
async reflect(context, executor) {
  const reflectionPrompt = this.buildReflectionPrompt(executor);

  try {
    const response = await this.llmClient.chat({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: REFLECTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: reflectionPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { /* ... */ },
    });

    const reflection = JSON.parse(response.choices[0].message.content);

    // Validate and sanitize
    const rawConfidence = Math.max(0, Math.min(1, reflection.confidence || 0));

    // Calibrate confidence using historical accuracy
    let calibratedConfidence = rawConfidence;
    let calibrationReason = '';
    if (this.selfEvaluator) {
      const calibration = this.selfEvaluator.calibrateConfidence(rawConfidence, {
        taskType: this.detectTaskType(this.state.task),
        tool: reflection.tool_plan?.tool,
      });
      calibratedConfidence = calibration.calibrated;
      calibrationReason = calibration.reason;

      if (Math.abs(calibration.adjustment) > 0.05) {
        console.log(`[AutonomousAgent] Confidence calibrated: ${(rawConfidence * 100).toFixed(0)}% → ${(calibratedConfidence * 100).toFixed(0)}% (${calibrationReason})`);
      }
    }

    return {
      assessment: reflection.assessment || 'continue',
      progress_percent: Math.max(0, Math.min(100, reflection.progress_percent || 0)),
      confidence: calibratedConfidence,
      rawConfidence,
      calibrationReason,
      next_action: reflection.next_action || 'Continue working on task',
      reasoning: reflection.reasoning || '',
      tool_plan: reflection.tool_plan,
    };

  } catch (error) {
    console.error('[AutonomousAgent] Reflection failed:', error);

    // Fallback: continue with generic action
    return {
      assessment: 'continue',
      progress_percent: this.state.lastProgressPercent || 0,
      confidence: 0.3,
      next_action: 'Continue working on the task',
      reasoning: 'Failed to generate reflection, continuing with default action',
    };
  }
}
```

**Replace With** (delegate to LLMClient):
```javascript
async reflect(context, executor) {
  // Build guidance object for LLM Client
  const guidance = {
    learningsText: this.learningGuidance || '',
    preferencesText: this.userPreferenceGuidance || '',
    episodesText: this.llmClientModule.buildEpisodesGuidance(this.relevantEpisodes || []),
    successPatternsText: this.reflectorModule.buildSuccessPatternsGuidance(this.successPatterns || []),
    metaReflectionText: this.reflectorModule.buildMetaReflectionGuidance(this.state.reflectionAccuracy || []),
    planningFeedbackText: this.reflectorModule.buildPlanningFeedbackGuidance(this.state.planningFeedback || []),
    toolRecommendationsText: this.llmClientModule.buildToolRecommendationsGuidance(
      this.toolRecommendations || [],
      this.toolHandlerModule.detectTaskType(this.state.task)
    ),
    selfEvalGuidance: this.selfEvaluator ? this.selfEvaluator.generateGuidance() : '',
    maxIterations: this.maxIterations,
  };

  // Delegate to LLM Client
  return await this.llmClientModule.reflect(
    this.state,
    executor,
    this.selfEvaluator,
    guidance
  );
}
```

**Lines Saved**: ~108 lines → ~23 lines (85 lines saved)

---

### Step 5: Update shouldStop() Method (lines 3282-3333)

**Current** (lines 3282-3333):
```javascript
shouldStop() {
  // Hard limits
  if (this.state.iteration >= this.maxIterations) {
    return { stop: true, reason: 'max_iterations' };
  }

  if (this.state.errors >= this.errorThreshold) {
    return { stop: true, reason: 'too_many_errors' };
  }

  // Self-assessment: Task complete
  if (this.state.taskComplete && this.state.confidence >= 0.9) {
    return {
      stop: true,
      reason: 'task_complete',
      confidence: this.state.confidence,
    };
  }

  // [Day 8 + Day 10] Repetitive action detection - with interactive mode option
  if (this.state.repetitiveActionDetected) {
    if (this.interactiveMode && !this.waitingForClarification) {
      return { stop: false, needsClarification: true, reason: 'repetitive_actions' };
    }
    return { stop: true, reason: 'repetitive_actions' };
  }

  // ... more stopping criteria

  return { stop: false };
}
```

**Replace With** (delegate to Reflector):
```javascript
shouldStop() {
  return this.reflectorModule.shouldStop(this.state, this.waitingForClarification);
}
```

**Lines Saved**: ~52 lines → ~3 lines (49 lines saved)

---

### Step 6: Update complete() Method (lines 3363-3444)

**Current** (lines 3363-3444):
```javascript
async complete(reason, context) {
  const summary = this.generateSummary(reason);

  // Record session to memory for learning
  const taskType = this.detectTaskType(this.state.task);
  const toolsUsed = [...new Set(this.state.history.flatMap(h => h.tools_used || []))];

  // ... recovery attempts and error patterns extraction

  // [Day 10] Enhanced session recording with failure details
  await this.sessionMemory.recordSession({
    task_type: taskType,
    success: reason === 'task_complete',
    iterations: this.state.iteration,
    tools_used: toolsUsed,
    strategy: this.generateStrategyDescription(),
    confidence: this.state.confidence,
    task: this.state.task,
    failure_reason: reason !== 'task_complete' ? reason : null,
    failed_tools: this.state.recentFailures.map(f => f.tool),
    repetitive_actions: this.state.repetitiveActionDetected,
    error_count: this.state.errors,
    recovery_attempts: recoveryAttempts,
    error_patterns: errorPatterns,
  });

  // [Phase 5 Option A] Record episode to episodic memory for semantic search
  await this.episodicMemory.recordEpisode({
    task: this.state.task,
    task_type: taskType,
    completed: reason === 'task_complete',
    iterations: this.state.iteration,
    tools_used: toolsUsed,
    strategy: this.generateStrategyDescription(),
    history: this.state.history,
    artifacts: this.state.artifacts,
    summary,
    confidence: this.state.confidence,
    failure_reason: reason !== 'task_complete' ? reason : null,
    error_count: this.state.errors,
    error_recoveries: recoveryAttempts,
    error_categories_encountered: errorPatterns,
  });

  await contextLogEvents.emit({ /* ... */ });

  console.log(`[AutonomousAgent] Session complete: ${reason}`);
  console.log(summary);
}
```

**Replace With** (delegate to MemoryManager and Reflector):
```javascript
async complete(reason, context) {
  const summary = this.reflectorModule.generateSummary(this.state, reason);
  const taskType = this.toolHandlerModule.detectTaskType(this.state.task);
  const toolsUsed = [...new Set(this.state.history.flatMap(h => h.tools_used || []))];

  // Extract recovery attempts and error patterns
  const recoveryAttempts = this.state.recentFailures
    .filter(f => f.recoveryAttempted && f.diagnosis)
    .map(f => ({
      error_category: f.diagnosis.rootCause?.category || 'unknown',
      strategy_name: 'unknown',
      recovery_succeeded: f.recoverySucceeded || false,
      iterations_to_success: f.recoverySucceeded ? 1 : null,
      tools_used: [],
      confidence: f.diagnosis.rootCause?.confidence || 0,
    }));

  const errorPatterns = {};
  for (const failure of this.state.recentFailures) {
    if (failure.diagnosis?.rootCause?.category) {
      const category = failure.diagnosis.rootCause.category;
      errorPatterns[category] = (errorPatterns[category] || 0) + 1;
    }
  }

  // Delegate memory recording to MemoryManager
  await this.memoryManagerModule.recordSession(taskType, {
    task_type: taskType,
    success: reason === 'task_complete',
    iterations: this.state.iteration,
    tools_used: toolsUsed,
    strategy: this.generateStrategyDescription(),
    confidence: this.state.confidence,
    task: this.state.task,
    failure_reason: reason !== 'task_complete' ? reason : null,
    failed_tools: this.state.recentFailures.map(f => f.tool),
    repetitive_actions: this.state.repetitiveActionDetected,
    error_count: this.state.errors,
    recovery_attempts: recoveryAttempts,
    error_patterns: errorPatterns,
    summary,
    history: this.state.history,
    artifacts: this.state.artifacts,
  });

  // Emit completion event
  await contextLogEvents.emit({
    id: ulid(),
    type: 'autonomous_session_complete',
    ts: new Date().toISOString(),
    conv_id: context.convId,
    turn_id: context.turnId,
    session_id: this.sessionId,
    actor: 'system',
    act: 'autonomous_complete',
    reason,
    iterations: this.state.iteration,
    confidence: this.state.confidence,
    summary,
  });

  console.log(`[AutonomousAgent] Session complete: ${reason}`);
  console.log(summary);
}
```

**Lines Saved**: ~82 lines → ~65 lines (17 lines saved)

---

### Step 7: Update buildResult() Method (lines 3528-3543)

**Current** (lines 3528-3543):
```javascript
buildResult(reason) {
  return {
    completed: reason === 'task_complete',
    reason,
    iterations: this.state.iteration,
    confidence: this.state.confidence,
    history: this.state.history,
    artifacts: this.state.artifacts,
    summary: this.generateSummary(reason),
    state: {
      progress_percent: this.state.lastProgressPercent,
      errors: this.state.errors,
      reflections: this.state.reflections,
    },
  };
}
```

**Replace With** (delegate to Reflector):
```javascript
buildResult(reason) {
  return this.reflectorModule.buildResult(this.state, reason);
}
```

**Lines Saved**: ~16 lines → ~3 lines (13 lines saved)

---

### Step 8: Update Checkpoint Methods (lines 3594-3653)

**Current** (lines 3594-3629 saveCheckpoint, lines 3638-3653 loadCheckpoint):
```javascript
async saveCheckpoint(checkpointId = null) {
  const id = checkpointId || this.sessionId;
  const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${id}.json`);

  const checkpoint = {
    version: '1.0',
    sessionId: this.sessionId,
    timestamp: new Date().toISOString(),
    task: this.state.task,
    state: { /* ... */ },
    config: { /* ... */ },
  };

  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
  console.log(`[AutonomousAgent] Checkpoint saved: ${checkpointPath}`);

  return checkpointPath;
}

async loadCheckpoint(checkpointId) {
  const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${checkpointId}.json`);

  try {
    const content = await fs.readFile(checkpointPath, 'utf8');
    const checkpoint = JSON.parse(content);

    console.log(`[AutonomousAgent] Checkpoint loaded: ${checkpointPath}`);
    console.log(`[AutonomousAgent] Resume from iteration ${checkpoint.state.iteration}`);

    return checkpoint;
  } catch (error) {
    console.error(`[AutonomousAgent] Failed to load checkpoint:`, error);
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }
}
```

**Replace With** (delegate to MemoryManager):
```javascript
async saveCheckpoint(checkpointId = null) {
  return await this.memoryManagerModule.saveCheckpoint(
    this.sessionId,
    this.state,
    {
      maxIterations: this.maxIterations,
      checkpointInterval: this.checkpointInterval,
      errorThreshold: this.errorThreshold,
      model: this.model,
    },
    checkpointId
  );
}

async loadCheckpoint(checkpointId) {
  return await this.memoryManagerModule.loadCheckpoint(checkpointId);
}
```

**Lines Saved**: ~51 lines → ~18 lines (33 lines saved)

---

### Step 9: Remove Extracted Methods

**Delete These Methods** (they're now in orchestrator modules):

#### From LLMClient (llm-client.mjs):
- `buildReflectionPrompt()` (lines 2378-2534) - 156 lines
- `buildFailureWarnings()` (lines 2542-2596) - 54 lines
- `buildRepetitionWarning()` (lines 2604-2629) - 25 lines
- `buildSuccessPatternsGuidance()` (lines 2718-2736) - 18 lines
- `buildMetaReflectionGuidance()` (lines 2879-2925) - 46 lines
- `buildPlanningFeedbackGuidance()` (lines 3005-3044) - 39 lines
- `buildToolRecommendationsGuidance()` (lines 3052-3098) - 46 lines
- `buildEpisodesGuidance()` (lines 3106-3130) - 24 lines
- `formatPastLearnings()` (lines 3138-3164) - 26 lines
- `getTaskTypeGuidance()` (lines 3227-3275) - 48 lines
- `runDiagnosticReflection()` (lines 2318-2370) - 52 lines

**Subtotal**: ~534 lines

#### From ToolHandler (tool-handler.mjs):
- `planExecution()` (lines 1744-1762) - 18 lines
- `buildToolsList()` (lines 1771-1781) - 10 lines
- `convertInstructionsToPlan()` (lines 1790-1804) - 14 lines
- `inferToolsFromAction()` (lines 1815-2000) - 185 lines
- `extractFilePattern()` (lines 2017-2030) - 13 lines
- `extractSearchTerm()` (lines 2038-2051) - 13 lines
- `generateInitialContent()` (lines 2059-2079) - 20 lines
- `inferTestCommand()` (lines 2087-2108) - 21 lines
- `inferToolArgs()` (lines 2117-2257) - 140 lines
- `extractKeywords()` (lines 2266-2306) - 40 lines
- `detectTaskType()` (lines 3172-3219) - 47 lines

**Subtotal**: ~521 lines

#### From Reflector (reflector.mjs):
- `scoreReflectionAccuracy()` (lines 2746-2794) - 48 lines
- `metaReflect()` (lines 2805-2871) - 66 lines
- `scorePlanningAccuracy()` (lines 2935-2997) - 62 lines
- `generateSummary()` (lines 3485-3520) - 35 lines
- `getProgressSummary()` (lines 3465-3477) - 12 lines
- `generateStrategyDescription()` (lines 3451-3458) - 7 lines

**Subtotal**: ~230 lines

#### Constants:
- `REFLECTION_SYSTEM_PROMPT` (lines 3871-3919) - 48 lines (moved to llm-client.mjs)

**Total Lines to Delete**: ~1,333 lines

**Total Lines Saved from Delegations**: ~245 lines (from Steps 3-8)

**Expected Final Size**: 3,937 - 1,333 - 245 = **~2,359 lines**

---

## Expected Final File Structure

```javascript
// autonomous.mjs (refactored, ~2,359 lines)

// Imports (add 4 new module imports)
import { LLMClient } from './orchestrator/llm-client.mjs';
import { MemoryManager } from './orchestrator/memory-manager.mjs';
import { ToolHandler } from './orchestrator/tool-handler.mjs';
import { Reflector } from './orchestrator/reflector.mjs';
// ... existing imports

export class AutonomousAgent {
  constructor(config) {
    // Initialize 15+ subsystems (unchanged)
    // ... existing subsystems

    // NEW: Initialize 4 orchestrator modules
    this.llmClientModule = new LLMClient(/*...*/);
    this.memoryManagerModule = new MemoryManager(/*...*/);
    this.toolHandlerModule = new ToolHandler(/*...*/);
    this.reflectorModule = new Reflector(/*...*/);
  }

  async run(task, executor, context) {
    // Memory loading → Delegate to memoryManagerModule.loadAll()
    const memories = await this.memoryManagerModule.loadAll(taskType, task);

    // Main loop (unchanged - complex Phase 6/7 orchestration)
    while (true) {
      // Reflection → Delegate to llmClientModule.reflect()
      const reflection = await this.reflect(context, executor);

      // Phase 6.1-6.5: Alternative generation (unchanged)
      // Phase 7.1-7.4: Multi-step lookahead (unchanged)

      // Execution → Uses toolHandlerModule internally
      const result = await this.executeIteration(reflection, executor, context);

      // Stopping criteria → Delegate to reflectorModule.shouldStop()
      const stopCheck = this.shouldStop();
      if (stopCheck.stop) break;
    }

    // Completion → Delegate to memoryManagerModule.recordSession()
    await this.complete(reason, context);

    // Result → Delegate to reflectorModule.buildResult()
    return this.buildResult(reason);
  }

  async reflect(context, executor) {
    // Build guidance object
    // Delegate to llmClientModule.reflect()
  }

  shouldStop() {
    // Delegate to reflectorModule.shouldStop()
  }

  buildResult(reason) {
    // Delegate to reflectorModule.buildResult()
  }

  async complete(reason, context) {
    // Delegate to memoryManagerModule.recordSession()
  }

  async saveCheckpoint(checkpointId) {
    // Delegate to memoryManagerModule.saveCheckpoint()
  }

  async loadCheckpoint(checkpointId) {
    // Delegate to memoryManagerModule.loadCheckpoint()
  }

  // executeIteration() - KEEP (uses toolHandlerModule internally)
  // All Phase 6/7 methods - KEEP (complex orchestration)
  // All progress tracking methods - KEEP
  // All event logging methods - KEEP

  // DELETED: All extracted methods (~1,333 lines)
}
```

---

## Testing Strategy

### Before Changes
1. Run existing test suite to establish baseline:
   ```bash
   npm --prefix frontend run test -- --testPathPattern=autonomous
   ```
2. Document current pass rate

### After Changes
1. Run same test suite
2. Verify 100% pass rate (no regressions)
3. If failures occur:
   - Check delegation signatures match
   - Verify guidance object has all required fields
   - Check state is passed correctly
   - Debug with console.log in modules

### Integration Tests
1. Test full autonomous run end-to-end
2. Test checkpointing (save/load)
3. Test all 7 phases work correctly
4. Test memory loading/saving
5. Test tool inference still works

---

## Rollback Plan

If integration introduces issues:

1. **Immediate**: Restore from backup
   ```bash
   cp frontend/core/agent/autonomous.mjs.backup frontend/core/agent/autonomous.mjs
   ```
2. **Debug**: Identify specific issue
3. **Fix**: Address in isolated changes
4. **Validate**: Test each fix
5. **Retry**: Merge when validated

---

## Success Criteria

✅ File reduced from 3,937 → ~2,359 lines (40% reduction)
✅ All existing tests pass (no regressions)
✅ Autonomous agent 7 phases work identically
✅ Memory systems load/save correctly
✅ Tool inference works same as before
✅ Checkpointing works correctly
✅ Code is more maintainable (clear delegation)

---

## Next Session Checklist

1. [ ] Review this integration guide
2. [ ] Make changes step-by-step (Steps 1-9)
3. [ ] Test after each major step
4. [ ] Run full test suite
5. [ ] Fix any regressions
6. [ ] Update documentation
7. [ ] Create completion report

---

**Estimated Time**: 2-3 hours
**Risk Level**: Medium (careful delegation required)
**Backup Available**: ✅ `autonomous.mjs.backup`

---

**Created**: 2025-12-15
**Purpose**: Safe integration of extracted orchestrator modules
**Status**: Ready for implementation
