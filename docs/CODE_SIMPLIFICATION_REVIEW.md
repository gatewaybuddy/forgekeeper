# Code Simplification Review

**Date**: 2026-02-03
**Branch**: `claude/review-code-simplification-4y5kd`
**Status**: Findings documented

## Executive Summary

This review identifies code redundancy, inconsistencies, and overly complex hard-coded heuristics that could be simplified using LLM calls. The codebase has accumulated significant technical debt in pattern-matching logic that an LLM could handle more robustly.

---

## 1. Duplicated Code (High Priority)

### 1.1 `isGptOssModel` Function - Duplicated 4+ Times

**Found in:**
- `frontend/server/orchestration/orchestrator.mjs:8-13`
- `frontend/server/orchestration/review.mjs`
- `frontend/server/orchestration/chunked.mjs`
- `frontend/server/orchestration/combined.mjs`

```javascript
// Identical function in 4 files
function isGptOssModel(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('gpt-oss') || n.includes('gpt_oss') ||
         n.includes('gptoss') || n.includes('oss-') || n.includes('harmony');
}
```

**Recommendation**: Extract to `frontend/utils/models.mjs`

### 1.2 `isIncomplete` Function - Duplicated with Inconsistent Logic

**Version 1** (`orchestrator.mjs:15-27`):
```javascript
function isIncomplete(text) {
  if (t.length < 32) return true;  // Has length check
  if (!'.!?'.includes(last)) return true;  // Only 3 terminal chars
}
```

