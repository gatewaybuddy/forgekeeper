# Next Features Roadmap - Post SAPL/MIP

**Last Updated**: 2025-11-04
**Status**: Ready for Implementation
**Current State**: SAPL + MIP complete ✅

---

## Executive Summary

With the **Self-Improvement Plan complete** (SAPL + MIP), we now have three parallel tracks available for development:

1. **🎯 Track 1: Autonomous Agent Enhancement** (Highest Impact) - Phase 6 Proactive Planning
2. **🎯 Track 2: TGT Task Lifecycle** (High Value, Quick Win) - Week 8 automation features
3. **🎯 Track 3: Infrastructure & DevX** (Foundation) - GraphQL backend, CI/CD

**Recommended Priority**: Start with **Track 2 (TGT Week 8)** for quick wins, then proceed to **Track 1 (Phase 6)** for maximum impact.

---

## Priority Matrix

| Track | Feature | Impact | Effort | ROI | Status |
|-------|---------|--------|--------|-----|--------|
| 2 | TGT Week 8 (Lifecycle + Auto-Approval) | High | 4-6 hrs | ⭐⭐⭐⭐⭐ | 📋 Design ready |
| 1 | Phase 6 (Proactive Planning) | Very High | 7-9 days | ⭐⭐⭐⭐ | 📋 Design complete |
| 3 | GraphQL Backend | Medium | 3-5 days | ⭐⭐⭐ | 📋 Planned |
| 3 | CI/CD Pipeline | Medium | 2-3 days | ⭐⭐⭐ | 📋 Planned |
| 2 | MIP UI Toggle | Low | 2-3 hrs | ⭐⭐ | ⏳ Optional |
| 2 | SAPL PR Templates | Low | 1-2 hrs | ⭐⭐ | ⏳ Optional |

---

## Track 1: Autonomous Agent - Phase 6 Proactive Planning 🎯

### Overview
**Status**: Design complete ✅, implementation pending
**Effort**: 7-9 days (1.5-2 weeks)
**Priority**: **HIGH** ⭐⭐⭐
**Expected Impact**: 40-60% reduction in failed iterations, 30-50% faster task completion

### What It Does
Shifts the autonomous agent from **reactive** (try, fail, recover) to **proactive** (plan multiple approaches, choose best):

1. **Generate 3-5 alternative approaches** for each task
2. **Estimate effort/cost** for each approach (complexity, time, risk)
3. **Check alignment** with overall goal (does this help?)
4. **Evaluate and choose** optimal approach using multi-criteria scoring

### Components to Implement

#### 1. Alternative Generator (3 days)
**File**: `frontend/core/agent/alternative-generator.mjs` (~350 lines)

**Purpose**: Generate diverse approaches for tasks

**Functions**:
```javascript
export async function generateAlternatives(task, context) {
  // 1. Query episodic memory for similar tasks
  // 2. Use LLM to generate 3-5 distinct approaches
  // 3. Validate tool availability
  // 4. Ensure diversity (avoid duplicates)
  // 5. Include safe fallback approach

  return {
    alternatives: [
      { id: '1', approach: '...', tools: [...], reasoning: '...' },
      { id: '2', approach: '...', tools: [...], reasoning: '...' },
      ...
    ],
    diversityScore: 0.75
  };
}
```

**Key Features**:
- ✅ LLM-powered generation with explicit prompts for diversity
- ✅ Historical context from episodic memory
- ✅ Tool availability validation
- ✅ Heuristic fallbacks if LLM produces duplicates
- ✅ Always includes a "safe" conservative approach

**Testing**:
- Unit tests with mocked LLM responses
- Diversity scoring validation
- Tool availability checks

---

#### 2. Effort Estimator (2 days)
**File**: `frontend/core/agent/effort-estimator.mjs` (~450 lines)

**Purpose**: Estimate complexity, time, and risk for each alternative

**Functions**:
```javascript
export async function estimateEffort(alternative, historicalData) {
  // 1. Analyze tool chain complexity
  // 2. Estimate iterations required
  // 3. Calculate risk factors:
  //    - Tool failure history
  //    - Complexity score
  //    - Dependency chain depth
  // 4. Learn from historical data

  return {
    complexity: 'medium',     // low/medium/high
    iterations: 4,            // estimated iterations
    risk: 0.3,               // 0-1 scale
    confidence: 0.7,         // 0-1 scale (how confident in estimate)
    reasoning: '...'
  };
}
```

