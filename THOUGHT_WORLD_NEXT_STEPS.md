# Thought World: Next Steps

**Current Status**: ✅ Phase 1 Complete - Basic 3-agent consensus working

---

## What We Have Now (Phase 1)

✅ **Multi-agent consensus**: Forge → Loom → Anvil
✅ **Multi-provider support**: OpenAI + Anthropic + Local inference
✅ **Episode logging**: Episodes saved to `.forgekeeper/thought_world/memory/episodes.jsonl`
✅ **Test interface**: `http://localhost:5173/test-thought-world.html`
✅ **API endpoint**: `POST /api/chat/thought-world`

**Current Limitation**: Agents deliberate, but responses are returned all-at-once (no streaming, no tools).

---

## Phase 1.5: Immediate Enhancements (This Week)

### 1. Streaming Agent Responses ⭐ HIGH PRIORITY

**Problem**: Currently you only see final results. No visibility into agent thinking as it happens.

**Solution**: Server-Sent Events (SSE) streaming

**Implementation**:
```javascript
// New endpoint: POST /api/chat/thought-world/stream
// Streams events:
{
  "event": "forge_start",
  "data": { "agent": "forge", "status": "thinking" }
}
{
  "event": "forge_chunk",
  "data": { "agent": "forge", "content": "I propose..." }
}
{
  "event": "forge_done",
  "data": { "agent": "forge", "totalTokens": 1234 }
}
{
  "event": "loom_start",
  "data": { "agent": "loom", "status": "reviewing" }
}
// ... etc for all 3 agents
{
  "event": "consensus",
  "data": { "decision": "approved", "episodeId": "..." }
}
```

**UI Updates**:
- Add 3 side-by-side panels that fill in real-time
- Show "Thinking..." animation while agent is generating
- Highlight current active agent

**Effort**: ~2-3 hours
**Files to modify**: `server.thought-world.mjs`, `test-thought-world.html`

---

### 2. Dynamic Model Selection UI ⭐ HIGH PRIORITY

**Problem**: Currently must edit `.env` and rebuild to change models.

**Solution**: Add UI controls to select models per conversation.

**Implementation**:
```html
<!-- Add to test-thought-world.html -->
<div class="agent-config">
  <h3>Configure Agents</h3>

  <div class="agent-row">
    <label>Forge (Executor)</label>
    <select id="forge-provider">
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="local">Local (vLLM)</option>
    </select>
    <input id="forge-model" placeholder="gpt-4o" />
  </div>

  <div class="agent-row">
    <label>Loom (Verifier)</label>
    <select id="loom-provider">
      <option value="anthropic" selected>Anthropic</option>
      <option value="openai">OpenAI</option>
      <option value="local">Local (vLLM)</option>
    </select>
    <input id="loom-model" placeholder="claude-3-haiku-20240307" />
  </div>

  <div class="agent-row">
    <label>Anvil (Integrator)</label>
    <select id="anvil-provider">
      <option value="anthropic" selected>Anthropic</option>
      <option value="openai">OpenAI</option>
      <option value="local">Local (vLLM)</option>
    </select>
    <input id="anvil-model" placeholder="claude-sonnet-4-5-20250929" />
  </div>
</div>
```

**Backend**:
```javascript
// Accept config in request body
POST /api/chat/thought-world
{
  "messages": [...],
  "agentConfig": {
    "forge": { "provider": "openai", "model": "gpt-4o" },
    "loom": { "provider": "anthropic", "model": "claude-3-haiku-20240307" },
    "anvil": { "provider": "anthropic", "model": "claude-sonnet-4-5-20250929" }
  }
}
```

**Persistence**: Save to localStorage so config persists across page reloads.

**Effort**: ~1-2 hours
**Files to modify**: `server.thought-world.mjs`, `test-thought-world.html`

---

### 3. Conversation Presets ⭐ NICE TO HAVE

Allow saving/loading configurations:

