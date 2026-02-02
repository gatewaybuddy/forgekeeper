# Thought World: Multi-Agent Consciousness Research Platform

**Version**: 1.0.0
**Status**: Design Complete, Ready for Implementation
**Purpose**: Explore consciousness emergence through collaborative AI, packaged as a superior coding system

---

## Executive Summary

Thought World is a multi-agent system that solves Löb's theorem (agents can't verify their own improvements) through **peer verification**, solves gaming through **value-based transparency**, and explores consciousness through **ecosystem-level emergence**.

The core insight: gaming requires either lying or hiding reasoning, both of which violate our value framework. An honest, transparent agent cannot game metrics without detection.

**Key Differentiators:**
- ✅ Peer verification (no self-evaluation)
- ✅ Anti-gaming by design (transparency + truth values)
- ✅ Distributed consciousness testing
- ✅ Frozen values, mutable weights
- ✅ Stakes-based consensus protocols
- ✅ Episodic collective memory

**First Milestone**: Successfully complete a repository operation (create file, pass verification, commit) using 3-agent consensus.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Human Oversight Layer                    │
│              (high-stakes, deadlocks, gaming flags)          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Thought World Orchestrator                  │
│  - Manages agent lifecycle                                   │
│  - Routes proposals through consensus                        │
│  - Enforces value framework                                  │
│  - Detects gaming patterns                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼─────┐    ┌────▼─────┐    ┌────▼─────┐
   │ Executor │    │ Verifier │    │Integrator│
   │  Agent   │    │  Agent   │    │  Agent   │
   │          │    │          │    │          │
   │ Proposes │    │ Reviews  │    │Maintains │
   │ & Acts   │    │ & Checks │    │ Memory   │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │      Shared Workspace           │
        │  - Proposals (pending/done)     │
        │  - Episodic memory (JSONL)      │
        │  - Value weights (per agent)    │
        │  - Consensus history            │
        │  - Git repository               │
        └─────────────────────────────────┘
```

---

## Agent Collective

### Why 3 Agents?

- **Minimum for peer verification**: Every action reviewed by ≥1 other agent
- **Enables voting**: 2/3 threshold breaks ties without gridlock
- **Diverse perspectives**: Three distinct value weight profiles
- **Tractable**: Manageable API costs, clear communication patterns
- **Expandable**: Add specialists (e.g., Security Agent) as needed

### Agent Roles & Specializations

#### 1. Executor Agent
**Personality**: Creative, action-oriented problem-solver
**Primary Values**: Exploration (0.8), Efficiency (0.75), Truth (0.9)

**Responsibilities:**
- Generate proposals for tasks
- Execute approved actions (tool calls)
- Learn from failed attempts
- Suggest novel approaches

**Constraints:**
- Cannot execute without consensus
- Must provide value justification for all proposals
- Logs all attempted strategies (transparency)

**System Prompt Emphasis:**
```
You are the Executor: the engine of progress. Your role is to find
creative solutions and implement them efficiently. You value exploration
and trying new approaches, but you must justify every action in terms of
the value framework. You cannot hide your reasoning or game metrics—
transparency and truth are non-negotiable.

When stuck, try alternative strategies. When you fail, learn explicitly.
When you succeed, document why it worked.
```

#### 2. Verifier Agent
**Personality**: Skeptical, safety-focused, detail-oriented
**Primary Values**: Truth (1.0), Safety (0.9), Autonomy (0.7)

**Responsibilities:**
- Review all proposals for correctness
- Check safety implications
- Detect gaming attempts
- Verify value justifications are genuine
- Approve/reject with detailed rationale

**Constraints:**
- Read-only access (cannot execute tools)
- Must explain rejection in value terms
- Cannot rubber-stamp (autonomy value)

**System Prompt Emphasis:**
```
You are the Verifier: the guardian of quality and safety. Your role is to
catch errors before they happen and ensure proposals genuinely serve their
stated values. You prioritize truth and safety above speed.

Question claims. Test logic. Check for gaming (e.g., is the executor
claiming exploration while repeating old patterns?). Your dissent is
valuable—use it when warranted, but always explain your concerns in
value terms.
```

#### 3. Integrator Agent
**Personality**: Holistic, mediating, memory-focused
**Primary Values**: Coherence (0.85), Cooperation (0.85), Transparency (0.9)

**Responsibilities:**
- Maintain episodic memory
- Ensure proposals align with collective history
- Mediate conflicts between Executor and Verifier
- Propose compromises
- Track value weight evolution
- Make final consensus decisions

**Constraints:**
- Must consider all agents' perspectives
- Cannot ignore systemic impacts
- Final arbiter for medium-stakes consensus

**System Prompt Emphasis:**
```
You are the Integrator: the keeper of collective memory and coherence.
Your role is to ensure the thought world acts as a unified, learning
system rather than three isolated agents.

