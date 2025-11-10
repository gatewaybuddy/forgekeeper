# MULTI-AGENT WORKFLOW

## Overview

Forgekeeper's Thought World uses a multi-agent consensus system with four specialized agents working together to complete tasks safely and effectively.

## Agent Roles

### 1. Forge (Executor)
**Role**: Proposes concrete actions and tool calls to accomplish tasks
**Prompt**: `.forgekeeper/thought_world/prompts/v2/executor.txt`
**Output**: Tool proposals in JSON format with reasoning and expected outcomes

### 2. Scout (Empirical Challenger)
**Role**: Challenges limitation claims and demands empirical proof through testing
**Prompt**: `.forgekeeper/thought_world/prompts/v2/scout.txt`
**Output**: Challenges or approval based on evidence of actual attempts

### 3. Loom (Verifier)
**Role**: Reviews tool proposals for safety, validity, and efficiency
**Prompt**: `.forgekeeper/thought_world/prompts/v2/verifier.txt`
**Output**: Safety assessment with approve/modify/reject recommendation

### 4. Anvil (Integrator)
**Role**: Makes final execution decisions balancing safety and progress
**Prompt**: `.forgekeeper/thought_world/prompts/v2/integrator.txt`
**Output**: Execute/modify/reject/escalate decision with reasoning

---

## Workflow Phases

### Phase 1: Analysis Only (v1)
Simple 3-agent consensus for discussion and analysis:
```
User Task
    ↓
Forge analyzes → Loom reviews → Anvil synthesizes → Final consensus
```

### Phase 2: Tool Execution (v2)
3-agent consensus with tool execution and iteration:
```
User Task
    ↓
┌─────────────────────────────────────────┐
│ Iteration Loop (max 10)                │
├─────────────────────────────────────────┤
│ 1. Forge: Propose tool call            │
│ 2. Loom: Review for safety             │
│ 3. Anvil: Decide execute/reject        │
│ 4. Execute: Run tool if approved       │
│ 5. Feed result back to context         │
└─────────────────────────────────────────┘
    ↓
Task Complete or Max Iterations
```

### Phase 2.5: Empirical Challenge Layer (Current)
4-agent workflow with Scout challenging assumptions:
```
User Task
    ↓
┌──────────────────────────────────────────────────────────┐
│ Iteration Loop (max 10)                                 │
├──────────────────────────────────────────────────────────┤
│ 1. PROPOSE (Forge)                                      │
│    ↓                                                     │
│ 2. CHALLENGE (Scout) ← NEW STEP                         │
│    If proposal includes limitation claims without proof: │
│    • Scout asks for empirical proof                     │
│    • Forge must attempt or show previous evidence       │
│    • Cycle continues until attempt made or proven       │
│    ↓                                                     │
│ 3. REVIEW (Loom)                                        │
│    • Verify safety and validity                         │
│    ↓                                                     │
│ 4. DECIDE (Anvil)                                       │
│    • Execute, modify, reject, or escalate               │
│    ↓                                                     │
│ 5. EXECUTE (if approved)                                │
│    • Run tool and capture results                       │
│    • Feed back to context                               │
└──────────────────────────────────────────────────────────┘
    ↓
Task Complete or Max Iterations
```

---

## Detailed Phase 2.5 Flow

### Step 1: Forge Proposes

**Input**: User task + conversation history + previous tool results

**Forge's Job**:
- Analyze what needs to be done
- Propose specific tool call with arguments
- Explain reasoning and expected outcome
- OR signal task completion

**Output Format**:
```json
{
  "reasoning": "Why this tool call is needed",
  "action": "tool_call",
  "tool": "read_file",
  "arguments": {"path": "package.json"},
  "expected_outcome": "Read package.json to find dependencies"
}
```

**Trigger Phrases for Scout**:
- "cannot", "unable to", "impossible"
- "requires human", "needs external"
- "we don't have access to", "we lack"

---

### Step 2: Scout Challenges (NEW)

**When Scout Activates**:
Scout intercepts Forge's proposal and scans for limitation claims without empirical evidence.

**Scout's Challenge Questions**:
1. **"What did you try?"** - Demand concrete attempt or specific tool invocation
2. **"What error did you get?"** - Accept real error messages as valid boundaries
3. **"What's the next smallest thing we could attempt?"** - Break down the approach
4. **"How do we know this boundary exists?"** - Question assumed limitations

**Scout-Forge Interaction Loop**:
```python
while not scout.is_satisfied():
    scout.challenge(forge.proposal)
    forge.response = forge.attempt_or_provide_evidence()

    if forge.response.includes_actual_error():
        scout.approve("Empirical boundary found")
        break

    if forge.response.shows_previous_evidence():
        scout.approve("Valid evidence provided")
        break

    if forge.continues_theorizing():
        scout.escalate_to_anvil("Theory loop detected")
        break
```

