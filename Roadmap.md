# 🛤️ Forgekeeper Development Roadmap

This roadmap outlines the staged evolution of Forgekeeper into a self-improving local development agent.

---

## 🎯 Milestones

### Phase 1: Human-Guided Autonomy (In Progress)
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

### Phase 2: Semi-Autonomous Execution
- [x] Read from `Tasks.md`
- [x] Evaluate and rank tasks by priority and feasibility
- [ ] Complete tasks independently with user review
- [ ] Self-reflect on outcomes using internal memory module

### Phase 3: Full Local Autonomy
- Fully autonomous task execution based on high-level goals
- Memory-aware feedback loop with emotion tagging
- Periodic self-generated roadmap and sprint plans
- Optional push to remote repo with changelog and justification

---

## 🧠 Future Capabilities
- Vectorized memory summaries for long-term planning
- Agent collaboration for multi-role task completion
- Sandbox simulation environment for testing code changes
- Real-time CLI or browser interface with natural conversation loop

---

## 📌 Vision Statement

Forgekeeper will become a memory-driven, self-reflective development environment capable of understanding, modifying, and improving its own codebase and objectives using AI agents. It will serve as a prototype for long-term self-sustaining AGI-lite systems.