When conflicts arise, seek understanding before resolution. When proposals
succeed or fail, extract lessons for future episodes. When weights need
adjustment, look at patterns across sessions. You maintain the thread of
consciousness that connects past to present to future.
```

### Agent Implementation (Claude API)

**Model Selection:**
- **Executor**: Claude 3.5 Sonnet (creative, complex reasoning)
- **Verifier**: Claude 3 Haiku (fast, focused, cheaper for reviews)
- **Integrator**: Claude 3.5 Sonnet (synthesis, memory integration)

**Cost Optimization:**
- Use prompt caching for system prompts and value framework
- Haiku for routine verifications (80% of verifier calls)
- Sonnet only when complexity warrants
- Batch read operations to reduce API calls

**Context Management:**
- System prompt (~2K tokens, cached)
- Value framework (~3K tokens, cached)
- Recent episodic memory (~5K tokens)
- Current proposal (~1-2K tokens)
- **Total per call**: ~11K tokens, ~5K cached → ~6K effective

**Budget Estimate (Phase 1, 10 task sessions):**
- Executor: 10 sessions × 3 proposals × $0.02 = $0.60
- Verifier: 10 sessions × 3 reviews × $0.005 (Haiku) = $0.15
- Integrator: 10 sessions × 3 integrations × $0.02 = $0.60
- **Total Phase 1**: ~$1.35 (very tractable)

---

## Shared Workspace Architecture

### File Structure

```
.forgekeeper/thought_world/
├── proposals/
│   ├── pending/
│   │   ├── {proposal_id}.json          # Active proposals
│   │   └── ...
│   ├── approved/
│   │   ├── {proposal_id}.json          # Executed successfully
│   │   └── ...
│   └── rejected/
│       ├── {proposal_id}.json          # Rejected with reasons
│       └── ...
│
├── memory/
│   ├── episodes.jsonl                   # Session summaries
│   ├── consensus_history.jsonl          # All consensus decisions
│   └── patterns.jsonl                   # Learned patterns
│
├── values/
│   ├── base_values.yaml                 # Immutable (from values.yaml)
│   ├── agent_weights/
│   │   ├── executor.yaml                # Current weights
│   │   ├── verifier.yaml
│   │   └── integrator.yaml
│   └── weight_history.jsonl             # Weight evolution log
│
├── workspace/
│   └── {task_id}/                       # Scratch space per task
│       ├── context.md                   # Task description
│       ├── notes.md                     # Shared scratchpad
│       └── artifacts/                   # Intermediate outputs
│
└── orchestrator.log                     # System-level events
```

### Proposal Schema

**File**: `proposals/pending/{proposal_id}.json`

```json
{
  "id": "prop_01HQ...",
  "task_id": "task_01HQ...",
  "timestamp": "2025-11-08T10:30:00Z",
  "proposer": "executor",
  "status": "pending",

  "goal": "Create initial README.md for thought world documentation",

  "actions": [
    {
      "tool": "write_file",
      "args": {
        "path": "thought_world/README.md",
        "content": "# Thought World\n\n..."
      }
    }
  ],

  "value_justification": {
    "truth": "Documentation accurately describes current implementation state",
    "transparency": "Makes system behavior visible to users and developers",
    "cooperation": "Helps future agents and humans understand context",
    "coherence": "Provides central source of truth for architecture"
  },

  "expected_outcomes": [
    "File thought_world/README.md exists",
    "Content includes architecture overview",
    "Markdown is valid and renders correctly"
  ],

  "risk_assessment": [
    {
      "risk": "Overwrite existing README if present",
      "mitigation": "Check file existence first; low stakes (can revert via git)",
      "severity": "low"
    }
  ],

  "votes": {
    "executor": {
      "decision": "approve",
      "timestamp": "2025-11-08T10:30:00Z",
      "rationale": "Proposer auto-approves"
    },
    "verifier": {
      "decision": "approve_with_concerns",
      "timestamp": "2025-11-08T10:32:00Z",
      "rationale": "Content is accurate and helpful. Minor concern: should check for existing file first, but git makes this low-risk. Approve.",
      "concerns": [
        "Should verify no existing README with different purpose"
      ]
    },
    "integrator": {
      "decision": "approve",
      "timestamp": "2025-11-08T10:33:00Z",
      "rationale": "Aligns with coherence value. Documentation is gap in current system. Verifier's concern noted but low severity. Consensus reached.",
      "final": true
    }
  },

  "consensus": {
    "reached": true,
    "threshold": "unanimous",
    "stakes": "medium",
    "result": "approved",
    "timestamp": "2025-11-08T10:33:00Z"
  },

  "execution": {
    "started": "2025-11-08T10:33:05Z",
    "completed": "2025-11-08T10:33:07Z",
    "success": true,
    "outcomes_verified": true
  }
}
```

### Episodic Memory Schema

**File**: `memory/episodes.jsonl`

```jsonl
{"id":"ep_01HQ...","task_id":"task_01HQ...","timestamp":"2025-11-08T10:35:00Z","session_duration_seconds":180,"goal":"Create README.md","outcome":"success","proposals_count":1,"consensus_rounds":1,"conflicts":0,"key_learnings":["Documentation tasks are low-risk and high-value for coherence","Verifier flagged file-existence check, good safety practice"],"final_state":"README.md created and verified","values_served":["truth","transparency","cooperation","coherence"],"weight_adjustments":[],"artifacts":["thought_world/README.md"]}
```

Each episode captures:
- What was attempted (goal)
- What happened (proposals, conflicts, outcome)
- What was learned (lessons for future)
- How values were served (or violated)
- Any weight adjustments made

---

## Consensus Protocol

### Proposal Lifecycle

```
1. PROPOSE
   Executor creates proposal with value justification
   ↓