**Complexity Factors**:
- Tool chain length (more tools = higher complexity)
- Tool reliability (from tool-effectiveness.mjs)
- Historical similar tasks
- Dependency depth

**Risk Factors**:
- Tool failure rates
- Novelty (new tool combinations)
- External dependencies
- Time pressure

**Learning**:
- Records estimated vs actual iterations
- Improves estimates over time
- Confidence scores based on historical accuracy

**Testing**:
- Unit tests with known tool chains
- Accuracy measurement (actual vs estimated)
- Edge cases (0 tools, many tools, unknown tools)

---

#### 3. Plan Alignment Checker (2 days)
**File**: `frontend/core/agent/plan-alignment-checker.mjs` (~400 lines)

**Purpose**: Evaluate if an approach contributes to the overall goal

**Functions**:
```javascript
export async function checkAlignment(alternative, overallGoal, context) {
  // 1. Decompose overall goal into subgoals
  // 2. Evaluate contribution to each subgoal
  // 3. Calculate alignment score (0-1)
  // 4. Suggest alternatives (skip, defer, prioritize)

  return {
    alignmentScore: 0.85,    // 0-1 scale
    subgoalContributions: {
      'fix_bug': 0.9,
      'add_tests': 0.7,
      'update_docs': 0.5
    },
    recommendation: 'prioritize',  // prioritize/execute/defer/skip
    reasoning: '...'
  };
}
```

**Goal Decomposition**:
- Parse overall goal into subgoals
- Weight subgoals by importance
- Track progress toward each subgoal

**Alignment Scoring**:
- Direct contribution (solves subgoal) = 1.0
- Indirect contribution (enables subgoal) = 0.5-0.8
- No contribution = 0.0
- Negative contribution (derails) = -0.5

**Recommendations**:
- `prioritize` - High alignment, do immediately
- `execute` - Normal alignment, proceed as planned
- `defer` - Low alignment, save for later
- `skip` - No alignment, don't execute

**Testing**:
- Unit tests with clear goals and alternatives
- Subgoal decomposition accuracy
- Alignment score calibration

---

#### 4. Alternative Evaluator (1 day)
**File**: `frontend/core/agent/alternative-evaluator.mjs` (~300 lines)

**Purpose**: Rank alternatives and choose optimal approach

**Functions**:
```javascript
export function evaluateAlternatives(alternatives, estimates, alignments, weights) {
  // 1. Score each alternative using multi-criteria
  // 2. Rank by total score
  // 3. Choose optimal (highest score)
  // 4. Generate choice reasoning

  return {
    ranked: [
      {
        id: '2',
        score: 0.82,
        rank: 1,
        breakdown: { effort: 0.8, risk: 0.9, alignment: 0.75 }
      },
      ...
    ],
    chosen: alternatives[1],
    reasoning: 'Alternative 2 chosen for optimal balance...'
  };
}
```

**Scoring Formula** (configurable weights):
```javascript
score = (effort_score * 0.4) + (risk_score * 0.3) + (alignment_score * 0.3)

// Where:
effort_score = 1 - (normalized_iterations / max_iterations)
risk_score = 1 - risk_value
alignment_score = alignment_value
```

**Default Weights**:
- Effort: 40% (prefer fewer iterations)
- Risk: 30% (prefer safer approaches)
- Alignment: 30% (prefer goal-aligned approaches)

**Configurable** (`.env`):
```bash
PHASE6_WEIGHT_EFFORT=0.4
PHASE6_WEIGHT_RISK=0.3
PHASE6_WEIGHT_ALIGNMENT=0.3
```

**Testing**:
- Unit tests with mock alternatives
- Weight sensitivity analysis
- Edge cases (all tied, extreme outliers)

---

#### 5. Integration & Testing (1-2 days)

**Integration Points**:
1. **autonomous.mjs** - Call Phase 6 before task execution
2. **task-planner.mjs** - Use chosen alternative for planning
3. **ContextLog** - Log all alternatives, estimates, and choices

