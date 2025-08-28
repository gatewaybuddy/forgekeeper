# 🛤️ Forgekeeper Development Roadmap

This roadmap outlines the staged evolution of Forgekeeper into a self-improving local development agent.

---

## 🎯 Milestones

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |
| Autonomy | Done |

### Phase 1: Human-Guided Autonomy (Complete)
- [x] Define agents and roles in `AGENTS.md`
- [x] Load and summarize code files
- [x] Accept and interpret natural language task prompts
- [x] Make and commit code edits with user approval
- [x] Enable multi-agent task handoff between Core and Coder agents
- [x] Verify and sanitize user prompts to prevent injection attacks
- [x] Run a recursive self-review loop
- [x] Integrate linting and test validation before commits

#### Supporting Modules
- `forgekeeper/forgekeeper_safe_update.py` orchestrates a retryable self-edit cycle and restarts the agent.
- `forgekeeper/git_committer.py` commits staged changes and runs lint/test checks before pushing.
- `forgekeeper/self_review/` reviews recent commits and logs check results for the active task.
- `goal_manager/` unifies goal storage and high-level orchestration.

### Phase 2: Semi-Autonomous Execution (Complete)

- **Autonomous Execution**
  - [x] Read from `Tasks.md`
  - [x] Evaluate and rank tasks by priority and feasibility
  - [x] Schedule and execute top-priority tasks without direct supervision
  - [x] Request user confirmation before committing code changes
  - [x] Log execution steps and errors for later review

- **Memory Reflection**
  - [x] Capture task context and results in a long-term memory store
  - [x] Summarize each task outcome and tag with relevant metadata
  - [x] Recall related memories when planning new tasks
  - [x] Use reflections to refine task prioritization and execution strategies
  - [x] Generate follow-up tasks based on insights from stored memories

Phase 2 delivered a memory-informed workflow that lets Forgekeeper execute tasks, learn from results, and plan next steps with minimal oversight. Upcoming refinement will focus on improving memory retrieval fidelity and task scheduling heuristics.

### Phase 3: Full Local Autonomy (Complete)

- [x] M-030: Autonomous task execution based on high-level goals
- [x] M-031: Emotion tagging for memory reflections
- [x] M-032: Self-generated roadmap and sprint plans
- [x] M-033: Optional push to remote repo with changelog and justification


Sprint plans are assembled by `forgekeeper/sprint_planner.py` from active goals and pending tasks. The generated `SprintPlan.md` is refreshed whenever the roadmap updates and committed for review alongside other changes.

#### Completed Milestones
- [x] Multi-file edit support in `task_pipeline.py`
- [x] Diff-aware self-review with task-scoped tests in `self_review/`
- [x] Subtask expansion in goal management via `goal_manager/manager.py`
- [x] Consolidated conversation handling behind GraphQL service

---

## 🧠 Future Capabilities
- Vectorized memory summaries for long-term planning
- Agent collaboration for multi-role task completion
- Sandbox simulation environment for testing code changes
- Real-time CLI or browser interface with natural conversation loop

---

## 📌 Vision Statement

Forgekeeper will become a memory-driven, self-reflective development environment capable of understanding, modifying, and improving its own codebase and objectives using AI agents. It will serve as a prototype for long-term self-sustaining AGI-lite systems.

---

## 🔄 Update History

### Update 2025-08-28 00:00 UTC
Phase 3 complete: full local autonomy with optional remote push and changelog support.

## Update 2025-08-28 00:17 UTC
### Summary
Recent commits: Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml, docs: mark autonomy milestone complete, Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog

### Recent Commits
- Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml
- docs: mark autonomy milestone complete
- Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog
- Merge branch 'main' into codex/delete-tasks-m030-and-m033-from-backlog
- Merge pull request #323 from gatewaybuddy/codex/regenerate-file_summary.md-with-updated-date

## Update 2025-08-28 00:17 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml, docs: mark autonomy milestone complete; Recent memory: Committed changes on work: chore: update roadmap, Push failed: Remote named 'origin' didn't exist, Recent commits: Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml, docs: mark autonomy milestone complete, Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog

### Recent Commits
- chore: update roadmap
- Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml
- docs: mark autonomy milestone complete
- Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog
- Merge branch 'main' into codex/delete-tasks-m030-and-m033-from-backlog

### Recent Memory
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist
- Recent commits: Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml, docs: mark autonomy milestone complete, Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog
- Test body
