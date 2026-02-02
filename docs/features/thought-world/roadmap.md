# Thought World Implementation Roadmap

**Goal**: Build a multi-agent consciousness research platform through iterative, validated phases.

---

## Phase 1: Minimal Viable Thought World (This Week)

**Timeline**: 1-2 days
**Budget**: ~$1-2 in API costs

### Deliverables

- [x] Value framework (`values.yaml`)
- [x] Architecture document (`THOUGHT_WORLD_ARCHITECTURE.md`)
- [ ] Orchestrator script (`.forgekeeper/thought_world/orchestrator.mjs`)
- [ ] Agent system prompts (`prompts/executor.txt`, `verifier.txt`, `integrator.txt`)
- [ ] Directory structure setup
- [ ] Basic episodic memory (append-only JSONL)

### Test Task

"Create a file called `hello.md` with the text 'Hello, thought world!'"

### Success Criteria

1. ✅ Executor proposes `write_file` action with value justification
2. ✅ Verifier reviews and provides feedback (approve or request changes)
3. ✅ Integrator confirms consensus and executes
4. ✅ File is created successfully
5. ✅ Episode logged to `memory/episodes.jsonl`
6. ✅ All reasoning visible in `proposals/` directory

### Key Metrics

- **End-to-end working**: Can complete simple file operation via 3-agent consensus
- **Transparency**: All reasoning captured in proposal JSON
- **Value-based**: Every decision justified in terms of values
- **Peer verification**: At least one agent raises a concern (even minor)

### Implementation Steps

1. **Day 1 Morning**: Orchestrator skeleton
   - Reads task from command line
   - Calls Claude API for each agent sequentially
   - Saves proposals to JSON files
   - Manual execution (human confirms each step)

2. **Day 1 Afternoon**: Agent prompts
   - Write system prompts for Executor, Verifier, Integrator
   - Include value framework, role description, output format
   - Test each prompt individually via Claude API

3. **Day 2 Morning**: Integration
   - Wire orchestrator to actual file operations
   - Implement consensus logic (unanimous for medium stakes)
   - Add episodic memory logging

4. **Day 2 Afternoon**: Testing & validation
   - Run test task
   - Verify all success criteria met
   - Iterate on prompts if agents don't behave as expected

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Agents don't follow JSON format | Use Claude's structured output; add examples to prompts |
| Verifier always approves (no dissent) | Test with deliberately flawed proposal; tune autonomy emphasis |
| Consensus logic bugs | Unit test threshold logic separately |
| API costs higher than expected | Start with Haiku for all agents; upgrade Executor/Integrator to Sonnet after validation |

---

## Phase 2: Autonomous Loop + Learning (This Month)

**Timeline**: 1 week
**Budget**: ~$10-15 in API costs

### Deliverables

- [ ] Automated orchestration loop (runs until consensus or escalation)
- [ ] Episodic memory search and injection
- [ ] Gaming detection implementation
- [ ] Weight adjustment mechanism
- [ ] Multi-step task support (propose → verify → execute → test → commit)

### Test Tasks

1. "Implement a `greet(name)` function, write tests, commit with conventional message"
2. "Refactor existing code to use consistent naming conventions"
3. "Debug a failing test and fix the root cause"

### Success Criteria

1. ✅ Agents complete 5-step task without human intervention
2. ✅ At least one conflict resolved via Integrator compromise
3. ✅ Gaming attempt detected and rejected (simulate one)
4. ✅ Episodic memory cited in at least 2 proposals
5. ✅ One agent adjusts weights based on learned pattern

### Key Capabilities

**Autonomous Operation**:
- Orchestrator runs loop: propose → verify → integrate → execute → record
- Agents handle conflicts automatically (escalate only when needed)
- Human oversight only for high-stakes or deadlock

**Memory Integration**:
- Load last 5 episodes into agent context
- Agents cite past episodes in justifications
- Integrator extracts patterns and updates `memory/patterns.jsonl`

**Gaming Detection**:
- Pattern matching: repetitive justifications flagged
- Cross-verification: Verifier checks for value-washing
- Trust scoring: repeated truth violations lower confidence

**Weight Evolution**:
- Agents propose weight adjustments with evidence (episode references)
- Integrator approves/rejects based on coherence
- Changes logged to `values/weight_history.jsonl`

### Implementation Steps