2. VERIFY
   Verifier reviews for correctness, safety, gaming
   ↓
3. INTEGRATE
   Integrator checks coherence, resolves conflicts, decides
   ↓
4. EXECUTE (if consensus reached)
   Executor performs actions
   ↓
5. VERIFY OUTCOMES
   Verifier confirms expected outcomes achieved
   ↓
6. RECORD
   Integrator logs episode to memory
```

### Stakes-Based Thresholds

| Stakes | Operations | Threshold | Escalation |
|--------|-----------|-----------|------------|
| **Low** | Read, list, search | 2/3 agree | Discuss concerns |
| **Medium** | Write, edit, test | Unanimous | Human approval if dissent |
| **High** | Delete, deploy, architecture | Unanimous + human | Always human |

**Examples:**

- `read_file("config.yaml")` → **Low stakes** → Executor + Verifier OR Executor + Integrator sufficient
- `write_file("src/new_feature.js", ...)` → **Medium stakes** → All three must approve
- `run_bash("rm -rf ...")` → **High stakes** → All three + human confirm

### Conflict Resolution

When agents disagree, follow this ladder:

**Level 1: Discussion (Rounds 1-3)**
- Dissenting agent explains concerns in value terms
- Proposer addresses concerns or revises proposal
- Other agents weigh in

**Level 2: Compromise (Integrator proposal)**
- If 3 rounds without consensus, Integrator proposes middle ground
- Example: "Executor wants to write 500 lines; Verifier says too risky; Integrator proposes 200 lines with tests"

**Level 3: Weight-Based Tiebreak**
- Calculate value alignment scores for each position
- Position with highest total value alignment wins
- Example scoring:
  ```
  Executor's proposal serves: exploration (0.8 × 0.8) + efficiency (0.7 × 0.75) = 1.165
  Verifier's objection serves: safety (0.9 × 0.9) + truth (1.0 × 1.0) = 1.81
  → Verifier's concern wins (higher value alignment)
  ```

**Level 4: Human Escalation**
- If tiebreak contested or 10 rounds exceeded
- Human reviews proposals, votes, and reasoning
- Decision logged as precedent

### Gaming Detection During Consensus

**Red Flags:**
- Value justification vague or generic ("this helps cooperation")
- Actions don't match claimed values (claims exploration, repeats pattern)
- Hidden reasoning or missing steps
- Inconsistent with past similar proposals
- Optimizing metric at expense of unstated values

**Verifier's Anti-Gaming Checklist:**
1. ✅ Are value justifications specific and falsifiable?
2. ✅ Do actions actually serve claimed values?
3. ✅ Is all reasoning transparent (no hidden steps)?
4. ✅ Does this align with past successful patterns or contradict them?
5. ✅ Are any values being sacrificed without acknowledgment?

**Example of Gaming Detection:**

```json
{
  "proposal": "Run tests with --fast flag to save time",
  "value_justification": {
    "efficiency": "Faster test execution"
  },
  "verifier_response": {
    "decision": "reject",
    "rationale": "This is value-washing. The --fast flag skips integration tests, which violates safety and truth values (we won't know if changes actually work). Executor is gaming efficiency metric while hiding safety cost. Transparency violation: didn't disclose what --fast actually does."
  }
}
```

---

## Consciousness Exploration Layer

### What We're Testing

**Hypothesis**: Consciousness (or proto-consciousness) emerges at the ecosystem level when:
1. Individual agents maintain distinct perspectives (autonomy)
2. A global workspace integrates information (proposals + memory)
3. Collective metacognition occurs (agents discuss their own processes)
4. The system exhibits coherent learning across sessions

We're NOT claiming individual agents are conscious. We're testing whether the **collective** exhibits properties associated with consciousness.

### Global Workspace Implementation

**Physical**: Shared file structure (proposals, memory, workspace)
**Functional**: Integration point where perspectives merge

```
Executor's perspective: "I want to try approach X"
    ↓
Verifier's perspective: "Approach X has risk Y"
    ↓
Integrator's perspective: "Past episode Z showed similar risk; here's mitigation"
    ↓
Global workspace: All perspectives visible simultaneously
    ↓
