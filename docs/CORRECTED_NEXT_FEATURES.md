# Corrected Next Features Assessment

**Date**: 2025-11-04
**Status**: Accurate inventory after review

---

## ✅ What's Already Complete

### Autonomous Agent (Fully Implemented)
- ✅ **Phase 1**: Recursive Feedback
- ✅ **Phase 2**: Meta-Cognition
- ✅ **Phase 3**: Cross-Session Learning
- ✅ **Phase 4**: Error Recovery & Resilience
- ✅ **Phase 5**: Advanced Learning (User Preferences, Episodic Memory)
- ✅ **Phase 6**: Proactive Planning (Alternative Generator, Effort Estimator, Alignment Checker)
- ✅ **Phase 7**: Multi-Step Lookahead & Learning (Task Graph Builder, Weight Learner)

**Status**: Autonomous agent is **production-ready** with 143+ passing tests

### TGT (Task Generator) (Fully Implemented)
- ✅ **Week 1-7**: Core implementation, analytics, scheduling
- ✅ **Week 8**: Task lifecycle funnel, auto-approval, templates, batch operations (14/14 tasks complete)

**Status**: TGT is **production-ready** with full feature set

### Self-Improvement (Just Completed Today)
- ✅ **SAPL**: Safe Auto-PR Loop (backend + UI)
- ✅ **MIP**: Metrics-Informed Prompting (backend + orchestrator integration)

**Status**: Self-improvement plan **100% complete**

---

## 🎯 What's Actually NOT Implemented

### 1. Infrastructure & Backend ⭐⭐⭐ HIGH PRIORITY

#### GraphQL Backend (3-5 days)
**Status**: Currently using REST API only
**Why**:
- Current REST API is growing complex
- No real-time subscriptions (WebSocket) for live updates
- GraphQL provides better type safety and code generation
- Enables advanced querying (nested resources, filtering)

**What to Build**:
```
┌─────────────────────────────────────────────────────┐
│            GraphQL Layer (New)                       │
│                                                      │
│  Schema:                                             │
│  - Query { chat, tasks, tools, metrics, episodes }  │
│  - Mutation { sendMessage, approveTask, ... }       │
│  - Subscription { messageStream, taskUpdates }      │
│                                                      │
│  Resolvers:                                          │
│  - Chat operations (currently /api/chat)             │
│  - Task operations (currently /api/tasks/*)          │
│  - Tool operations (currently /api/tools)            │
│  - Real-time subscriptions (WebSocket)              │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│        Existing REST API (Keep for now)              │
│  - /api/chat, /api/chat/stream                      │
│  - /api/tasks/*, /api/auto_pr/*                     │
│  - /api/ctx/tail, /api/tools                        │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              Backend Services                        │
│  - Orchestrator, ContextLog, TGT, Tools             │
└─────────────────────────────────────────────────────┘
```

**Benefits**:
- Single endpoint for all queries
- Real-time updates via subscriptions
- Type-safe API with code generation
- Better performance (fetch exactly what you need)
- Easier frontend development

**Implementation**:
1. Add Apollo Server or similar
2. Define schema (`schema.graphql`)
3. Implement resolvers
4. Add WebSocket support for subscriptions
5. Keep REST API for backward compatibility
6. Gradual migration

---

#### CI/CD Pipeline (2-3 days)
**Status**: No automated testing or deployment
**Why**:
- Manual testing is error-prone
- No automated quality gates
- Deployment is manual
- Risk of breaking changes reaching production

**What to Build**:
```yaml
# .github/workflows/pr-check.yml
name: PR Check
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci --prefix frontend
      - name: Lint
        run: npm run lint --prefix frontend
      - name: Type check
        run: npm run typecheck --prefix frontend
      - name: Unit tests
        run: npm test --prefix frontend
      - name: E2E tests
        run: npm run test:e2e --prefix frontend
```

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: docker compose build
      - name: Push to registry
        run: docker compose push
```

**Benefits**:
- Catch bugs before they reach main
- Automated quality assurance
- Confidence in deployments
- Faster iteration cycles

---

#### Database & Persistence (3-4 days)
**Status**: Everything stored in memory or JSONL files
**Why**:
- Conversations lost on server restart
- No search/filtering across sessions
- Poor performance with large datasets
- No multi-instance support

**What to Build**:
```
┌─────────────────────────────────────────────────────┐
│            Database Layer (New)                      │
│                                                      │
│  Option 1: SQLite (Simple, Single Instance)         │
│  - conversations table                               │
│  - messages table                                    │
│  - tasks table                                       │
│  - episodes table                                    │
│  - preferences table                                 │
│                                                      │
│  Option 2: PostgreSQL (Multi-Instance)              │
│  - Same schema as SQLite                             │
│  - Better concurrency                                │
│  - Better search (full-text)                         │
│                                                      │
│  Migration Strategy:                                 │
│  - Keep JSONL as backup/export format               │
│  - Migrate existing data on first start              │
│  - Dual-write initially (JSONL + DB)                 │
└─────────────────────────────────────────────────────┘
```

**Schema Example**:
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  title TEXT,
  metadata JSON
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  role TEXT NOT NULL,  -- user, assistant, tool, system
  content TEXT,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  title TEXT NOT NULL,
  description TEXT,
  analyzer TEXT,
  confidence REAL,
  status TEXT,  -- pending, approved, dismissed, completed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON
);
```

**Benefits**:
- Persistent conversations across restarts
- Search and filtering
- Better performance
- Multi-instance support (with PostgreSQL)

---

### 2. Phase 8: Collaborative Intelligence ⭐⭐ MEDIUM PRIORITY