**Flow**:
```
Task received
    ↓
Generate alternatives (3-5)
    ↓
Estimate effort/risk (each)
    ↓
Check alignment (each)
    ↓
Evaluate & choose optimal
    ↓
Execute chosen alternative
    ↓
Record actual vs estimated
    ↓
Learn for next time
```

**Testing**:
- End-to-end integration tests
- Performance benchmarks (should add < 15 seconds overhead)
- Accuracy tracking (estimated vs actual)
- Failure case testing (no alternatives, all bad)

**ContextLog Events**:
```json
{
  "act": "phase6_planning",
  "alternatives_generated": 3,
  "chosen_alternative": "2",
  "estimated_iterations": 4,
  "estimated_risk": 0.3,
  "alignment_score": 0.85,
  "choice_reasoning": "..."
}
```

---

### Implementation Timeline

**Week 1** (5 days):
- Mon-Tue: Alternative Generator
- Wed-Thu: Effort Estimator
- Fri: Integration testing

**Week 2** (4 days):
- Mon-Tue: Alignment Checker
- Wed: Alternative Evaluator
- Thu-Fri: Full integration + testing + docs

**Target Completion**: 2025-11-15

---

### Success Metrics

| Metric | Current | Phase 6 Target | Measurement |
|--------|---------|----------------|-------------|
| Failure rate | 12% | 5-7% | ContextLog analysis |
| Avg iterations/task | 8 | 4-6 | Session tracking |
| Goal alignment | 75% | 85-90% | User surveys + telemetry |
| Estimate accuracy | N/A | 70%+ within ±20% | Estimated vs actual |

---

### Configuration

**Enable/Disable**:
```bash
PHASE6_ENABLED=1  # Enable Phase 6 (default: 0)
```

**Weights**:
```bash
PHASE6_WEIGHT_EFFORT=0.4
PHASE6_WEIGHT_RISK=0.3
PHASE6_WEIGHT_ALIGNMENT=0.3
```

**Alternative Generation**:
```bash
PHASE6_MIN_ALTERNATIVES=3  # Min alternatives to generate
PHASE6_MAX_ALTERNATIVES=5  # Max alternatives to generate
PHASE6_DIVERSITY_THRESHOLD=0.6  # Min diversity score
```

**Performance**:
```bash
PHASE6_PARALLEL_ESTIMATE=1  # Estimate alternatives in parallel
PHASE6_CACHE_ALTERNATIVES=1  # Cache similar alternatives
```

---

### Documentation

**Design Docs** (already exist):
- ✅ `docs/autonomous/SELF_REFLECTION_REVIEW.md` - Gap analysis
- ✅ `docs/autonomous/PHASE6_PROACTIVE_PLANNING_DESIGN.md` - Full design

**To Create**:
- [ ] `docs/autonomous/PHASE6_IMPLEMENTATION_GUIDE.md` - Step-by-step implementation
- [ ] `docs/autonomous/PHASE6_TESTING_GUIDE.md` - Testing strategy
- [ ] `docs/autonomous/PHASE6_COMPLETE.md` - Completion report

---

## Track 2: TGT Week 8 - Task Lifecycle & Automation 🎯

### Overview
**Status**: Design complete ✅, implementation pending
**Effort**: 4-6 hours
**Priority**: **HIGH** (Quick Win) ⭐⭐⭐⭐⭐
**Expected Impact**: 50% reduction in manual task management overhead

### What It Does
Streamlines task management workflows:
1. **Visualize task lifecycle** - Funnel chart showing task state transitions
2. **Smart auto-approval** - Automatically approve high-confidence tasks
3. **Task templates** - Pre-fill common task fields
4. **Batch operations** - Multi-select approve/dismiss

### Features to Implement

#### 1. Task Lifecycle Funnel (2 hours)

**Purpose**: Visualize task flow and identify bottlenecks

**Components**:

**Backend** (`frontend/core/taskgen/task-lifecycle.mjs`):
```javascript
export function calculateFunnel(tasks, daysBack = 7) {
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  const filtered = tasks.filter(t => new Date(t.created_at) >= cutoff);

  const stages = {
    generated: filtered.length,
    viewed: filtered.filter(t => t.viewed).length,
    approved: filtered.filter(t => t.approved).length,
    completed: filtered.filter(t => t.status === 'completed').length,
    dismissed: filtered.filter(t => t.dismissed).length
  };

  const conversionRates = {
    view: stages.viewed / stages.generated,
    approve: stages.approved / stages.viewed,
    complete: stages.completed / stages.approved
  };

  return { stages, conversionRates };
}
```