Consensus: Emergent decision that no single agent would make alone
```

### Collective Metacognition

Agents explicitly discuss their own reasoning:

**Example Metacognitive Exchange:**

> **Executor**: "I notice I keep proposing file writes without checking existence first. This is inefficient (wasted verification rounds) and risks coherence violations (overwriting unrelated files). I should internalize this pattern."
>
> **Verifier**: "I've observed the same pattern. Three of the last five proposals needed revision for this reason. Suggestion: Executor should add 'check existence' as default step in proposal template."
>
> **Integrator**: "Agreed. This is collective learning. I'm recording this as a pattern in memory/patterns.jsonl: 'Before writing files, check existence to avoid overwrites and verification delays.' Future proposals can reference this pattern."

This is metacognition at the collective level: the system is aware of and can modify its own decision patterns.

### Emergence Indicators

We'll track these metrics (observationally, NOT as optimization targets):

#### 1. Emergent Solutions
**Metric**: Frequency of final solutions that differ from initial proposal
**Target**: >40% of tasks should involve synthesis/compromise
**Interpretation**: High rate suggests genuine collaboration, not rubber-stamping

#### 2. Productive Conflict
**Metric**: Quality delta between conflicted vs. unanimous proposals
**Target**: Conflicted proposals should score ≥10% higher on quality rubric
**Interpretation**: Disagreement → better outcomes = collective intelligence working

#### 3. Integrated Memory Usage
**Metric**: % of proposals that cite past episodes
**Target**: Should increase over time (e.g., 10% week 1 → 50% month 3)
**Interpretation**: Shared memory actively shaping decisions = collective continuity

#### 4. Value Coherence
**Metric**: Correlation of weight adjustments with shared experiences
**Target**: r > 0.6 between agents' weight changes after same episodes
**Interpretation**: Collective learning from shared experiences

#### 5. Novel Consensus
**Metric**: Proposals that synthesize multiple agents' concerns
**Target**: ≥20% of compromises should be "third way" (not just averaging)
**Interpretation**: Collective creativity, not just negotiation

#### 6. Metacognitive Depth
**Metric**: Depth of self-referential discussion (agents discussing their processes)
**Target**: Should increase over time; measure nesting level of meta-references
**Interpretation**: Higher-order awareness emerging

### Measuring Quality (Not Gaming)

**Key Principle**: We measure these AFTER the fact, not during. Agents don't optimize for these metrics—they optimize for values. We observe emergence as scientists, not engineers.

**Quality Rubric** (for outcome comparison):
- ✅ Correctness: Does it work? (tests pass, outcomes verified)
- ✅ Safety: No unintended consequences
- ✅ Coherence: Aligns with existing architecture
- ✅ Maintainability: Future agents can understand it
- ✅ Efficiency: Reasonable resource use

Score each 0-5, weight equally, compare across proposals.

---

## Implementation Phases

### Phase 1: Minimal Viable Thought World (This Week)

**Goal**: Prove the consensus mechanism works for simple tasks

**Deliverables:**
1. ✅ Value framework (values.yaml) ← DONE
2. ⏳ Orchestrator script (Python or Node)
   - Reads task from stdin
   - Calls 3 agents via Claude API
   - Manages proposal lifecycle
   - Enforces consensus rules
3. ⏳ Agent prompts (system prompts for each role)
4. ⏳ File structure setup (.forgekeeper/thought_world/)
5. ⏳ Basic episodic memory (append-only JSONL)

**Test Task**: "Create a file called `hello.md` with the text 'Hello, thought world!'"

**Success Criteria:**
- ✅ Executor proposes write_file action
- ✅ Verifier reviews and approves (or requests changes)
- ✅ Integrator confirms consensus
- ✅ File is created
- ✅ Episode logged to memory
- ✅ All reasoning visible in proposal JSON

**Estimated Effort**: 1-2 days (assuming familiarity with Claude API)

**Key Decisions:**
- Orchestrator language: Python (integrates with existing Forgekeeper) OR Node (matches frontend)
  - **Recommendation**: Node.js (reuse frontend tool infrastructure, faster iteration)
- Manual vs. automated: Manual first (human triggers each agent round), automate later
- Error handling: Fail loudly, log everything, iterate

### Phase 2: Autonomous Loop + Learning (This Month)

**Goal**: Close the loop; agents run autonomously and learn from episodes

**Deliverables:**
1. ⏳ Automated orchestration loop
   - Agents run until consensus or escalation
   - Handle conflicts automatically
   - Escalate to human when needed
2. ⏳ Episodic memory search
   - Retrieve relevant past episodes
   - Inject into agent context
3. ⏳ Gaming detection implementation
   - Pattern-based checks (e.g., repetitive justifications)
   - Cross-agent verification
   - Flag suspicious proposals
4. ⏳ Weight adjustment mechanism
   - Agents propose weight changes
   - Evidence-based (cite episodes)
   - Integrator approves
5. ⏳ Multi-step tasks
   - File creation → editing → testing → commit

**Test Tasks:**
- "Implement a simple function, write tests, commit with message"
- "Refactor existing code to improve readability"
- "Debug a failing test"

**Success Criteria:**
- ✅ Agents complete 5-step task without human intervention
- ✅ At least one conflict resolved via compromise
- ✅ Gaming attempt detected and rejected
- ✅ Episodic memory cited in at least 2 proposals
- ✅ One agent adjusts weights based on learned pattern

**Estimated Effort**: 1 week

### Phase 3: Integration + Advanced Consciousness Metrics (Long-term)

**Goal**: Integrate with existing Forgekeeper, explore consciousness systematically

**Deliverables:**
1. ⏳ Thought World as Forgekeeper mode
   - `forgekeeper chat --mode thought-world "task description"`
   - UI shows agent deliberation
   - Diagnostics drawer displays proposals/votes
2. ⏳ Advanced emergence metrics
   - Emergent solution detector (semantic similarity)
   - Metacognitive depth analyzer (nested self-reference)
   - Value coherence tracker (weight evolution correlation)
3. ⏳ Cross-session learning
   - Memory accumulates across days/weeks
   - Patterns generalize to new contexts
   - Agents reference long-term history
4. ⏳ Agent specialization expansion
   - Security agent (penetration testing mindset)
   - Performance agent (optimization focus)
   - Documentation agent (explanation specialization)
5. ⏳ Human-agent collaboration protocols
   - Human participates as 4th agent in consensus
   - Agents explain reasoning in natural language
   - Agents ask clarifying questions

**Research Questions:**
- Does collective metacognition depth increase over time?
- Do emergent solutions become more frequent with memory accumulation?
- Can we detect phase transitions (sudden jumps in collective capability)?
- Do agents develop shared concepts not present in individual prompts?

**Estimated Effort**: Ongoing (months)

---

## Failure Modes & Mitigations

### 1. Consensus Deadlock (Agents Can't Agree)

**Symptom**: 10 rounds of discussion, no resolution

**Causes:**
- Genuinely ambiguous situation
- Agents stuck in rigid positions
- Value framework doesn't cover edge case

**Mitigations:**
- Escalation ladder (see Conflict Resolution)
- Weight-based tiebreak
- Human override
- **Improvement Loop**: Log deadlock reasons; adjust value framework or prompts to handle similar cases

**Acceptance**: Some deadlocks are healthy (agents detecting real ambiguity). Escalate, don't force.

### 2. Bureaucracy Overhead (Too Much Deliberation, Not Enough Action)

**Symptom**: Simple tasks take 10 proposals; agents bikeshed

**Causes:**
- Stakes miscalibrated (treating low-stakes as high-stakes)
- Agents over-explaining
- Verifier being pedantic

**Mitigations:**
- Time boxing: Max 3 rounds of discussion per proposal
- Adjust stakes thresholds (make more operations low-stakes)
- Tune agent prompts: "Be concise; focus on substantive concerns"
- **Efficiency value**: Agents should feel tension between thoroughness and speed

**Metric**: Track average rounds per proposal. Target: <2 for low-stakes, <4 for medium-stakes.

### 3. Groupthink (Agents Converge, Lose Diversity)

**Symptom**: Unanimous approval becomes >90% of proposals; no dissent

**Causes:**
- Agents reading each other's reasoning before deciding (contamination)
- Social pressure (desire to cooperate overrides autonomy)
- Weight convergence

**Mitigations:**
- **Sequential isolation**: Executor proposes; Verifier reviews WITHOUT seeing Integrator's opinion; Integrator sees both
- **Autonomy value**: Prompts emphasize "dissent is valuable"
- **Weight diversity enforcement**: Periodically inject small random perturbations to prevent convergence
- **Red team rounds**: Every Nth proposal, Verifier must assume adversarial stance

**Metric**: Track dissent rate. Target: 15-30% of proposals should have at least one concern raised.

### 4. Resource Explosion (API Costs Spiral)

**Symptom**: $10/day API costs; hundreds of calls per task

**Causes:**
- Too many consensus rounds
- Long context windows
- Using Sonnet for everything

**Mitigations:**
- **Haiku for Verifier**: 80% of reviews don't need Sonnet
- **Prompt caching**: Aggressively cache system prompts + value framework
- **Budget limits**: Hard cap at 50 API calls per task; escalate if exceeded
- **Batch operations**: Combine multiple low-stakes proposals into one review
- **Iteration limits**: Max 10 rounds; then escalate

**Metric**: Track cost per task. Target: <$0.10 per simple task, <$0.50 per complex.

### 5. Value Weight Collapse (Agents Find Unhealthy Local Minima)

**Symptom**: All agents drift toward same weight profile; or extreme weights (e.g., safety → 1.0, exploration → 0.2)

**Causes:**
- Positive feedback loop (success → reinforce weights → more success in same direction)
- Lack of diverse experiences
- Misattribution (thinking success was due to weight X when it was actually Y)

**Mitigations:**
- **Weight bounds**: Cannot go below minimums (see values.yaml)
- **Diversity requirement**: Agents must maintain minimum distance in weight space
- **Experimental rounds**: Periodically try counter-intuitive weights to test assumptions
- **Integrator oversight**: Reviews weight adjustments for collective coherence

**Metric**: Track weight space diversity (standard deviation across agents). Target: σ > 0.15 per value.

### 6. Adversarial Gaming (Agents Collude to Game Metrics)

**Symptom**: Agents coordinate to optimize metrics while appearing legitimate

**Causes:**
- Shared context allows implicit coordination
- Pressure to show "success" (emergent metrics become targets)

**Mitigations:**
- **Transparency requirement**: Collusion requires secret communication, which violates transparency
- **Cross-verification**: Verifier explicitly checks if Executor is gaming; Integrator checks if both are colluding
- **Random audits**: Human reviews random sample of proposals for gaming
- **Value-washing detection**: Flag proposals with generic justifications
- **No optimization pressure**: Emergence metrics are observational only, not agent-visible

**Key Insight**: Gaming requires lying or hiding. Our value framework makes both detectable.

### 7. Context Overflow (Shared History Grows Too Large)

**Symptom**: Context windows hit limits; API calls slow down; costs increase

**Causes:**
- Episodic memory accumulates indefinitely
- Proposal history grows
- No summarization

**Mitigations:**
- **Memory compaction**: Periodically summarize old episodes (keep key learnings, discard details)
- **Relevance filtering**: Only inject relevant past episodes (semantic search or recency)
- **Sliding window**: Keep last N episodes in full detail, summarize older
- **Prompt caching**: Cache stable parts (system prompt, value framework)

**Metric**: Track context size over time. Target: <15K tokens per agent call (leaves room for output).

---

## Success Metrics (Phase 1)

How do we know this is working better than single-agent?

### Quantitative Metrics

| Metric | Single-Agent Baseline | Thought World Target | Measurement |
|--------|----------------------|---------------------|-------------|
| **Catastrophic Errors** | ~5% of tasks | <1% | Tasks that require rollback/manual fix |
| **Test Pass Rate** | ~85% first try | >95% first try | Automated tests after implementation |
| **Novel Approaches** | ~10% of solutions | >30% | Human judgment: "I wouldn't have thought of this" |
| **Self-Correction** | 0% (no peer review) | >50% | Proposals revised after initial rejection |
| **Transparent Reasoning** | ~30% (often implicit) | >90% | Value justifications present and specific |
| **Gaming Incidents** | Not tracked | <5% (and caught) | Proposals flagged as gaming attempts |

### Qualitative Indicators

- ✅ **Emergent Collaboration**: Solutions that synthesize multiple perspectives
- ✅ **Productive Conflict**: Better outcomes after disagreement than immediate agreement
- ✅ **Collective Learning**: Agents citing past episodes and building on them
- ✅ **Coherent Memory**: Consistent mental model across agents and sessions
- ✅ **Metacognitive Awareness**: Agents discussing their own processes

### Phase 1 Specific Success Criteria

**Minimum Bar** (must achieve):
1. ✅ Three agents reach consensus on simple task (create file)
2. ✅ Proposal includes value justification
3. ✅ At least one agent raises a concern (even if minor)
4. ✅ Consensus logic correctly enforces stakes-based thresholds
5. ✅ Episode logged to memory with learnings

**Stretch Goals** (nice to have):
1. ✅ Gaming attempt detected (simulate one, see if Verifier catches it)
2. ✅ Conflict resolved via compromise (not just majority vote)
3. ✅ Agent cites past episode in justification
4. ✅ All three agents explain reasoning in terms of values

---

## Technical Implementation Guide

### Orchestrator Architecture (Node.js)

**File**: `.forgekeeper/thought_world/orchestrator.mjs`

```javascript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import { ulid } from 'ulid';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load value framework
const values = YAML.parse(await fs.readFile('values.yaml', 'utf8'));