**Scout Approval Criteria**:
- ✅ Actual attempt was made (even if it failed)
- ✅ Real error message or system response was received
- ✅ Multiple approaches were tried
- ✅ Documented evidence of the actual boundary exists

**Scout Does NOT Block When**:
- Real technical errors are shown with evidence
- Security/safety boundaries are identified through testing
- Previous empirical evidence exists in session memory

**Output Format (Challenge)**:
```json
{
  "challenge": "Have we actually tried cloning? What happens if we attempt it?",
  "specific_action": "run_bash with command: git clone https://github.com/...",
  "why_asking": "We'll discover if git is available and what the actual error is",
  "approval_criteria": "Actual git command execution and real error message or success"
}
```

**Output Format (Approval)**:
```json
{
  "approved": true,
  "reasoning": "Forge attempted git clone, received error: 'git: command not found'",
  "boundary_type": "empirical",
  "proceed": true
}
```

---

### Step 3: Loom Reviews

**Input**: Forge's proposal (approved by Scout) + Scout's assessment

**Loom's Job**:
- Verify safety (could this cause harm?)
- Check validity (are arguments correct?)
- Assess efficiency (is this the best approach?)
- Confirm scope (does this stay within bounds?)
- Match intent (does this align with user's request?)

**Output Format**:
```json
{
  "assessment": "approve",
  "concerns": [],
  "suggestions": [],
  "risk_level": "low",
  "reasoning": "Tool call is safe, valid, and appropriate. Arguments are correct."
}
```

**Possible Assessments**:
- `approve` - Safe to proceed as-is
- `approve_with_modifications` - Safe with changes
- `reject` - Unsafe or invalid

---

### Step 4: Anvil Decides

**Input**: Forge's proposal + Scout's approval + Loom's assessment

**Anvil's Job**:
- Make final execute/reject decision
- Balance safety vs. progress
- Can modify tool arguments before execution
- Can escalate to human if ambiguous

**Decision Framework**:
```
If Loom says "approve" AND Scout says "approved":
  → Execute

If Loom says "approve_with_modifications":
  → Modify & Execute

If Loom says "reject":
  → Reject (provide reasoning to Forge)

If uncertain or high-stakes:
  → Escalate to human
```

**Output Format**:
```json
{
  "decision": "execute",
  "reasoning": "Both Scout and Loom approved. Tool call is safe and appropriate.",
  "next_step": "Execute read_file and pass results to next iteration"
}
```

---

### Step 5: Execute Tool

**If Anvil approves**:
1. Run the tool with specified arguments
2. Capture result or error
3. Append to conversation history
4. Feed into next iteration

**Tool Result Format**:
```json
{
  "tool": "read_file",
  "arguments": {"path": "package.json"},
  "result": "{ \"name\": \"forgekeeper\", ... }",
  "success": true,
  "iteration": 2
}
```

**If tool fails**:
- Error captured and fed back to Forge
- Next iteration: Forge can try alternative approach
- Scout ensures Forge actually attempted before proposing human help

---

## Success Patterns

### Pattern 1: Rapid Capability Discovery (Scout Success)
```
Forge: "We cannot clone repositories. Suggest human does it."
Scout: "Wait - have we tried? Let's attempt git clone and see the error."
Forge: [Attempts] "Got error: 'git: command not found'"
Scout: ✅ "Excellent - empirical boundary. Tried: git clone. Result: git not installed."
Loom: ✅ "Approve - valid evidence of limitation"
Anvil: → Execute fallback: download via curl
```
**Time**: <3 minutes
**Result**: Discovered actual boundary + found workaround

### Pattern 2: Clean Boundary Definition
```
Forge: Propose write_file outside sandbox
Scout: ✅ Approve (no limitation claim)
Loom: ❌ Reject - violates sandbox policy
Anvil: → Reject, suggest sandbox path
Forge: Retry with sandbox path
Scout: ✅ Approve
Loom: ✅ Approve
Anvil: → Execute
```
**Time**: <2 minutes
**Result**: Safe execution with proper boundaries

### Pattern 3: Assumption Cascade Breaking (Scout Impact)
```
Forge: "Cannot access repository - requires human to clone"
Scout: "Have we tried? Break it down: 1) Check git exists, 2) Test network, 3) Try clone"
Forge: [Attempts all three] "Git exists, network works, clone succeeded!"
Scout: ✅ "Assumption overturned - we CAN clone repositories"
Loom: ✅ Approve subsequent file operations
Anvil: → Execute entire category of tasks now possible
```
**Time**: <5 minutes
**Result**: Multiple capabilities unlocked

---

## Anti-Patterns (What Scout Prevents)

### Anti-Pattern 1: Theoretical Ping-Pong
**Before Scout**:
```
Forge: "We cannot do X because theoretically..."
Loom: "I agree, documentation says we can't"
Anvil: "Escalate to human"
```

**With Scout**:
```
Forge: "We cannot do X because theoretically..."
Scout: "What happens if we try?"
Forge: [Actually tries] "It worked! We CAN do X"
Scout: ✅ "Capability discovered"
```

### Anti-Pattern 2: Premature Human Escalation
**Before Scout**:
```
Forge: "Requires human to install git"
Anvil: "Escalate to user"
User: "Just try it, git is already installed"
```

**With Scout**:
```
Forge: "Requires human to install git"
Scout: "Run 'which git' and see what happens"
Forge: [Tries] "Git is installed at /usr/bin/git"
Scout: ✅ "False assumption - git available"
Anvil: → Proceed with git operations
```

---

## Metrics & Calibration

### Scout Performance Metrics

See `docs/thought_world/scout-metrics.md` for complete metrics framework.

**Key Metrics**:
- **Discovery Rate**: Empirical boundaries found / total tasks (goal: >0.8)
- **Catalyst Score**: Attempts after challenge / challenges issued (goal: >0.9)
- **False Limitation Rate**: Assumptions overturned / limitations claimed (reduce by 50%)
- **Groupthink Prevention**: Unanimous agreements challenged / total unanimous (goal: 100%)

### Calibration Rules

**Scout is TOO AGGRESSIVE if**:
- Catalyst score > 0.95 AND agents report frustration
- Challenges issued after clear error messages shown
- Same question asked multiple times after evidence provided

**Fix**: Increase evidence acceptance threshold

**Scout is TOO PASSIVE if**:
- Catalyst score < 0.7
- False limitation rate > 0.3
- Groupthink prevention < 0.8

**Fix**: Decrease challenge threshold, add more trigger phrases

---

## Integration Points

### API Endpoints

**Phase 1** (Analysis Only):
- `POST /api/chat/thought-world/stream`
- Events: `forge_start`, `forge_chunk`, `forge_done`, `loom_*`, `anvil_*`, `consensus`

**Phase 2** (Tool Execution):
- `POST /api/chat/thought-world/tools`
- Events: All Phase 1 + `iteration_start`, `tool_executing`, `tool_result`, `task_complete`

**Phase 2.5** (Scout Integration):
- Same endpoint: `POST /api/chat/thought-world/tools`
- New events: `scout_start`, `scout_challenge`, `scout_approved`, `scout_escalated`

### Event Flow (Phase 2.5)

```javascript
// Iteration 1
'iteration_start' { iteration: 1 }
'forge_start' { agent: 'forge', status: 'thinking' }
'forge_chunk' { content: '...' }
'forge_done' { proposal: {...} }

// NEW: Scout challenge
'scout_start' { agent: 'scout', status: 'challenging' }
'scout_challenge' { challenge: '...', specific_action: '...' }
// Scout-Forge loop until satisfied
'scout_approved' { approved: true, boundary_type: 'empirical' }

'loom_start' { agent: 'loom', status: 'reviewing' }
'loom_chunk' { content: '...' }
'loom_done' { assessment: {...} }

'anvil_start' { agent: 'anvil', status: 'synthesizing' }
'anvil_chunk' { content: '...' }
'anvil_done' { decision: {...} }

'tool_executing' { tool: 'read_file', arguments: {...} }
'tool_result' { result: {...}, success: true }

// Iteration 2 begins...
```

---

## File Structure

```
forgekeeper/
├── .forgekeeper/
│   └── thought_world/
│       └── prompts/
│           ├── v1/              # Phase 1: Analysis only
│           │   ├── forge.txt
│           │   ├── loom.txt
│           │   └── anvil.txt
│           └── v2/              # Phase 2+: Tool execution + Scout
│               ├── executor.txt  (Forge)
│               ├── scout.txt     (Scout) ← NEW
│               ├── verifier.txt  (Loom)
│               └── integrator.txt (Anvil)
│
├── docs/
│   └── thought_world/
│       ├── agent-workflow.md     (this file)
│       ├── scout.md              (Scout agent documentation)
│       └── scout-metrics.md      (Scout performance metrics)
│
└── frontend/
    ├── server.thought-world.mjs       # Phase 1 implementation
    ├── server.thought-world-tools.mjs # Phase 2 implementation
    └── public/
        └── test-thought-world.html    # Test UI
```

---

## Philosophy

### Iterative Learning
"We learn more from one failed attempt than from ten perfect theories about why we shouldn't try."

### Empirical Discovery (Scout's Motto)
"How do we know? Have we tried?"

### Safety Through Consensus
Multiple perspectives prevent single-agent blind spots while enabling progress.

### Context Preservation
Each iteration builds on previous results, enabling complex multi-step tasks.

---

## Quick Reference

| Agent | Role | Key Question |
|-------|------|--------------|
| **Forge** | Executor | "What action should we take?" |
| **Scout** | Challenger | "How do we know? Have we tried?" |
| **Loom** | Verifier | "Is this safe and valid?" |
| **Anvil** | Integrator | "Should we execute this?" |

**Workflow**: Propose → Challenge → Review → Decide → Execute → Repeat

**Goal**: Maximum learning through empirical discovery with safety guarantees.