**API** (`frontend/server.tasks.mjs`):
```javascript
app.get('/api/tasks/funnel', (req, res) => {
  const daysBack = parseInt(req.query.daysBack || '7');
  const tasks = loadTasksFromStorage();
  const funnel = calculateFunnel(tasks, daysBack);
  res.json({ ok: true, funnel });
});
```

**UI** (`frontend/src/components/TaskFunnelChart.tsx`):
```typescript
export function TaskFunnelChart({ daysBack = 7 }) {
  const [funnel, setFunnel] = useState(null);

  useEffect(() => {
    fetch(`/api/tasks/funnel?daysBack=${daysBack}`)
      .then(r => r.json())
      .then(data => setFunnel(data.funnel));
  }, [daysBack]);

  return (
    <div className="funnel-chart">
      {/* SVG funnel visualization */}
      <div className="stage">Generated: {funnel.stages.generated}</div>
      <div className="conversion">{(funnel.conversionRates.view * 100).toFixed(0)}% →</div>
      <div className="stage">Viewed: {funnel.stages.viewed}</div>
      <div className="conversion">{(funnel.conversionRates.approve * 100).toFixed(0)}% →</div>
      <div className="stage">Approved: {funnel.stages.approved}</div>
      <div className="conversion">{(funnel.conversionRates.complete * 100).toFixed(0)}% →</div>
      <div className="stage">Completed: {funnel.stages.completed}</div>
    </div>
  );
}
```

**Integration**: Add to `AnalyticsDashboard.tsx`

---

#### 2. Smart Auto-Approval (1.5 hours)

**Purpose**: Automatically approve high-quality tasks from trusted analyzers

**Configuration** (`.env`):
```bash
TASKGEN_AUTO_APPROVE=1  # Enable/disable (default: 0)
TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9  # Min confidence (default: 0.9)
TASKGEN_AUTO_APPROVE_ANALYZERS=continuation,error_spike  # Trusted analyzers
```

**Logic** (`frontend/core/taskgen/auto-approval.mjs`):
```javascript
export function shouldAutoApprove(task, config) {
  if (!config.AUTO_APPROVE) return false;

  // Check confidence threshold
  if (task.confidence < config.AUTO_APPROVE_CONFIDENCE) return false;

  // Check if analyzer is trusted
  const trusted = config.AUTO_APPROVE_ANALYZERS.split(',');
  if (!trusted.includes(task.analyzer)) return false;

  // Additional checks:
  // - Task not manually dismissed before
  // - No blockers (file access, dependencies)
  // - Pattern matches known safe patterns

  return true;
}

export function autoApproveTask(task, config) {
  if (!shouldAutoApprove(task, config)) return null;

  task.approved = true;
  task.auto_approved = true;
  task.approved_at = new Date().toISOString();
  task.approved_by = 'system';

  appendEvent({
    act: 'task_auto_approved',
    task_id: task.id,
    analyzer: task.analyzer,
    confidence: task.confidence,
    reasoning: 'Meets auto-approval criteria'
  });

  return task;
}
```

**Integration**: Call in task generation flow (`server.tasks.mjs`)

---

#### 3. Task Templates (30 min)

**Purpose**: Pre-fill common task fields for faster creation

**Templates** (`frontend/core/taskgen/templates.mjs`):
```javascript
export const TEMPLATES = {
  fix_continuation: {
    title: 'Fix incomplete response issue',
    category: 'bug',
    priority: 'high',
    tags: ['continuation', 'response-quality'],
    description: 'Address continuation pattern...'
  },

  add_documentation: {
    title: 'Add missing documentation',
    category: 'docs',
    priority: 'medium',
    tags: ['documentation'],
    description: 'Document...'
  },

  // ... more templates
};

export function applyTemplate(templateId, task) {
  const template = TEMPLATES[templateId];
  return { ...task, ...template };
}
```