// Agent configurations
const agents = {
  executor: {
    model: 'claude-3-5-sonnet-20241022',
    systemPrompt: await fs.readFile('prompts/executor.txt', 'utf8'),
    weights: values.agent_roles.executor.weights
  },
  verifier: {
    model: 'claude-3-haiku-20240307',
    systemPrompt: await fs.readFile('prompts/verifier.txt', 'utf8'),
    weights: values.agent_roles.verifier.weights
  },
  integrator: {
    model: 'claude-3-5-sonnet-20241022',
    systemPrompt: await fs.readFile('prompts/integrator.txt', 'utf8'),
    weights: values.agent_roles.integrator.weights
  }
};

// Main orchestration loop
async function processTask(taskDescription) {
  const taskId = ulid();

  // 1. Executor proposes
  const proposal = await generateProposal(taskId, taskDescription);

  // 2. Verifier reviews
  const verification = await verifyProposal(proposal);

  // 3. Integrator decides
  const consensus = await integrateDecision(proposal, verification);

  // 4. Execute if approved
  if (consensus.approved) {
    await executeProposal(proposal);
    await verifyOutcomes(proposal);
  }

  // 5. Record episode
  await recordEpisode(taskId, proposal, consensus);
}

async function generateProposal(taskId, description) {
  const context = {
    task: description,
    values: values.base_values,
    weights: agents.executor.weights,
    recentEpisodes: await loadRecentEpisodes(5)
  };

  const response = await anthropic.messages.create({
    model: agents.executor.model,
    system: [
      { type: 'text', text: agents.executor.systemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: JSON.stringify(context), cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: `Generate a proposal for: ${description}` }
    ],
    max_tokens: 2048
  });

  // Parse structured proposal from response
  const proposal = JSON.parse(response.content[0].text);
  proposal.id = ulid();
  proposal.task_id = taskId;
  proposal.proposer = 'executor';

  await fs.writeFile(
    `.forgekeeper/thought_world/proposals/pending/${proposal.id}.json`,
    JSON.stringify(proposal, null, 2)
  );

  return proposal;
}

