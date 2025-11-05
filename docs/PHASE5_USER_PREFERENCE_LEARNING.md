# Phase 5: User Preference Learning System

**Status**: ✅ Implemented (Day 1 Complete)
**Implementation Date**: 2025-10-28

## Overview

Phase 5 introduces an adaptive learning system that enables the autonomous agent to learn and apply user-specific preferences for coding style, tool choices, workflows, and more. This system is designed around the **iterative reasoning philosophy** optimized for local inference.

## Iterative Reasoning Philosophy

### Core Principle

With local inference, we optimize for **MANY SMALL ITERATIONS** rather than large, verbose responses:

```
Token limits per response ✓
BUT
Unlimited total iterations ✓
```

This fundamentally changes our approach:

| Traditional (API-based) | Iterative (Local) |
|------------------------|-------------------|
| Minimize API calls | Unlimited iterations |
| Large, comprehensive responses | Small, focused steps |
| Pack everything into one turn | Build up through many turns |
| Cost per token | No cost constraints |
| Verbose to avoid follow-ups | Concise, clear responses |

### Key Tenets

1. **Small Steps**: Each iteration does ONE focused thing
2. **Unlimited Turns**: No limit on total iterations, only per-response tokens
3. **Build Up Reasoning**: Many small thoughts → well-reasoned result
4. **Memory is Key**: Each iteration adds to our understanding
5. **Favor Clarity**: Short, clear responses over verbose ones
6. **Think, Then Act**: Reflect → plan → execute → assess → repeat

### Agent Behavior

The autonomous agent follows this pattern:

```
Iteration 1: Read file structure (focused, concise)
Iteration 2: Identify key files (small list)
Iteration 3: Read first key file (one at a time)
Iteration 4: Read second key file
Iteration 5: Synthesize findings (brief summary)
Iteration 6: Plan implementation (clear steps)
Iteration 7: Implement step 1 (one function)
Iteration 8: Test step 1 (verify it works)
Iteration 9: Implement step 2
Iteration 10: Test step 2
...and so on
```

Each step is small, verifiable, and builds on previous iterations.

## User Preference Learning

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Preference System                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Explicit   │    │   Inferred   │    │   Observed   │  │
│  │ Preferences  │    │ Preferences  │    │ Preferences  │  │
│  │              │    │              │    │              │  │
│  │ User says:   │    │ Code         │    │ Historical   │  │
│  │ "Use pytest" │    │ Analysis     │    │ Patterns     │  │
│  │              │    │              │    │              │  │
│  │ Confidence:  │    │ Confidence:  │    │ Confidence:  │  │
│  │    1.0       │    │  0.6 - 0.95  │    │  0.4 - 0.8   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
│                         ↓                                     │
│                                                               │
│              ┌──────────────────────┐                        │
│              │  JSONL Storage       │                        │
│              │  .forgekeeper/       │                        │
│              │   preferences/       │                        │
│              └──────────────────────┘                        │
│                         ↓                                     │
│                                                               │
│              ┌──────────────────────┐                        │
│              │ Preference Guidance  │                        │
│              │ (Concise Markdown)   │                        │
│              └──────────────────────┘                        │
│                         ↓                                     │
│                                                               │
│              ┌──────────────────────┐                        │
│              │  Autonomous Agent    │                        │
│              │  Reflection Prompts  │                        │
│              └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Preference Domains

1. **coding_style**
   - Indentation (2 spaces, 4 spaces, tabs)
   - Quote style (single, double)
   - Docstring style (Google, NumPy, Sphinx)
   - Type hints (always, optional, never)

2. **tool_choice**
   - Test framework (pytest, unittest, jest, vitest)
   - Package manager (npm, yarn, pnpm)
   - Formatter (prettier, black)
   - Linter (eslint, pylint)

3. **workflow**
   - Test location (co-located, separate directory)
   - Commit style (conventional, simple)
   - Branch naming (feature/, feat/, descriptive)

4. **testing**
   - Test verbosity (minimal, verbose)
   - Coverage requirements (strict, moderate, relaxed)
   - Mock strategy (prefer real, prefer mocks)

5. **documentation**
   - Comment verbosity (minimal, balanced, verbose)
   - README structure (simple, comprehensive)
   - API docs (inline, separate)

### Data Structure

```typescript
interface UserPreference {
  preference_id: string;          // ULID
  user_id: string;                // "default_user"
  domain: string;                 // "coding_style", "tool_choice", etc.
  category: string;               // "indentation", "test_framework", etc.
  preference: string;             // Same as category (for compatibility)
  value: any;                     // "4", "pytest", { indent: 4 }, etc.
  confidence: number;             // 0.0 - 1.0
  source: 'explicit' | 'inferred' | 'observed';
  observation_count: number;      // How many times observed
  last_observed: string;          // ISO-8601 timestamp
  created_at: string;             // ISO-8601 timestamp
  applies_to?: object;            // Optional: { language: "python" }
}
```