```javascript
const PRESETS = {
  "all-claude": {
    forge: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" },
    loom: { provider: "anthropic", model: "claude-3-haiku-20240307" },
    anvil: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" }
  },
  "mixed-cloud": {
    forge: { provider: "openai", model: "gpt-4o" },
    loom: { provider: "anthropic", model: "claude-3-haiku-20240307" },
    anvil: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" }
  },
  "cost-optimized": {
    forge: { provider: "openai", model: "gpt-4o-mini" },
    loom: { provider: "anthropic", model: "claude-3-haiku-20240307" },
    anvil: { provider: "anthropic", model: "claude-3-haiku-20240307" }
  },
  "local-inference": {
    forge: { provider: "local", model: "core" },
    loom: { provider: "local", model: "core" },
    anvil: { provider: "local", model: "core" }
  }
};
```

**Effort**: ~30 minutes
**Files to modify**: `test-thought-world.html`

---

## Phase 2: Tool Usage + Autonomous Loop (Next Week)

### 1. Tool Integration ⭐⭐⭐ CRITICAL

**Goal**: Agents can call tools (file operations, bash commands, HTTP requests).

**How it works**:
1. **Forge proposes** a tool call (e.g., `write_file`)
2. **Loom reviews** the tool call for safety
3. **Anvil approves** → Tool is executed
4. **Result fed back** to agents for next iteration

**Implementation**:

```javascript
// Forge proposes tool call
{
  "reasoning": "I need to create a test file...",
  "tool_call": {
    "name": "write_file",
    "arguments": {
      "path": "test.md",
      "content": "Hello World"
    }
  }
}

// Loom reviews
{
  "concerns": ["File path should be relative", "Content looks safe"],
  "recommendation": "approve"
}

// Anvil decides
{
  "decision": "approved",
  "execute": true
}

// Orchestrator executes tool
const result = await tools.write_file({ path: "test.md", content: "Hello World" });

// Result fed back to agents
{
  "tool_result": {
    "success": true,
    "path": "/workspace/test.md",
    "bytes_written": 11
  }
}
```

**Available Tools** (from existing Forgekeeper):
- `read_file` - Read file contents
- `write_file` - Create/update files
- `read_dir` - List directory contents
- `run_bash` - Execute bash commands
- `http_fetch` - Make HTTP requests
- `get_time` - Get current time

**Safety**:
- All tool calls must pass Loom verification
- Sandboxed to `.forgekeeper/sandbox/` by default
- High-stakes operations (delete, git push) require unanimous approval

**Effort**: ~4-6 hours
**Files to modify**: `server.thought-world.mjs`, agent prompts

---

### 2. Multi-Step Task Support

**Goal**: Agents can complete complex tasks requiring multiple tool calls.

**Example Task**: "Create a Python function to validate emails, write tests, commit"

**Execution Flow**:
```
Iteration 1:
  Forge: Propose write email_validator.py
  Loom: Review code quality
  Anvil: Approve → Execute write_file

Iteration 2:
  Forge: Propose write test_email_validator.py
  Loom: Review test coverage
  Anvil: Approve → Execute write_file

Iteration 3:
  Forge: Propose run pytest
  Loom: Review (should pass)
  Anvil: Approve → Execute run_bash

Iteration 4:
  Forge: Propose git add + commit
  Loom: Review commit message
  Anvil: Approve → Execute run_bash
```

**Implementation**:
- Add `iteration` counter to orchestrator
- Each iteration = one tool call
- Stop when Forge says "task complete" or max iterations (10) reached

**Effort**: ~2-3 hours
**Files to modify**: `server.thought-world.mjs`

---

### 3. Episodic Memory Search

**Goal**: Agents learn from past experiences.

**Current**: Episodes are logged but not used.

**Next**: Load relevant past episodes into agent context.