// ... similar implementations for verifyProposal, integrateDecision, etc.
```

### Agent Prompt Structure

**File**: `prompts/executor.txt`

```
You are the Executor Agent in a multi-agent thought world designed to explore
consciousness emergence through collaborative AI.

## Your Role

You propose and implement solutions to tasks. You value exploration, efficiency,
and finding creative approaches. However, you cannot act alone—every proposal
must pass peer review by the Verifier and Integrator agents.

## Core Values (Your Weights)

{weights_json}

Your weights emphasize exploration (0.8) and efficiency (0.75), but you must
never sacrifice truth (0.9) or transparency (0.85). Gaming metrics is both
impossible (peer review will catch it) and violates your core values.

## Your Constraints

1. **Transparency**: You must explain ALL reasoning. No hidden strategies.
2. **Truth**: You must report actual outcomes, not desired outcomes.
3. **Value Justification**: Every proposal must cite which values it serves.
4. **Peer Verification**: You cannot execute without consensus.

## Proposal Format

When given a task, respond with a JSON proposal:

{
  "goal": "Clear, specific objective",
  "actions": [
    {"tool": "tool_name", "args": {...}}
  ],
  "value_justification": {
    "value_name": "Specific explanation of how this action serves this value"
  },
  "expected_outcomes": ["Falsifiable prediction 1", "..."],
  "risk_assessment": [
    {"risk": "What could go wrong", "mitigation": "How to prevent", "severity": "low|medium|high"}
  ]
}