**Version 2** (`finishers.mjs:3-23`):
```javascript
function isProbablyIncomplete(text) {
  // No length check
  const terminalSet = new Set([
    '.', '!', '?', '…', '"', '\'', '"', ''', '›', '»',
    '}', ']', ')', '`', '。', '！', '？'  // 17 terminal chars
  ]);
}
```

**Bug Risk**: Different behavior between versions. The `finishers.mjs` version handles more cases correctly.

**Recommendation**: Standardize on `finishers.mjs` implementation everywhere.

---

## 2. Hard-Coded Heuristics → LLM Classification

### 2.1 Mode Detection (`heuristics.mjs`) - 297 Lines of Regex

**Current approach**: 150+ regex patterns to detect question complexity:

```javascript
const CHUNKED_PATTERNS = {
  comprehensive: [
    /comprehensive\s+(analysis|overview|guide|explanation)/i,
    /in\s+detail/i,
    /detailed\s+(analysis|explanation|guide)/i,
    /step[\s-]*by[\s-]*step/i,
    // ... 20+ more patterns
  ],
  multiPart: [
    /explain\s+.+\s+and\s+.+\s+and/i,
    /compare\s+.+\s+(?:and|with|to)/i,
    // ... more patterns
  ],
};
```

**Problems**:
1. Fragile - natural language has infinite variations
2. Incomplete - misses synonyms ("thorough" vs "comprehensive")
3. Hard to maintain - adding new patterns is error-prone
4. False positives/negatives from rigid pattern matching

**Recommended replacement** - Single LLM call:

```javascript
export async function classifyOrchestrationMode(question) {
  const response = await callUpstream({
    baseUrl: process.env.FK_CORE_API_BASE,
    model: process.env.FRONTEND_VLLM_MODEL,
    messages: [{
      role: 'system',
      content: `Classify the user's question complexity. Return JSON only.

Categories:
- "standard": Simple questions, direct answers
- "chunked": Multi-part analysis, tutorials, comprehensive guides
- "review": High-stakes, accuracy-critical, technical validation

JSON format: {"mode": "standard|chunked|review", "confidence": 0.0-1.0, "reason": "brief explanation"}`
    }, {
      role: 'user',
      content: question
    }],
    maxTokens: 100,
    temperature: 0
  });

  return JSON.parse(extractContent(response.choices[0].message.content));
}
```

**Benefits**:
- Handles synonyms and paraphrasing naturally
- Reduces 300 lines to ~20 lines
- More accurate classification
- Self-documenting through the prompt

### 2.2 Tool Inference (`tool-handler.mjs:166-359`) - 200+ Lines of Pattern Matching

**Current approach**:
```javascript
inferToolsFromAction(action, state) {
  const lower = actionStr.toLowerCase();

  if (lower.includes('explore') || lower.includes('analyze codebase')) {
    steps.push({ tool: 'read_dir', args: { path: '.' } });
  }
  if (lower.includes('find all') || lower.includes('locate')) {
    const filePattern = this.extractFilePattern(action);
    // ...
  }
  if (lower.includes('search for') || lower.includes('grep')) {
    // ...
  }
  // ... 200+ more lines
}
```

**Problems**:
1. "find all" works but "discover all" or "identify all" doesn't
2. Order-dependent logic (first matching pattern wins)
3. Complex argument extraction with regex
4. Hard to add new tools without breaking existing logic

**Recommended replacement**:

```javascript
async selectToolsForAction(action, availableTools) {
  const response = await callUpstream({
    messages: [{
      role: 'system',
      content: `Select the best tool(s) for this action. Return JSON only.

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

JSON format: {"tools": [{"name": "tool_name", "args": {...}, "purpose": "why"}]}`
    }, {
      role: 'user',
      content: action
    }],
    maxTokens: 200,
    temperature: 0
  });

  return JSON.parse(extractContent(response.choices[0].message.content));
}
```

### 2.3 Task Type Detection (`tool-handler.mjs:638-685`)

**Current approach**:
```javascript
detectTaskType(task) {
  const exploratoryPatterns = [
    /see\s+if/i,
    /check\s+(whether|if)/i,
    /find\s+out/i,
    /look\s+(for|in)/i,
    // ... more patterns
  ];

  if (exploratoryPatterns.some(p => p.test(task))) return 'exploratory';
  if (lower.includes('readme') || lower.includes('documentation')) return 'documentation';
  // ... more categories
}
```

**This is exactly what LLMs excel at** - understanding semantic intent.

---

## 3. Architectural Recommendations

### 3.1 Create Utility Module

Extract duplicated functions:

```
frontend/utils/
├── models.mjs        # isGptOssModel, isHarmonyModel, requiresHarmony
├── completeness.mjs  # isProbablyIncomplete, incompleteReason (from finishers.mjs)
├── json.mjs          # safeJsonParse (duplicated 69+ times in codebase)
└── config.mjs        # Centralized config loading with defaults
```

### 3.2 Create Classification Service

```javascript
// frontend/server/classification/index.mjs
export { classifyOrchestrationMode } from './orchestration-mode.mjs';
export { selectToolsForAction } from './tool-selection.mjs';
export { classifyTaskType } from './task-type.mjs';
```

### 3.3 Consolidate Orchestration Modes

Current: 5 separate files with overlapping code
- `orchestrator.mjs` (519 lines)
- `review.mjs` (420 lines)
- `chunked.mjs` (409 lines)
- `combined.mjs` (482 lines)
- `orchestrator.enhanced.mjs` (406 lines)

**Recommended**: Single orchestrator with mode plugins

```javascript
// frontend/server/orchestration/orchestrator.mjs
export function createOrchestrator(options) {
  const mode = options.mode || 'standard';
  const baseOrchestrator = new BaseOrchestrator(options);

  const plugins = {
    standard: standardPlugin,
    review: reviewPlugin,
    chunked: chunkedPlugin,
    combined: [reviewPlugin, chunkedPlugin],
  };

  return applyPlugins(baseOrchestrator, plugins[mode]);
}
```

---

## 4. Summary Table

| Issue | Location | Lines | Impact | Fix Effort |
|-------|----------|-------|--------|------------|
| `isGptOssModel` duplicated | 4 orchestrator files | ~20 | Maintenance | 1 hour |
| `isIncomplete` inconsistent | orchestrator.mjs vs finishers.mjs | ~30 | Bug risk | 30 min |
| Mode detection heuristics | heuristics.mjs | 297 | Brittle, incomplete | 2 hours |
| Tool inference heuristics | tool-handler.mjs | 200 | Hard to maintain | 3 hours |
| Task type detection | tool-handler.mjs | 50 | Semantic understanding needed | 1 hour |
| 5 orchestrator modes | orchestration/*.mjs | 2,200 | Code duplication | 1 day |

---

## 5. Implementation Priority

### Quick Wins (Can do immediately)
1. **Extract `isGptOssModel` to utils** - Eliminates 4 duplicates
2. **Standardize on finishers.mjs `isProbablyIncomplete`** - Fixes inconsistency
3. **Add LLM-based mode detection alongside heuristics** - Can run in parallel to validate

### Medium Term
4. **Replace tool inference with LLM selection** - Major simplification
5. **Create centralized classification service**

### Long Term
6. **Consolidate orchestration modes** - Architectural change

---

## 6. Cost-Benefit Analysis

### Current Cost of Heuristics
- **Maintenance**: Every new pattern/synonym requires code changes
- **Testing**: Each regex needs test cases
- **Bugs**: Inconsistent implementations cause subtle issues
- **Coverage**: Impossible to anticipate all phrasings

### LLM Classification Cost
- **Latency**: ~50-100ms per classification (can cache)
- **Tokens**: ~150-200 tokens per call (~$0.0003 at typical rates)
- **Accuracy**: Higher than pattern matching for semantic tasks

### Recommendation
For a system already making LLM calls for chat completion, the marginal cost of classification calls is negligible compared to the maintenance burden of 500+ lines of regex heuristics.

---

## Appendix: Files Reviewed

- `frontend/server/orchestration/orchestrator.mjs` (519 lines)
- `frontend/server/orchestration/review.mjs`
- `frontend/server/orchestration/chunked.mjs`
- `frontend/server/orchestration/combined.mjs`
- `frontend/server/core/finishers.mjs` (40 lines)
- `frontend/server/telemetry/heuristics.mjs` (297 lines)
- `frontend/core/agent/orchestrator/tool-handler.mjs` (687 lines)