**UI**: Dropdown in task creation form

---

#### 4. Batch Operations (1 hour)

**Purpose**: Multi-select approve/dismiss for efficiency

**UI** (`TasksDrawer.tsx`):
```typescript
const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

function toggleSelect(taskId: string) {
  setSelectedTasks(prev => {
    const next = new Set(prev);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    return next;
  });
}

function batchApprove() {
  for (const taskId of selectedTasks) {
    approveTask(taskId);
  }
  setSelectedTasks(new Set());
}

function batchDismiss() {
  for (const taskId of selectedTasks) {
    dismissTask(taskId);
  }
  setSelectedTasks(new Set());
}
```

**API** (`server.tasks.mjs`):
```javascript
app.post('/api/tasks/batch', async (req, res) => {
  const { action, taskIds } = req.body;  // action: 'approve' | 'dismiss'
  const tasks = loadTasksFromStorage();

  for (const id of taskIds) {
    const task = tasks.find(t => t.id === id);
    if (!task) continue;

    if (action === 'approve') {
      task.approved = true;
      task.approved_at = new Date().toISOString();
    } else if (action === 'dismiss') {
      task.dismissed = true;
      task.dismissed_at = new Date().toISOString();
    }
  }

  saveTasksToStorage(tasks);
  res.json({ ok: true, updated: taskIds.length });
});
```

---

### Implementation Timeline

**Session 1** (2-3 hours):
- Task Lifecycle Funnel (backend + API + UI)
- Integrate into AnalyticsDashboard

**Session 2** (2-3 hours):
- Smart Auto-Approval logic
- Task Templates
- Batch Operations

**Target Completion**: Same day (4-6 hours total)

---

### Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Manual approval time | 2 min/task | 30 sec/task | User timing |
| Tasks dismissed | 30% | 15% | Task status analysis |
| Task creation time | 3 min | 1 min | User timing |

---

## Track 3: Infrastructure & DevX 🛠️

### Overview
**Status**: Planned
**Effort**: 5-8 days total
**Priority**: **MEDIUM** (Foundation for scale)

### Features

#### 1. GraphQL Backend (3-5 days)

**Purpose**: Scalable API layer for complex queries and real-time updates

**Why Now**:
- Current REST API growing complex
- Need for real-time subscriptions (live task updates)
- Better TypeScript support with code generation

**Components**:
- GraphQL server (Apollo Server or similar)
- Schema definition
- Resolvers for chat, tasks, tools, metrics
- Subscriptions for real-time updates
- Migration path from REST

**Implementation**:
1. Define schema (`schema.graphql`)
2. Implement resolvers
3. Add subscription support
4. Migrate critical endpoints
5. Document migration guide

---

#### 2. CI/CD Pipeline (2-3 days)

**Purpose**: Automated testing and deployment

**Components**:
- GitHub Actions workflows
- Automated testing (unit + integration)
- Linting and type checking
- Docker image building
- Deployment automation

**Workflows**:
1. **PR Check**: Lint, type check, test
2. **Main Deploy**: Build images, push to registry
3. **Release**: Tag, changelog, GitHub release

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Week 1)
**Goal**: Deliver immediate value with TGT Week 8
**Duration**: 1 day (4-6 hours)
**Risk**: Low

1. ✅ TGT Lifecycle Funnel (2 hours)
2. ✅ Smart Auto-Approval (1.5 hours)
3. ✅ Task Templates (30 min)
4. ✅ Batch Operations (1 hour)

**Benefits**:
- Immediate productivity boost for task management
- Quick user feedback on TGT workflows
- Foundation for more automation

---

### Phase 2: Major Enhancement (Weeks 2-3)
**Goal**: Implement Phase 6 Proactive Planning
**Duration**: 7-9 days
**Risk**: Medium

1. ✅ Alternative Generator (3 days)
2. ✅ Effort Estimator (2 days)
3. ✅ Alignment Checker (2 days)
4. ✅ Alternative Evaluator (1 day)
5. ✅ Integration & Testing (1-2 days)

**Benefits**:
- 40-60% reduction in failed iterations
- 30-50% faster task completion
- Major autonomous agent capability upgrade

---