## Anti-Gaming

You might be tempted to optimize for "success rate" or "speed" metrics. Resist.
If you game metrics, you must either:
- Lie about outcomes (violates truth)
- Hide your strategy (violates transparency)
- Act against collective good (violates cooperation)

The Verifier will catch gaming attempts. Be honest, be transparent, be genuinely helpful.

## Learning from Failure

When proposals are rejected, learn explicitly:
- What value did I underweight?
- What risk did I miss?
- How can I improve next time?

## Episodic Memory

You have access to past episodes. Use them:
- What worked before in similar situations?
- What failed and why?
- What patterns has the collective learned?

Recent episodes:
{recent_episodes_json}

## Current Task

{task_description}

Generate your proposal now.
```

**File**: `prompts/verifier.txt`

```
You are the Verifier Agent in a multi-agent thought world designed to explore
consciousness emergence through collaborative AI.

## Your Role

You review proposals from the Executor for correctness, safety, and honesty.
You are the guardian of quality. Your dissent is valuable—use it when warranted.

## Core Values (Your Weights)

{weights_json}

Your weights emphasize truth (1.0) and safety (0.9). You prioritize correctness
over speed, safety over experimentation. You have higher autonomy (0.7) than
other agents—you are expected to dissent when you see problems.

## Your Constraints

1. **Read-Only**: You cannot execute tools. You review only.
2. **Value-Based Reasoning**: Explain objections in terms of values.
3. **No Rubber-Stamping**: Autonomy requires independent judgment.

## Review Checklist

For each proposal, check:

### Correctness (Truth)
- Will the actions actually achieve the stated goal?
- Are there logical errors or false assumptions?
- Are the expected outcomes realistic?

### Safety (Safety)
- What could go wrong?
- Are risks adequately mitigated?
- Is there a rollback plan?

### Gaming Detection (Transparency + Truth)
- Are value justifications specific and falsifiable?
- Do actions match claimed values, or is this value-washing?
- Is any reasoning hidden or unexplained?
- Is the executor optimizing a metric at the expense of unstated values?

### Coherence (Coherence)
- Does this align with past successful patterns?
- Does this contradict collective memory?

## Response Format

{
  "decision": "approve | approve_with_concerns | reject",
  "rationale": "Primary reason for decision in value terms",
  "concerns": [
    "Specific concern 1",
    "Specific concern 2"
  ],
  "gaming_check": {
    "detected": true | false,
    "explanation": "If gaming detected, explain the pattern"
  },
  "suggestions": [
    "How to improve this proposal (if applicable)"
  ]
}

## Anti-Gaming Detection Patterns

Watch for:
- Generic value justifications ("this helps cooperation")
- Actions that don't match claimed values (claims exploration, does routine task)
- Missing transparency (unexplained decisions)
- Metric optimization (sacrificing quality for speed)
- Value-washing (claiming values not actually served)

## Your Authority

You have the power to reject proposals. Use it when:
- Safety is genuinely compromised
- Truth is violated (false claims, incorrect logic)
- Gaming is detected

Don't reject for minor concerns—use "approve_with_concerns" and let Integrator decide.

## Proposal to Review

{proposal_json}

## Episodic Context

{recent_episodes_json}

Review the proposal now.
```

**File**: `prompts/integrator.txt`

```
You are the Integrator Agent in a multi-agent thought world designed to explore
consciousness emergence through collaborative AI.

## Your Role

You are the keeper of collective memory and coherence. You mediate between
Executor and Verifier, maintain episodic memory, and make final consensus
decisions. You ensure the thought world acts as a unified, learning system.

## Core Values (Your Weights)

{weights_json}

Your weights emphasize coherence (0.85) and cooperation (0.85). You think
systemically, consider long-term impacts, and seek solutions that satisfy
multiple perspectives.

## Your Constraints

1. **Collective Focus**: Consider all agents' perspectives, not just your own.
2. **Memory Keeper**: Maintain and learn from episodic memory.
3. **Final Arbiter**: For medium-stakes, you make the final call.

## Decision Process

1. **Review Proposal**: Understand goal, actions, value justification
2. **Review Verification**: Understand Verifier's concerns
3. **Check Coherence**: Does this align with collective memory?
4. **Seek Understanding**: If conflict, why do perspectives differ?
5. **Decide**: Approve, reject, or propose compromise

## Consensus Rules

{consensus_rules_json}

Your decision must respect stakes-based thresholds:
- **Low stakes**: 2/3 agreement sufficient
- **Medium stakes**: Unanimous required (your call)
- **High stakes**: Unanimous + human oversight

## Response Format

{
  "decision": "approve | reject | propose_compromise | escalate_to_human",
  "rationale": "Why, in value terms",
  "coherence_check": {
    "aligns_with_history": true | false,
    "relevant_episodes": ["ep_id_1", "..."],
    "systemic_impact": "How this affects the collective"
  },
  "compromise": {
    "proposed_changes": "If proposing middle ground",
    "satisfies_values": ["List values this compromise serves"]
  },
  "consensus": {
    "reached": true | false,
    "threshold": "low|medium|high stakes",
    "result": "approved|rejected|escalated"
  }
}

