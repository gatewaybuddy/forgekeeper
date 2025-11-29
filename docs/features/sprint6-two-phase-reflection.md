# Sprint 6: Two-Phase Mode & Reflection Pass

**Status**: ✅ Complete
**Date**: 2025-11-23
**Dependencies**: M2 (Self-Review & Chunked Reasoning)

## Overview

Sprint 6 introduces two advanced reasoning features that enhance response quality and provide better control over high-stakes operations:

1. **Two-Phase Harmony Mode**: Separates analysis/planning from execution
2. **Reflection Pass**: Post-generation self-critique and correction

---

## 1. Two-Phase Harmony Mode

### Purpose

Provides explicit control over high-stakes or complex operations by separating the planning phase from the execution phase. Users can review and edit the plan before allowing execution.

### Use Cases

- **High-Stakes Changes**: Production deployments, database migrations, large refactors
- **Complex Operations**: Multi-file changes, architectural restructuring
- **Learning Mode**: See the plan before execution to understand the approach
- **Safety-Critical**: Review before executing potentially destructive operations

### How It Works

#### Phase 1: Analysis & Planning

1. User submits request (or auto-detected as high-stakes)
2. System generates detailed plan WITHOUT executing any tools
3. Plan includes:
   - Understanding of the request
   - High-level approach/strategy
   - Detailed numbered steps
   - Risks & considerations
   - Expected outcome
4. **System halts** and presents plan to user

#### Phase 2: Execution

1. User reviews the plan
2. User can optionally **edit** the plan
3. User approves (or cancels)
4. System executes based on approved plan with full tool access
5. Reports progress as each step completes

### Configuration

```bash
# Enable two-phase mode
FRONTEND_ENABLE_TWO_PHASE=1

# Auto-detect high-stakes operations
FRONTEND_AUTO_TWO_PHASE=1

# Confidence threshold for auto-detection (0.0-1.0)
FRONTEND_AUTO_TWO_PHASE_THRESHOLD=0.6

# Token budgets
FRONTEND_TWO_PHASE_ANALYSIS_TOKENS=4096  # Phase 1
FRONTEND_TWO_PHASE_EXECUTION_TOKENS=8192 # Phase 2

# Allow plan editing before execution
FRONTEND_TWO_PHASE_ALLOW_EDIT=1
```

### Auto-Detection Heuristics

Two-phase mode is automatically triggered when the request contains:

**High-Stakes Operations** (confidence +0.4):
- Keywords: `production`, `deploy`, `critical`, `refactor`, `rewrite`, `migrate`
- Destructive: `delete database`, `drop table`, `remove all`

**Complex Operations** (confidence +0.3):
- Keywords: `multiple files`, `large change`, `entire codebase`, `whole system`

**Explicit Plan Requests** (confidence +0.5):
- Keywords: `show me a plan`, `what would you do`, `explain your approach`
- Phrases: `before you start`, `step-by-step plan`

**Context Signals** (confidence +0.2):
- Previous incomplete response or errors

**Threshold**: Default 0.6 means at least two signals must be present.

### Example Usage

#### Manual Mode

```javascript
import { orchestrateTwoPhase } from './server.two-phase.mjs';

// Phase 1: Generate plan
const phase1Result = await orchestrateTwoPhase({
  baseUrl: 'http://localhost:8001/v1',
  model: 'harmony-20b',
  messages: [
    { role: 'user', content: 'Refactor the authentication module for production' }
  ],
  phase: 1,
  tools: availableTools,
});

console.log(phase1Result.plan);
// User reviews plan, possibly edits it

// Phase 2: Execute approved plan
const phase2Result = await orchestrateTwoPhase({
  baseUrl: 'http://localhost:8001/v1',
  model: 'harmony-20b',
  messages: originalMessages,
  phase: 2,
  approvedPlan: phase1Result.plan,
  planEdits: userEditedPlan || null, // Optional
  tools: availableTools,
});

console.log(phase2Result.content);
```

#### UI Component

```tsx
import PlanApprovalModal from './components/PlanApprovalModal';

<PlanApprovalModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  plan={phase1Result.plan}
  reasoning={phase1Result.reasoning}
  onApprove={(editedPlan) => {
    // Execute Phase 2 with approved plan
    executePhase2(editedPlan);
  }}
  onCancel={() => {
    // Abort operation
    setShowModal(false);
  }}
  loading={phase2Loading}
/>
```