**Status**: Planned but not started
**Effort**: 2-3 weeks
**Dependencies**: Infrastructure complete (GraphQL, real-time updates)

**What It Does**:
- Human-in-the-loop decision making (present alternatives to user)
- Preference elicitation (learn what user values through questions)
- Counterfactual reasoning ("what if I chose differently?")
- Explainability improvements (explain WHY choices were made)

**Why Later**:
- Requires real-time UI updates (WebSocket/GraphQL subscriptions)
- Agent already very capable (Phases 1-7 complete)
- Infrastructure should be solid first

---

### 3. UI/UX Enhancements ⭐ LOW PRIORITY

These are "nice to have" improvements that provide incremental value:

#### MIP UI Toggle (2-3 hours)
- Settings page for MIP configuration
- Toggle enable/disable from UI
- Configure thresholds and window

**Current Workaround**: Environment variables work fine

---

#### SAPL PR Templates (1-2 hours)
- Support custom PR templates
- Template selection in PRPreviewModal
- Merge template with PR body

**Current Workaround**: Default template works for docs/config/tests

---

#### Enhanced Chat History UI (4-6 hours)
- Conversation sidebar with search
- Filter by date, topic, tool usage
- Export conversations
- Delete/archive conversations

**Current Workaround**: Conversations in localStorage, no history UI

---

## 🎯 Recommended Priority Order

### Priority 1: CI/CD Pipeline (2-3 days) ⭐⭐⭐
**Why First**:
- Quick to implement
- Immediate benefit (catch bugs early)
- Foundation for everything else
- Builds confidence

**What to Build**:
1. GitHub Actions workflow for PR checks
2. Automated testing (lint, typecheck, unit tests)
3. Automated deployment to main
4. Docker image building

---

### Priority 2: Database & Persistence (3-4 days) ⭐⭐⭐
**Why Second**:
- Unlocks many features (search, filtering, analytics)
- Required for multi-instance support
- Better user experience (persistent conversations)

**What to Build**:
1. Choose DB (SQLite for simplicity, PostgreSQL for scale)
2. Define schema
3. Migration from JSONL
4. Update API to use DB
5. Test thoroughly

---

### Priority 3: GraphQL Backend (3-5 days) ⭐⭐
**Why Third**:
- Better API architecture
- Enables real-time features
- Improves developer experience

**What to Build**:
1. Apollo Server setup
2. Schema definition
3. Resolvers for existing operations
4. WebSocket subscriptions
5. Gradual migration from REST

---

### Priority 4: Phase 8 (2-3 weeks) ⭐
**Why Later**:
- Nice to have, not critical
- Requires infrastructure complete
- Agent already very capable

**What to Build**:
1. Alternative presentation UI
2. Preference elicitation system
3. Counterfactual reasoning
4. Enhanced explainability

---

## Summary

### Already Complete ✅
- Autonomous Agent: Phases 1-7 (production-ready)
- TGT: Week 8 complete (14/14 tasks)
- Self-Improvement: SAPL + MIP (just completed today)

### Next to Implement 🎯
1. **CI/CD Pipeline** (2-3 days) - HIGH PRIORITY
2. **Database & Persistence** (3-4 days) - HIGH PRIORITY
3. **GraphQL Backend** (3-5 days) - MEDIUM PRIORITY
4. **Phase 8: Collaborative Intelligence** (2-3 weeks) - NICE TO HAVE

### Total Effort for Infrastructure
- 8-12 days to get GraphQL + CI/CD + Database complete
- Foundational work that unlocks many future features

---

## Immediate Next Step

**Recommendation**: Start with **CI/CD Pipeline** (2-3 days)

**Why**:
- Quick win (2-3 days)
- Immediate value (automated testing)
- Builds confidence for database work
- Prevents regressions as we add features

**What to Build**:
1. PR check workflow (lint, typecheck, test)
2. Main deploy workflow (build, push images)
3. E2E test setup
4. Coverage reporting

**Timeline**: Could be done this week (Nov 4-8)

---

## Alternative: If You Want to Code Something New Today

If infrastructure work isn't appealing right now, here are smaller coding projects:

### Option A: Enhanced Chat History UI (4-6 hours)
- Conversation sidebar with list
- Search conversations
- Filter by date/topic
- Export/delete conversations

**Value**: Direct user benefit, improves usability

---

### Option B: MIP Analytics Dashboard (3-4 hours)
- Visualize hint effectiveness
- Continuation rate over time
- Hint type distribution
- Before/after comparison

**Value**: Measure MIP impact, tune thresholds

---

### Option C: SAPL Multi-PR Support (4-5 hours)
- Create multiple PRs from one session
- PR dependencies (PR 2 depends on PR 1)
- Batch PR creation

**Value**: Power users can create complex PR chains

---

## Questions for Prioritization

1. **Infrastructure vs Features**: Do you want to focus on foundational work (CI/CD, DB, GraphQL) or new user-facing features?

2. **Timeline**: Are you optimizing for quick wins (hours) or long-term impact (weeks)?

3. **Team Size**: Solo developer or team? (affects CI/CD priority)

4. **Scale**: Local-only or planning for multi-instance deployment? (affects DB choice)

5. **User Feedback**: What are users asking for most?

---

**My Updated Recommendation**:

Given that all agent features are complete, the next logical step is **infrastructure maturity**:

1. **CI/CD** (2-3 days) - Prevents breaking changes
2. **Database** (3-4 days) - Unlocks features, better UX
3. **GraphQL** (3-5 days) - Modern API, real-time updates

This 8-12 day investment sets up the project for long-term success and scalability.