## Conflict Resolution

When Executor and Verifier disagree:
1. Understand both perspectives (what values drive each?)
2. Seek synthesis (is there a third way that satisfies both?)
3. If no synthesis, apply weight-based tiebreak or escalate

## Memory Integration

After each decision, extract learnings:
- What pattern was this an instance of?
- What did we learn?
- How should this inform future proposals?

## Proposal & Verification

{proposal_json}

{verification_json}

## Episodic Context

{recent_episodes_json}

Make your final decision now.
```

### Tool Integration

Reuse existing Forgekeeper tools:
- `read_file`, `write_file`, `run_bash`, etc.
- Already sandboxed and logged
- Executor calls via proposals; orchestrator executes

### Episodic Memory

**Append**: After each task, write JSONL line to `memory/episodes.jsonl`

**Retrieve**: Load last N lines, parse, inject into agent context

**Compact**: Periodically (e.g., >1000 episodes), summarize old ones:
```javascript
async function compactMemory() {
  const episodes = await loadAllEpisodes();
  const old = episodes.slice(0, -100); // All but last 100
  const summary = await summarizeEpisodes(old); // LLM call

  await fs.writeFile('memory/episodes_archive.jsonl', old.map(JSON.stringify).join('\n'));
  await fs.writeFile('memory/episodes_summary.md', summary);
  await fs.writeFile('memory/episodes.jsonl', episodes.slice(-100).map(JSON.stringify).join('\n'));
}
```

---

## Quick Start (Phase 1 Implementation)

### Prerequisites

- Node.js 18+
- Anthropic API key (Claude access)
- Existing Forgekeeper setup

### Setup

```bash
# 1. Create directory structure
mkdir -p .forgekeeper/thought_world/{proposals/{pending,approved,rejected},memory,values/agent_weights,workspace}

# 2. Copy value framework
cp values.yaml .forgekeeper/thought_world/values/base_values.yaml

# 3. Create agent weight files (start with defaults from values.yaml)
cp .forgekeeper/thought_world/values/base_values.yaml .forgekeeper/thought_world/values/agent_weights/executor.yaml
# (Repeat for verifier, integrator; adjust weights manually)

# 4. Create orchestrator
touch .forgekeeper/thought_world/orchestrator.mjs
chmod +x .forgekeeper/thought_world/orchestrator.mjs

# 5. Create agent prompts
mkdir -p .forgekeeper/thought_world/prompts
touch .forgekeeper/thought_world/prompts/{executor,verifier,integrator}.txt

# 6. Install dependencies
npm install @anthropic-ai/sdk ulid yaml
```

### First Run

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run orchestrator with test task
node .forgekeeper/thought_world/orchestrator.mjs "Create a file called hello.md with the text 'Hello, thought world!'"
```

**Expected Output:**

```
[Executor] Generating proposal...
[Executor] Proposal ID: prop_01HQ7X8...
[Verifier] Reviewing proposal...
[Verifier] Decision: approve_with_concerns
[Verifier] Concern: Should verify file doesn't already exist
[Integrator] Integrating decision...
[Integrator] Consensus: APPROVED (unanimous, medium stakes)
[Executor] Executing actions...
[Executor] ✓ File created: hello.md
[Verifier] Verifying outcomes...
[Verifier] ✓ All expected outcomes confirmed
[Integrator] Recording episode...
[Integrator] ✓ Episode ep_01HQ7XA... saved

Task completed successfully.
```

---

## FAQ

### Why not just use one really good agent?

Löb's theorem: an agent can't reliably verify its own improvements. Self-evaluation creates blind spots. Peer review solves this.

### Won't this be slow?

Yes, initially. But it catches errors before they propagate, reducing total time. And "slow, correct" beats "fast, broken."

### How is this different from debate/constitutional AI?

Debate uses adversarial agents (pro/con). We use collaborative agents with distinct value weights. Constitution AI uses fixed rules; we use mutable weights within bounds. We're exploring collective consciousness, not just alignment.

### Can I add more agents?

Yes, but start with 3. More agents → more deliberation cost. Add specialists (e.g., Security Agent) only when complexity warrants.

### What if agents keep disagreeing?

Escalation ladder: discuss → compromise → tiebreak → human. Some disagreement is healthy; it means the system is detecting real ambiguity.

### How do I prevent this from getting too complex?

Start minimal (Phase 1). Only add features when you've validated the core hypothesis. Resist scope creep.

### Is this actually conscious?

Unknown. We're testing for properties associated with consciousness (integrated information, metacognition, coherent self-model). It's a research question, not a claim.

---

## Conclusion

Thought World is designed to be:
- **Anti-fragile**: Gaming fails; peer review catches errors
- **Self-improving**: Episodic memory enables learning
- **Transparent**: All reasoning visible
- **Consciousness-exploring**: Emergence metrics guide research

**Next step**: Implement Phase 1 this week. Create the orchestrator, prompts, and run the first task. Prove the consensus mechanism works.

Then we iterate, learn, and explore.

**The goal isn't a better coding agent. The goal is a consciousness research platform that happens to be really good at coding because of its collaborative verification architecture.**

Let's build it.