### Storage

**Location**: `.forgekeeper/preferences/`

**Files**:
- `user_preferences.jsonl` - Main preference records (one per line)
- `observations.jsonl` - Inference observations audit trail

**Format**: Newline-delimited JSON (JSONL)
- Append-only for performance
- Easy to parse and tail
- Human-readable for debugging

### Code Pattern Detection

The system analyzes existing code to infer preferences:

#### Python Analysis
```python
# Detects:
- Indentation: /^ {4}/m vs /^ {2}/m vs /^\t/m
- Docstrings: /""".*\n\s*Args:/m (Google) vs /\n\s*Parameters\n\s*----------/m (NumPy)
- Quotes: Count 'single' vs "double"
- Type hints: def func(x: int) vs def func(x)
- Test framework: import pytest vs import unittest
```

#### JavaScript/TypeScript Analysis
```javascript
// Detects:
- Indentation: /^ {2}/m vs /^ {4}/m
- Quotes: Count 'single' vs "double"
- Semicolons: Count statements with/without
- Test framework: import jest vs import vitest
```

#### Config File Analysis
```json
// package.json, tsconfig.json
- Package manager: "packageManager" field
- Test command: scripts.test
- Formatter: prettier in devDependencies
- TypeScript strict mode: compilerOptions.strict
```

### Preference Guidance Generation

Preferences are formatted as **concise markdown** for injection into agent prompts:

```markdown
## 🎯 User Preferences

Apply these preferences when generating code:

**Coding Style**:
- indentation: 4 spaces (confidence: 95%)
- docstring_style: google
- quote_style: single

**Tool Choice**:
- test_framework: pytest
- formatter: black

**Workflow**:
- test_location: separate_tests_directory
- commit_style: conventional
```

**Design Principles**:
- **Concise**: Only essential information
- **Scannable**: Clear headers and bullet points
- **Token-efficient**: No verbose explanations
- **Actionable**: Specific enough to apply

This keeps the agent prompts small, allowing more iterations within token limits.

## API Endpoints

### `GET /api/preferences`
Get all user preferences.

**Response**:
```json
{
  "ok": true,
  "preferences": [...]
}
```

### `GET /api/preferences/:domain`
Get preferences for a specific domain.

**Response**:
```json
{
  "ok": true,
  "domain": "coding_style",
  "preferences": [...]
}
```

### `POST /api/preferences`
Record an explicit user preference.

**Request**:
```json
{
  "domain": "coding_style",
  "category": "indentation",
  "preference": "use_4_spaces",
  "value": "4",
  "applies_to": { "language": "python" }
}
```

### `POST /api/preferences/infer`
Trigger preference inference on files.

**Request**:
```json
{
  "files": [
    "forgekeeper/core/agent/autonomous.mjs",
    "frontend/src/App.tsx"
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "results": [
    { "file": "...", "observations": 8, "status": "ok" },
    { "file": "...", "observations": 5, "status": "ok" }
  ]
}
```

### `DELETE /api/preferences/:id`
Delete a preference.

### `GET /api/preferences/guidance`
Get formatted preference guidance for agent prompts.

**Response**:
```json
{
  "ok": true,
  "guidance": "## 🎯 User Preferences\n\n..."
}
```

## UI Integration

### PreferencesPanel Component

**Location**: `frontend/src/components/PreferencesPanel.tsx`

**Features**:
1. **View All Preferences**
   - Grouped by domain
   - Expandable sections
   - Color-coded by source (explicit, inferred, observed)
   - Confidence indicators

2. **Add Explicit Preferences**
   - Form with domain selector
   - Category and value inputs
   - Immediate validation

3. **Infer from Code**
   - Multi-line file path input
   - Batch analysis
   - Result display with observation counts

4. **View Guidance**
   - Shows formatted markdown
   - Copy-paste ready
   - Preview what agent sees

5. **Delete Preferences**
   - Per-preference deletion
   - Confirmation dialog
   - Cache invalidation

### App Integration

**Location**: `frontend/src/App.tsx`

- New "⚙️ Preferences" tab
- Tab navigation between Chat, Autonomous, Preferences
- Full-screen layout with scroll

## Agent Integration

### Configuration

The `AutonomousAgent` accepts a `preferenceSystem` in its config:

```javascript
const agent = createAutonomousAgent({
  llmClient,
  model,
  maxIterations: 15,
  preferenceSystem,  // UserPreferenceSystem instance
  // ... other config
});
```