### API

#### `orchestrateTwoPhase(options)`

**Options**:
- `baseUrl` (string): LLM API base URL
- `model` (string): Model name
- `messages` (array): Conversation messages
- `tools` (array): Available tools
- `phase` (number): `1` for analysis, `2` for execution
- `approvedPlan` (string): Required for Phase 2
- `planEdits` (string|null): Optional edited plan
- `maxTokens` (number): Token budget
- `traceId`, `convId`: Logging IDs

**Returns** (Phase 1):
```javascript
{
  phase: 1,
  plan: "**Understanding**: ...\n**Approach**: ...",
  reasoning: "Internal analysis...",
  status: "awaiting_approval",
  elapsed_ms: 2500,
  debug: { ... }
}
```

**Returns** (Phase 2):
```javascript
{
  phase: 2,
  content: "Execution completed. Changes made: ...",
  reasoning: null,
  status: "completed",
  elapsed_ms: 8200,
  debug: { ... }
}
```

#### `detectTwoPhaseMode(userMessage, context)`

Auto-detects if two-phase mode should be used.

**Returns**:
```javascript
{
  shouldUse: true,
  confidence: 0.9,
  matches: [
    { pattern: '/\\b(production|deploy)\\b/i', category: 'highStakes', weight: 0.4 },
    { pattern: '/\\b(refactor|rewrite)\\b/i', category: 'highStakes', weight: 0.4 }
  ],
  reason: "High-stakes or complex operation detected (confidence: 0.90)"
}
```

---

## 2. Reflection Pass

### Purpose

Improves response quality through a lightweight post-generation self-critique and correction cycle. Catches obvious errors before returning to the user.

### Use Cases

- **Quick Quality Check**: Catch factual errors, incomplete answers
- **Clarity Improvement**: Fix unclear wording or explanations
- **Completeness Validation**: Ensure response addresses all parts of the question
- **Cost-Effective**: Uses small token budget (256 + 512 tokens)

### How It Works

1. **Generate Initial Response**: Standard orchestration with tools
2. **Reflection Critique** (256 tokens):
   - Run quick self-evaluation against checklist
   - Assess: "PASS" or "NEEDS CORRECTION"
   - Provide confidence score (0.0-1.0)
   - Identify specific issues (if any)
3. **Apply Corrections** (512 tokens, if needed):
   - Only if critique says "NEEDS CORRECTION"
   - Only if confidence >= threshold (default 0.6)
   - Generate corrected version addressing issues
   - Keep changes minimal and focused
4. **Log Everything**: ContextLog records critique + correction

### Configuration

```bash
# Enable reflection pass
FRONTEND_REFLECTION_ENABLED=1

# Token budgets (keep low for speed)
FRONTEND_REFLECTION_CRITIQUE_TOKENS=256
FRONTEND_REFLECTION_CORRECTION_TOKENS=512

# Minimum confidence to apply corrections
FRONTEND_REFLECTION_MIN_CONFIDENCE=0.6

# Maximum reflection iterations
FRONTEND_REFLECTION_MAX_ITER=1
```

### Default Checklist

The reflection critique evaluates against:

1. **Accuracy**: Is the answer factually correct?
2. **Completeness**: Does it fully address what the user asked?
3. **Clarity**: Is it clear and easy to understand?
4. **Errors**: Are there obvious errors or inconsistencies?
5. **Truncation**: Is the response complete (not cut off)?

### Example Usage

```javascript
import { runReflectionPass } from './server.reflection.mjs';

const initialResponse = "React is a library...";

const reflectionResult = await runReflectionPass({
  userQuestion: "What is React?",
  generatedResponse: initialResponse,
  baseUrl: 'http://localhost:8001/v1',
  model: 'harmony-20b',
  callUpstreamFn: callUpstream,
  appendEventFn: appendContextLog,
  traceId: 'trace-123',
  convId: 'conv-456',
});

if (reflectionResult.correctionApplied) {
  console.log("Correction applied:");
  console.log("Original:", reflectionResult.originalResponse);
  console.log("Corrected:", reflectionResult.finalResponse);
  console.log("Critique:", reflectionResult.critique.explanation);
} else {
  console.log("No correction needed (passed reflection)");
}
```