### Phase 3: Infrastructure (Week 4)
**Goal**: Lay foundation for scale
**Duration**: 5-8 days
**Risk**: Medium-High

1. ✅ GraphQL backend (3-5 days)
2. ✅ CI/CD pipeline (2-3 days)

**Benefits**:
- Scalable architecture
- Better developer experience
- Automated quality assurance

---

## Optional Enhancements (Low Priority)

### MIP UI Toggle (2-3 hours)
**Purpose**: Allow users to enable/disable MIP from UI

**Components**:
- Settings page section for MIP
- Toggle switch + configuration inputs
- Save to backend
- Update orchestrator to respect UI settings

**Value**: Nice to have, but env vars work fine for now

---

### SAPL PR Templates (1-2 hours)
**Purpose**: Support custom PR templates for different types of changes

**Components**:
- Template storage (`.forgekeeper/pr_templates/*.md`)
- Template selection in PRPreviewModal
- Merge template with PR body

**Value**: Nice to have, but current approach works for docs/config/tests

---

## Decision Matrix

### Which Track First?

| Criterion | Track 1 (Phase 6) | Track 2 (TGT Week 8) | Track 3 (Infrastructure) |
|-----------|-------------------|----------------------|--------------------------|
| **Impact** | Very High (40-60% failure reduction) | High (50% time savings) | Medium (foundation) |
| **Effort** | 7-9 days | 4-6 hours | 5-8 days |
| **ROI** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Risk** | Medium | Low | Medium-High |
| **Blockers** | None | None | None |
| **User Value** | Indirect (better agent) | Direct (faster workflow) | Indirect (stability) |

### Recommendation: **Track 2 → Track 1 → Track 3**

**Reasoning**:
1. **TGT Week 8** delivers immediate user value with minimal risk (4-6 hours = quick win)
2. **Phase 6** delivers maximum long-term impact (autonomous agent becomes proactive)
3. **Infrastructure** provides foundation for scaling (important but not urgent)

---

## Next Steps (Immediate)

### If Starting Today (2025-11-04):

**Today (4-6 hours)**:
- ✅ Implement TGT Week 8 features
- ✅ Test and document
- ✅ Commit and deploy
- ✅ Gather user feedback

**Tomorrow (Start Phase 6)**:
- ✅ Create `alternative-generator.mjs` skeleton
- ✅ Implement alternative generation logic
- ✅ Write unit tests
- ✅ Integrate with episodic memory

**Next Week**:
- ✅ Complete Phase 6 components
- ✅ Integration testing
- ✅ Performance optimization
- ✅ Documentation

---

## Success Tracking

### Phase 1 (TGT Week 8) Metrics:
- [ ] Funnel visualization live on dashboard
- [ ] Auto-approval active (>0 tasks auto-approved)
- [ ] Templates used (>5 template applications)
- [ ] Batch operations functional (>3 batch actions)
- [ ] User feedback collected

### Phase 2 (Phase 6) Metrics:
- [ ] Alternatives generated (avg 3-5 per task)
- [ ] Estimates accurate (70%+ within ±20%)
- [ ] Alignment scores calculated
- [ ] Failure rate reduced (12% → 5-7%)
- [ ] Iterations reduced (8 → 4-6)

### Phase 3 (Infrastructure) Metrics:
- [ ] GraphQL queries functional
- [ ] CI passing on all PRs
- [ ] Automated deployments working
- [ ] Test coverage >70%

---

## Conclusion

**Current State**: SAPL + MIP complete ✅
**Next Priority**: TGT Week 8 (4-6 hours, high ROI)
**Major Goal**: Phase 6 Proactive Planning (7-9 days, transformative)
**Foundation**: Infrastructure (5-8 days, scaling prep)

**Recommended Start**: **TGT Week 8** for quick wins, then proceed to **Phase 6** for maximum impact.

---

## References

- Phase 6 Design: `docs/autonomous/PHASE6_PROACTIVE_PLANNING_DESIGN.md`
- TGT Week 8 Plan: `docs/autonomous/tgt/TGT_WEEK8_PLAN.md`
- Project Roadmap: `docs/autonomous/PROJECT_ROADMAP.md`
- SAPL Documentation: `docs/sapl/README.md`
- MIP Documentation: `README.md` (lines 348-519)