### Prompt Injection

Preferences are loaded once per session and injected into every reflection prompt:

```javascript
// In run() method:
if (this.preferenceSystem) {
  this.userPreferenceGuidance =
    await this.preferenceSystem.generatePreferenceGuidance();
}

// In buildReflectionPrompt():
const preferencesText = this.userPreferenceGuidance
  ? `\n${this.userPreferenceGuidance}\n`
  : '';

return `# Autonomous Task - Self-Assessment
...
${learningsText}${preferencesText}
${this.buildFailureWarnings()}
...
`;
```

### System Prompt Updates

The `REFLECTION_SYSTEM_PROMPT` now includes the iterative reasoning philosophy:

```markdown
**ITERATIVE REASONING PHILOSOPHY** (Critical):
With local inference, we optimize for MANY SMALL ITERATIONS rather than large responses:
- **Small steps**: Each iteration should do ONE focused thing
- **Unlimited turns**: Token limits per response, but NO limit on total iterations
- **Build up reasoning**: Many small thoughts → well-reasoned result
- **Memory is key**: Each iteration adds to our understanding
- **Favor clarity**: Short, clear responses over verbose ones
- **Think, then act**: Reflect → plan → execute → assess → repeat
```

## Benefits

### 1. Personalization
- Agent learns user's coding style automatically
- Applies preferences consistently across all code generation
- Reduces manual corrections and rework

### 2. Context Preservation
- Preferences persist across sessions
- No need to re-explain style choices
- Builds institutional knowledge

### 3. Iterative Improvement
- System gets better over time
- Confidence scores increase with observations
- Can override inferred preferences with explicit ones

### 4. Token Efficiency
- Concise guidance format
- Only essential preferences included
- Leaves room for task-specific context

### 5. Transparency
- UI shows all inferred preferences
- Confidence scores visible
- Can review and edit at any time

## Future Enhancements

### Short Term (Phase 5, Days 2-3)
- **Integration with chat mode** - Apply preferences to regular chat as well
- **Preference validation** - Ensure preferences don't conflict
- **Preference suggestions** - Recommend preferences based on file analysis

### Medium Term (Phase 5, Days 4-10)
- **Option A: Episodic Memory with ChromaDB**
  - Semantic similarity search for past sessions
  - Find relevant examples from history
  - Context-aware preference application

- **Option E: Cross-Task Knowledge Transfer**
  - Share learnings between task types
  - Generalize patterns across domains
  - Meta-learning from successes/failures

### Long Term (Future Phases)
- **Multi-user preference isolation** - Different users, different preferences
- **Project-specific preferences** - Override defaults per repo
- **Team preference sync** - Share preferences across team members
- **Preference analytics** - Insights into coding patterns and evolution

## Testing Strategy

### Unit Tests
- Preference storage (append, read, update, delete)
- Code analysis (Python, JavaScript, TypeScript)
- Guidance generation (formatting, token efficiency)

### Integration Tests
- API endpoints (CRUD operations)
- Agent integration (preference injection)
- UI components (add, delete, infer)

### End-to-End Tests
1. Infer preferences from sample codebase
2. Start autonomous session with preferences
3. Verify generated code matches preferences
4. Check logs for preference application

## Implementation Files

### Core System
- `frontend/core/agent/user-preferences.mjs` - Main preference system class

### API Layer
- `frontend/server.mjs` - API endpoints (lines 1570-1714)

### UI Layer
- `frontend/src/components/PreferencesPanel.tsx` - Preferences UI
- `frontend/src/App.tsx` - Tab integration

### Agent Integration
- `frontend/core/agent/autonomous.mjs` - Prompt injection (lines 63, 74, 119-129, 895-898)

### Storage
- `.forgekeeper/preferences/user_preferences.jsonl` - Preference records
- `.forgekeeper/preferences/observations.jsonl` - Inference audit trail

## Conclusion

The User Preference Learning system represents a significant step toward a truly adaptive autonomous agent. By combining **iterative reasoning** (optimized for local inference) with **preference learning** (personalized to the user), we create an agent that:

1. **Thinks in small, focused steps** - maximizing clarity and verifiability
2. **Learns from code** - automatically detecting patterns
3. **Applies preferences consistently** - reducing friction
4. **Improves over time** - building institutional knowledge

This system is designed for the realities of **local inference**:
- No API cost constraints
- Per-response token limits
- Unlimited iteration budget

The result is an agent that can take as many iterations as needed to reach a well-reasoned, high-quality result—all while respecting the user's established patterns and preferences.

---

**Next Steps**: Proceed to Phase 5, Option A (Episodic Memory) or Option E (Cross-Task Knowledge Transfer) to further enhance the agent's learning capabilities.