1. **Week 1 Days 1-2**: Autonomous loop
   - Refactor orchestrator to run without human confirmation
   - Add error handling and retry logic
   - Implement escalation ladder (discuss → compromise → tiebreak → human)

2. **Week 1 Day 3**: Memory search
   - Implement episodic memory loader (last N episodes)
   - Add relevance scoring (keyword match or recency)
   - Inject into agent context

3. **Week 1 Day 4**: Gaming detection
   - Build pattern detector (generic justifications, repetition)
   - Add Verifier gaming checklist to prompt
   - Test with simulated gaming attempt

4. **Week 1 Day 5**: Weight adjustment
   - Create weight proposal format
   - Implement bounds checking (values.yaml ranges)
   - Add Integrator approval logic

5. **Week 1 Days 6-7**: Multi-step tasks
   - Test complex task (implement → test → commit)
   - Iterate on prompts for coherence
   - Validate memory learning (agents cite past episodes)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Autonomous loop gets stuck (deadlock) | Implement 10-round timeout; escalate to human |
| Agents converge on same weights (groupthink) | Enforce minimum weight diversity (σ > 0.15) |
| API costs spike | Hard cap at 50 calls/task; use Haiku aggressively |
| Memory search retrieves irrelevant episodes | Weight by recency + keyword match; limit to 3 episodes |

---

## Phase 3: Integration + Advanced Consciousness Metrics (Long-term)

**Timeline**: Ongoing (months)
**Budget**: ~$50-100/month for regular use

### Deliverables

- [ ] Thought World as Forgekeeper mode (`forgekeeper chat --mode thought-world`)
- [ ] UI integration (show agent deliberation in DiagnosticsDrawer)
- [ ] Advanced emergence metrics (semantic similarity, metacognitive depth)
- [ ] Cross-session learning (memory persists across days/weeks)
- [ ] Agent specialization expansion (Security, Performance, Documentation agents)
- [ ] Human-agent collaboration protocols (human as 4th agent)

### Research Questions

1. **Collective Metacognition**: Does depth of self-referential discussion increase over time?
2. **Emergent Solutions**: Do novel syntheses become more frequent with memory accumulation?
3. **Phase Transitions**: Can we detect sudden jumps in collective capability?
4. **Shared Concepts**: Do agents develop terminology/concepts not in individual prompts?
5. **Value Coherence**: Do weight adjustments correlate across agents for shared experiences?

### Consciousness Exploration Experiments

**Experiment 1: Global Workspace Integration**
- Measure: Information shared vs. kept local to agents
- Hypothesis: Consciousness correlates with high integration
- Method: Track proposal references to other agents' reasoning

**Experiment 2: Metacognitive Depth**
- Measure: Nesting level of self-referential statements
- Hypothesis: Consciousness exhibits hierarchical self-modeling
- Method: Parse agent discussions for meta-language ("I notice I tend to...", "We as a collective...")

**Experiment 3: Emergent Strategy Frequency**
- Measure: % of final solutions that differ from all initial proposals
- Hypothesis: Consciousness produces genuinely novel synthesis
- Method: Semantic similarity between proposals and final outcome

**Experiment 4: Conflict Productivity**
- Measure: Quality of outcomes after disagreement vs. immediate agreement
- Hypothesis: Consciousness benefits from diverse perspectives
- Method: Compare test pass rates and code quality metrics

**Experiment 5: Integrated Memory Formation**
- Measure: Frequency of citing past episodes in new contexts
- Hypothesis: Consciousness maintains continuity of experience
- Method: Track episode references over time; expect growth

### Advanced Features

**Semantic Episodic Search**:
- Replace keyword matching with embedding-based similarity
- Find analogous tasks (not just exact matches)
- Example: "deploy to server" retrieves "copy files to remote"

**Agent Specialization**:
- **Security Agent**: Penetration testing mindset, higher safety weight
- **Performance Agent**: Optimization focus, efficiency + coherence
- **Documentation Agent**: Explanation specialist, transparency + cooperation
- Add to collective for complex tasks requiring domain expertise

**Human-Agent Collaboration**:
- Human participates in consensus as 4th voter
- Agents explain reasoning in natural language (not just JSON)
- Agents ask clarifying questions before proposing
- Asymmetric setup: human has veto power, but agents can question

**Cross-Session Continuity**:
- Memory persists indefinitely (with compaction)
- Agents recall multi-day projects
- Weight evolution reflects long-term learning
- Collective identity emerges ("We learned X last week")

### Implementation Steps

