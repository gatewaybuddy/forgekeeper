# 🛤️ Forgekeeper Development Roadmap

This roadmap outlines the staged evolution of Forgekeeper into a self-improving local development agent.

---

## 🎯 Milestones

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | In Progress |

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
- `forgekeeper/self_review.py` reviews recent commits and logs check results for the active task.

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

### Phase 3: Full Local Autonomy (In Progress)
- Fully autonomous task execution based on high-level goals
- Memory-aware feedback loop with emotion tagging
- Periodic self-generated roadmap and sprint plans
- Optional push to remote repo with changelog and justification

#### Upcoming Milestones
- [ ] Multi-file edit support (`forgekeeper/task_pipeline.py`)
- [ ] Diff-aware self-review with task-scoped tests (`forgekeeper/self_review.py`)
- [ ] Subtask expansion in goal management (`forgekeeper/high_level_goal_manager.py`)

---

## 🧠 Future Capabilities
- Vectorized memory summaries for long-term planning
- Agent collaboration for multi-role task completion
- Sandbox simulation environment for testing code changes
- Real-time CLI or browser interface with natural conversation loop

---

## 📌 Vision Statement

Forgekeeper will become a memory-driven, self-reflective development environment capable of understanding, modifying, and improving its own codebase and objectives using AI agents. It will serve as a prototype for long-term self-sustaining AGI-lite systems.