### API

#### `runReflectionPass(options)`

**Options**:
- `userQuestion` (string): Original user question
- `generatedResponse` (string): Response to reflect on
- `baseUrl`, `model`: LLM connection
- `callUpstreamFn` (function): Function to call LLM
- `appendEventFn` (function): ContextLog append function
- `traceId`, `convId`: Logging IDs
- `context` (object): Additional context (e.g., `{ reviewMode: true }`)

**Returns**:
```javascript
{
  reflected: true,
  critique: {
    assessment: "NEEDS CORRECTION",
    needsCorrection: true,
    confidence: 0.85,
    explanation: "Missing error handling explanation"
  },
  correctionApplied: true,
  originalResponse: "...",
  finalResponse: "... (corrected version) ...",
  elapsed_ms: 450
}
```

Or if no correction needed:
```javascript
{
  reflected: true,
  critique: {
    assessment: "PASS",
    needsCorrection: false,
    confidence: 0.9,
    explanation: null
  },
  correctionApplied: false,
  finalResponse: "... (original) ...",
  elapsed_ms: 200
}
```

Or if skipped:
```javascript
{
  skipped: true,
  reason: "Response too short or not applicable",
  finalResponse: "... (original) ..."
}
```

#### `shouldSkipReflection(response, context)`

Determines if reflection should be skipped.

**Skip Conditions**:
- Response < 50 characters (acknowledgments, errors)
- Tool-only responses (no human-facing content)
- Already went through review mode (avoid double-checking)
- Response is just an error message

#### `parseReflectionCritique(critiqueText)`

Parses LLM critique response into structured data.

**Returns**:
```javascript
{
  assessment: "PASS" | "NEEDS CORRECTION" | "UNKNOWN",
  needsCorrection: true|false,
  confidence: 0.85,
  explanation: "Brief explanation of issues"
}
```

---

## Integration with Orchestrator

### Two-Phase Mode

Two-phase mode is invoked from the main `/api/chat` endpoint when:
1. User explicitly requests two-phase mode via UI toggle
2. Auto-detection heuristics determine high-stakes operation (when enabled)

Flow:
```
User Request → Detect Two-Phase → Phase 1 → User Review → Phase 2 → Response
```

### Reflection Pass

Reflection pass is applied AFTER standard orchestration completes:

```javascript
import { orchestrateWithTools } from './server.orchestrator.mjs';
import { applyReflectionToOrchestration } from './server.reflection.mjs';

// 1. Standard orchestration
const result = await orchestrateWithTools({ ... });

// 2. Apply reflection if enabled
if (isReflectionEnabled()) {
  const reflected = await applyReflectionToOrchestration(result, {
    userQuestion: lastUserMessage,
    baseUrl,
    model,
    callUpstreamFn: callUpstream,
    appendEventFn,
    traceId,
    convId,
  });
  return reflected;
}

return result;
```

---

## ContextLog Events

### Two-Phase Mode

**Phase 1 Start**:
```json
{
  "timestamp": "2025-11-23T12:00:00.000Z",
  "actor": "system",
  "act": "two_phase_phase1_start",
  "trace_id": "trace-123",
  "conv_id": "conv-456"
}
```

**Phase 1 Complete**:
```json
{
  "timestamp": "2025-11-23T12:00:02.500Z",
  "actor": "system",
  "act": "two_phase_phase1_complete",
  "status": "awaiting_approval",
  "plan_length": 1250,
  "elapsed_ms": 2500,
  "trace_id": "trace-123",
  "conv_id": "conv-456"
}
```

**Phase 2 Complete**:
```json
{
  "timestamp": "2025-11-23T12:01:00.000Z",
  "actor": "system",
  "act": "two_phase_phase2_complete",
  "status": "completed",
  "plan_edited": true,
  "tools_used": 5,
  "elapsed_ms": 8200,
  "trace_id": "trace-123",
  "conv_id": "conv-456"
}
```

### Reflection Pass

**Critique**:
```json
{
  "timestamp": "2025-11-23T12:00:00.150Z",
  "actor": "system",
  "act": "reflection_critique",
  "assessment": "NEEDS CORRECTION",
  "needs_correction": true,
  "confidence": 0.85,
  "explanation": "Missing error handling details",
  "elapsed_ms": 150,
  "trace_id": "trace-123",
  "conv_id": "conv-456"
}
```