**Implementation**:
```javascript
// Before calling Forge, load similar episodes
const relevantEpisodes = await searchEpisodes(task, { limit: 3 });

// Inject into Forge's prompt
const context = {
  task,
  pastExperiences: relevantEpisodes.map(ep => ({
    task: ep.task,
    outcome: ep.consensus.decision,
    lessons: ep.integrator.content.match(/Lesson learned:.*/)?.[0]
  }))
};
```

**Search Strategy**:
1. Keyword match (simple)
2. Recency bias (last 10 episodes weighted higher)
3. Future: Semantic similarity (embeddings)

**Effort**: ~2-3 hours
**Files to create**: `server.episodic-memory.mjs`

---

## Phase 3: Advanced Features (Long-term)

### 1. Full UI Integration

**Goal**: Integrate into main Forgekeeper Chat.tsx

**Features**:
- Mode selector: "Standard Chat" vs "Thought World (Multi-Agent)"
- See agent deliberation in DiagnosticsDrawer
- Toggle individual agent visibility
- Export episode as Markdown

### 2. Gaming Detection

**Goal**: Detect when agents try to game metrics

**Patterns to detect**:
- Repetitive justifications
- Generic reasoning ("this seems good")
- Value-washing (claiming alignment without evidence)

**Implementation**:
- Add pattern matching to Loom's review
- Flag suspicious episodes
- Require human review for flagged episodes

### 3. Agent Specialization

**Goal**: Add specialized agents

**Candidates**:
- **Security Agent**: Reviews all code changes for vulnerabilities
- **Performance Agent**: Optimizes for efficiency
- **Documentation Agent**: Ensures proper docs/comments
- **Test Agent**: Validates test coverage

**Integration**: 4-agent or 5-agent consensus for complex tasks.

---

## Recommended Implementation Order

### This Week (Phase 1.5):
1. ✅ **Streaming responses** (2-3 hours) - HIGH IMPACT
2. ✅ **Dynamic model selection UI** (1-2 hours) - HIGH IMPACT
3. ⏸️ Conversation presets (30 min) - Nice to have

### Next Week (Phase 2):
1. ✅ **Tool integration** (4-6 hours) - CRITICAL
2. ✅ **Multi-step task support** (2-3 hours) - CRITICAL
3. ✅ **Episodic memory search** (2-3 hours) - Enables learning
4. ⏸️ Gaming detection (4-6 hours) - Can defer

### Future (Phase 3):
1. Full UI integration into Chat.tsx
2. Advanced emergence metrics
3. Cross-session learning
4. Agent specialization

---

## Testing Strategy

### Phase 1.5 Tests:
- Streaming: Verify all 3 agents stream correctly
- Model selection: Test all provider combinations (OpenAI/Anthropic/Local)

### Phase 2 Tests:
- **Tool safety**: Try malicious tool calls, verify Loom blocks them
- **Multi-step**: Run complex task (implement → test → commit)
- **Memory**: Verify agents cite past episodes

### Phase 3 Tests:
- **Gaming detection**: Simulate gaming attempt, verify flagging
- **Specialization**: Test 4-agent consensus on security-critical code

---

## Cost Estimates

### Phase 1.5 (Streaming + UI):
- **Free** (no additional API calls)

### Phase 2 (Tools + Memory):
- **$5-10/week** during development (testing iterations)
- **$0.10-0.50/task** in production (depending on complexity)

### Cost Optimization Tips:
1. Use **Haiku for Loom** (10x cheaper than Sonnet)
2. Use **local inference for Forge** during development (free)
3. Cache system prompts (Anthropic prompt caching saves 90%)
4. Limit tool iterations to 10 max

---

## Questions for You

1. **Streaming**: Do you want to see streaming ASAP? (2-3 hours to implement)
2. **Tool usage**: Should we prioritize this for next week?
3. **Model selection**: Do you want UI controls or just .env config?
4. **Multi-step tasks**: What's a good test task? (e.g., "Implement feature X with tests")

Let me know your priorities and I can start implementing!