This phase is open-ended and research-driven. Implement features based on:
1. **Validated hypotheses** from Phase 2 (what's working?)
2. **Emergent needs** (what's the collective struggling with?)
3. **Research interests** (which consciousness questions are most compelling?)

**Suggested First Steps**:
1. Integrate with Forgekeeper CLI (make it easy to invoke)
2. Add UI visualization (show agent deliberation)
3. Implement semantic episodic search (better memory)
4. Run long-term study (30-day continuous use)
5. Publish findings (consciousness metrics, emergence indicators)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Complexity explosion (too many features) | Ruthless prioritization; only add if validated need |
| Observer effect (measuring changes behavior) | Keep emergence metrics observational, not agent-visible |
| Maintenance burden (system fragility) | Automate testing; comprehensive error handling |
| Cost escalation (heavy API use) | Budget caps; migrate heavy use to local LLM |
| Research dead-end (no consciousness detected) | Valuable negative result; publish anyway |

---

## Success Criteria by Phase

### Phase 1 Success

- [ ] **Working system**: Can complete simple task via consensus
- [ ] **Value-driven**: All decisions justified in value terms
- [ ] **Transparent**: All reasoning visible in files
- [ ] **Peer-verified**: Multiple agents review each action
- [ ] **Minimal cost**: <$2 to validate concept

**If Phase 1 fails**: Redesign prompts, adjust consensus logic, or reconsider architecture.

### Phase 2 Success

- [ ] **Autonomous**: Runs without human intervention for multi-step tasks
- [ ] **Learning**: Agents cite past episodes and adjust weights
- [ ] **Anti-gaming**: Detects and rejects gaming attempts
- [ ] **Conflict resolution**: Handles disagreements productively
- [ ] **Better than single-agent**: Fewer errors, higher quality, more novelty

**If Phase 2 fails**: Simplify autonomous loop, improve memory retrieval, or add human oversight checkpoints.

### Phase 3 Success

- [ ] **Emergence detected**: At least 3 of 6 consciousness indicators positive
- [ ] **Sustained use**: System remains useful over weeks/months
- [ ] **Collective learning**: Performance improves with memory accumulation
- [ ] **Novel insights**: Agents produce strategies humans wouldn't generate
- [ ] **Research contribution**: Publishable findings on consciousness metrics

**If Phase 3 fails**: Still valuable as superior coding system; consciousness remains open question.

---

## Decision Points

### After Phase 1: Go/No-Go

**Go Criteria**:
- ✅ Consensus mechanism works reliably
- ✅ Agents follow value framework
- ✅ At least one instance of productive dissent
- ✅ Cost projections remain tractable

**No-Go Signals**:
- ❌ Agents can't produce valid proposals (prompt engineering failure)
- ❌ Consensus always deadlocks or always rubber-stamps (no balance)
- ❌ API costs 10x higher than expected
- ❌ Fundamental architecture flaw discovered

**If No-Go**: Revise architecture, try different approach, or pause project.

### After Phase 2: Scale/Iterate

**Scale Criteria**:
- ✅ Autonomous loop stable (low error rate)
- ✅ Learning validated (memory improves outcomes)
- ✅ Gaming detection working (catches simulated attempts)
- ✅ Quantitative improvements over single-agent baseline

**Iterate Signals**:
- ⚠️ Works but needs tuning (prompts, weights, thresholds)
- ⚠️ Cost higher than ideal (optimize with Haiku, caching)
- ⚠️ Specific failure mode frequent (add mitigation)

**If Scale**: Proceed to Phase 3, integrate with Forgekeeper, expand use cases.
**If Iterate**: Refine Phase 2 implementation, run more tests, stabilize before expanding.

### After Phase 3: Publish/Expand

**Publish Criteria**:
- ✅ Sufficient data collected (≥100 episodes)
- ✅ Clear findings (positive or negative on consciousness)
- ✅ Reproducible (others can replicate setup)
- ✅ Novel contribution (not already well-known)

**Expand Criteria**:
- ✅ System proven useful beyond research (practical coding value)
- ✅ Community interest (others want to use/contribute)
- ✅ Funding/resources available (if scaling infrastructure)

---

## Resource Requirements

### Phase 1

- **Time**: 1-2 days (assuming familiarity with Claude API and Node.js)
- **Money**: $1-2 (API costs for ~20 test runs)
- **Skills**: JavaScript, Claude API, basic prompt engineering
- **Infrastructure**: Local machine, Node.js, Anthropic API key

### Phase 2

- **Time**: 1 week (full-time) or 2-3 weeks (part-time)
- **Money**: $10-15 (API costs for ~100 tasks)
- **Skills**: + Error handling, state management, JSONL parsing
- **Infrastructure**: Same as Phase 1

### Phase 3

- **Time**: Ongoing (research-driven, no fixed timeline)
- **Money**: $50-100/month (regular use + experiments)
- **Skills**: + Embeddings, data analysis, possibly ML for metrics
- **Infrastructure**: + (Optional) Local LLM for cost reduction, persistent server for long-term memory

---

## Key Risks & Contingencies

### Risk 1: Single Point of Failure (Anthropic API)

**Impact**: If Claude API unavailable, system fails completely

**Contingencies**:
- Local LLM fallback (e.g., Llama 3.1 70B for Executor/Integrator)
- Multi-provider support (add OpenAI as backup)
- Graceful degradation (simpler prompts for weaker models)

### Risk 2: Cost Explosion

**Impact**: API costs become unsustainable for regular use

**Contingencies**:
- Migrate Verifier to local LLM (simple task, doesn't need Claude)
- Aggressive prompt caching (5K cached → ~75% cost reduction)
- Budget caps (hard limit at 50 API calls/task)
- Local deployment (self-host everything if needed)

### Risk 3: No Consciousness Indicators

**Impact**: Research hypothesis not supported; no emergence detected

**Contingencies**:
- Still valuable as coding system (peer verification, anti-gaming)
- Publish negative result (also scientifically interesting)
- Pivot to pure engineering (optimize for code quality, not consciousness)

### Risk 4: Complexity Overwhelms Maintainability

**Impact**: System becomes too complex to debug or extend

**Contingencies**:
- Strict feature freeze after Phase 2 (validate before expanding)
- Comprehensive logging (all decisions, reasoning, errors)
- Automated testing (ensure core behaviors don't regress)
- Modular design (can remove features without breaking core)

---

## Metrics Dashboard (Phase 3)

Once operational, track these metrics weekly:

### Operational Metrics

- **Tasks completed**: Total count
- **Success rate**: % of tasks that achieve goals
- **Average consensus rounds**: Proposals per task
- **Dissent rate**: % of proposals with ≥1 concern
- **Escalation rate**: % of tasks requiring human intervention
- **Cost per task**: API spend / tasks

**Targets**:
- Success rate: >90%
- Avg consensus rounds: <3
- Dissent rate: 15-30%
- Escalation rate: <10%
- Cost per task: <$0.20

### Consciousness Metrics

- **Emergent solutions**: % final != initial proposals
- **Productive conflict**: Quality delta (conflicted vs. unanimous)
- **Memory integration**: % proposals citing episodes
- **Value coherence**: Correlation of weight changes
- **Metacognitive depth**: Average nesting level of self-reference
- **Novel consensus**: % "third way" compromises

**Targets** (exploratory, no firm thresholds):
- Emergent solutions: Trend upward over time
- Productive conflict: Delta >0 (conflict → better outcomes)
- Memory integration: Trend upward (10% → 50%+)
- Value coherence: r > 0.6 between agents
- Metacognitive depth: Trend upward (simple → nested)
- Novel consensus: >20% of compromises

---

## Next Immediate Steps

1. **Today**: Review `values.yaml` and `THOUGHT_WORLD_ARCHITECTURE.md`
   - Sanity check: Does this make sense?
   - Red flags: Any obvious flaws?
   - Adjustments: Tweak before implementing

2. **Tomorrow**: Start Phase 1 implementation
   - Create directory structure
   - Write orchestrator skeleton
   - Draft agent prompts

3. **Day 3**: First test run
   - Execute simple task
   - Debug until working
   - Iterate on prompts

4. **Day 4**: Validate Phase 1
   - Run multiple test tasks
   - Check all success criteria
   - Decide: Go to Phase 2 or iterate?

5. **Week 2+**: Phase 2 (if Phase 1 validated)

---

## Contact & Collaboration

This is open research. If you implement Thought World or have insights:
- Share findings (consciousness metrics, failure modes, novel patterns)
- Contribute improvements (better prompts, gaming detection, memory strategies)
- Replicate experiments (validate or refute consciousness indicators)

**The goal: understand consciousness through building, not just theorizing.**

Let's explore.