**Correction**:
```json
{
  "timestamp": "2025-11-23T12:00:00.400Z",
  "actor": "system",
  "act": "reflection_correction",
  "applied": true,
  "original_length": 450,
  "corrected_length": 520,
  "elapsed_ms": 250,
  "trace_id": "trace-123",
  "conv_id": "conv-456"
}
```

---

## Testing

### Two-Phase Mode Tests

**File**: `frontend/test/two-phase.test.mjs` (44 tests)

**Coverage**:
- Configuration and feature flags
- Auto-detection heuristics (high-stakes, complex, explicit, context)
- Phase 1: Analysis prompt generation
- Phase 2: Execution with approved plan
- Plan editing workflow
- Combined orchestration
- Edge cases (empty plan, missing reasoning)

**Run Tests**:
```bash
npm --prefix forgekeeper/frontend test two-phase
```

### Reflection Pass Tests

**File**: `frontend/test/reflection.test.mjs` (40 tests)

**Coverage**:
- Configuration and feature flags
- Critique prompt building
- Correction prompt building
- Critique parsing (PASS, NEEDS CORRECTION, confidence)
- Content extraction (code fences, plain text)
- Skip conditions (short responses, tool-only, errors)
- ContextLog event creation
- Edge cases (malformed scores, conflicting signals)

**Run Tests**:
```bash
npm --prefix forgekeeper/frontend test reflection
```

**All Tests**:
```bash
npm --prefix forgekeeper/frontend test
```

---

## Performance Impact

### Two-Phase Mode

- **Phase 1**: +2-4s (no tools, analysis only)
- **Phase 2**: Standard orchestration time
- **Total**: Phase 1 + user review + Phase 2
- **Latency**: User-controlled (depends on review time)

**Note**: Total latency increases, but provides explicit control point.

### Reflection Pass

- **Critique**: ~150-300ms (256 tokens, small model)
- **Correction**: ~250-500ms (512 tokens, only if needed)
- **Total**: ~200-800ms depending on correction
- **Cost**: Minimal (<1000 tokens total)

**Note**: Small latency increase for significant quality improvement.

---

## Best Practices

### Two-Phase Mode

1. **Enable Auto-Detection**: Let the system detect high-stakes operations
2. **Lower Threshold for Critical Systems**: Set `FRONTEND_AUTO_TWO_PHASE_THRESHOLD=0.4` for tighter control
3. **Allow Plan Editing**: Keep `FRONTEND_TWO_PHASE_ALLOW_EDIT=1` for maximum flexibility
4. **Use for Learning**: Great for understanding how the system approaches problems

### Reflection Pass

1. **Enable by Default**: Low cost, high value for quality improvement
2. **Keep Token Budgets Low**: 256/512 tokens is sufficient for most cases
3. **Adjust Confidence Threshold**: Increase to 0.7-0.8 if too many corrections applied
4. **Monitor ContextLog**: Review reflection events to tune heuristics
5. **Disable for Review Mode**: Reflection skips when review mode already active

---

## Future Enhancements

### Two-Phase Mode

- **Multi-Phase**: Support 3+ phases for very complex operations
- **Rollback**: Ability to roll back Phase 2 if issues detected
- **Checkpoints**: Progress checkpoints during Phase 2 execution
- **Plan Diff**: Visual diff when user edits plan

### Reflection Pass

- **Model Switching**: Use fast model for critique, better model for correction
- **Iterative Refinement**: Multiple reflection passes (currently max 1)
- **Custom Checklists**: Per-domain reflection criteria (code, docs, etc.)
- **Confidence Calibration**: Learn optimal thresholds from user feedback

---

## References

- **Implementation**: `frontend/server.two-phase.mjs`, `frontend/server.reflection.mjs`
- **Configuration**: `frontend/config/reflection_prompts.mjs`
- **UI Component**: `frontend/src/components/PlanApprovalModal.tsx`
- **Tests**: `frontend/test/two-phase.test.mjs`, `frontend/test/reflection.test.mjs`
- **Planning**: `NEXT_FEATURES_PLAN.md` (Sprint 6)
- **Environment**: `.env.example` (lines 259-285)

---

**Last Updated**: 2025-11-23
**Sprint**: 6
**Status**: ✅ Complete
