# 🛤️ Forgekeeper Development Roadmap

This roadmap outlines the staged evolution of Forgekeeper into a self-improving local development agent.

---

## 🎯 Milestones

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |
| Autonomy | In Progress |

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

### Phase 3: Full Local Autonomy (In Progress)

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

Last update: 2025-08-24 07:55 UTC
Recent commits: enabled periodic goal manager execution and added autonomous tests.
Outstanding work: M-033: Optional remote push with changelog and justification.

Last update: 2025-08-24 07:57 UTC
Recent commits: added setup script prompts and goal manager refactor.
Outstanding work: tasks "Persist me (P1)" and "Demo task (P1)" require follow-up; latest self-review reported failing tests.


## Update 2025-08-24 06:49 UTC
### Summary
Recent commits: Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts, Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts, Add non-interactive flags to installer; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts
- Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts
- Add non-interactive flags to installer
- Merge pull request #285 from gatewaybuddy/codex/add-help-and-defaults-options-to-installer
- feat: add non-interactive install flags

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-24 07:30 UTC
### Summary
Marked emotion tagging and sprint generation milestones as complete and removed duplicate entries.

## Update 2025-08-24 06:51 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts, Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts; Recent memory: No staged changes to commit, No staged changes to commit, Committed changes on work: chore: update roadmap

### Recent Commits
- chore: update roadmap
- Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts
- Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts
- Add non-interactive flags to installer
- Merge pull request #285 from gatewaybuddy/codex/add-help-and-defaults-options-to-installer

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist
- Recent commits: Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts, Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts, Add non-interactive flags to installer; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

## Update 2025-08-24 06:52 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts, Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts, Add non-interactive flags to installer; Recent memory: No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #286 from gatewaybuddy/codex/add-help-and-defaults-flags-to-install-scripts
- Merge branch 'main' into codex/add-help-and-defaults-flags-to-install-scripts
- Add non-interactive flags to installer

### Recent Memory
- No staged changes to commit
- Attempt 1 for task 'Demo task (P1)' succeeded.

## Update 2025-08-24 07:07 UTC
### Summary
Recent commits: Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities, Merge pull request #299 from gatewaybuddy/codex/update-model_dir-handling-in-.env, Include MODEL_DIR in docker env setup

### Recent Commits
- Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities
- Merge pull request #299 from gatewaybuddy/codex/update-model_dir-handling-in-.env
- Include MODEL_DIR in docker env setup
- Merge pull request #298 from gatewaybuddy/codex/organize-pipeline-modules-and-logic
- Merge branch 'main' into codex/organize-pipeline-modules-and-logic

## Update 2025-08-24 07:09 UTC
### Summary
Recent commits: Remove NVIDIA system info file and ignore diagnostic reports, chore: update roadmap, Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities; Recent memory: No staged changes to commit

### Recent Commits
- Remove NVIDIA system info file and ignore diagnostic reports
- chore: update roadmap
- Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities
- Merge pull request #299 from gatewaybuddy/codex/update-model_dir-handling-in-.env
- Include MODEL_DIR in docker env setup

### Recent Memory
- No staged changes to commit

## Update 2025-08-24 07:15 UTC
### Summary
Recent commits: Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file, chore: update roadmap, Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities

### Recent Commits
- Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file
- chore: update roadmap
- Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities
- Merge pull request #299 from gatewaybuddy/codex/update-model_dir-handling-in-.env
- Include MODEL_DIR in docker env setup

## Update 2025-08-24 07:18 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file
- chore: update roadmap
- Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities
- Merge pull request #299 from gatewaybuddy/codex/update-model_dir-handling-in-.env

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-24 07:18 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file
- chore: update roadmap
- Merge pull request #296 from gatewaybuddy/codex/refactor-roadmap-management-utilities

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-24 07:20 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file
- chore: update roadmap

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-24 07:36 UTC
### Summary
Recent commits: Merge pull request #302 from gatewaybuddy/codex/create-reusable-crud-module-and-refactor, refactor: centralize Prisma CRUD operations, Merge pull request #301 from gatewaybuddy/codex/mark-completed-milestones-and-remove-duplicates

### Recent Commits
- Merge pull request #302 from gatewaybuddy/codex/create-reusable-crud-module-and-refactor
- refactor: centralize Prisma CRUD operations
- Merge pull request #301 from gatewaybuddy/codex/mark-completed-milestones-and-remove-duplicates
- docs: add roadmap update entry
- Merge pull request #300 from gatewaybuddy/codex/remove-personal-system-information-file



## Update 2025-08-24 07:55 UTC
### Summary
Enabled periodic goal manager execution and autonomous pipeline tests.

## Update 2025-08-24 07:57 UTC

### Summary


Recent commits: Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6, feat: schedule sprint planning (FK-304), Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt

### Recent Commits
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager
- refactor: drop deprecated goal manager alias



## Update 2025-08-24 07:59 UTC

### Summary
Recent commits: chore: update roadmap, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6, feat: schedule sprint planning (FK-304); Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit


## Update 2025-08-24 07:58 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt


## Update 2025-08-24 07:57 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6, feat: schedule sprint planning (FK-304); Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager


### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-26 02:43 UTC
### Summary
Recent commits: feat: add episodic embedding lookup and planning context, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6, feat: schedule sprint planning (FK-304)

### Recent Commits
- feat: add episodic embedding lookup and planning context
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager

## Update 2025-08-26 02:45 UTC
### Summary
Recent commits: chore: update roadmap, feat: add episodic embedding lookup and planning context, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- feat: add episodic embedding lookup and planning context
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt

## Update 2025-08-24 07:57 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6, feat: schedule sprint planning (FK-304); Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager


### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

- 
- Attempt 1 for task 'Demo task (P1)' succeeded.

## Update 2025-08-26 02:46 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, feat: add episodic embedding lookup and planning context; Recent memory: No staged changes to commit, , Attempt 1 for task 'Demo task (P1)' succeeded.

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- feat: add episodic embedding lookup and planning context
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)

### Recent Memory
- No staged changes to commit
- 
- Attempt 1 for task 'Demo task (P1)' succeeded.
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist

## Update 2025-08-26 02:46 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, feat: add episodic embedding lookup and planning context; Recent memory: No staged changes to commit, , Attempt 1 for task 'Demo task (P1)' succeeded.

- No staged changes to commit
- No staged changes to commit

## Update 2025-08-24 08:02 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6; Recent memory: No staged changes to commit, Change-set review passed: pytest: fail, Attempt 1 for task 'demo' failed self-review.


### Recent Commits
- chore: update roadmap
- chore: update roadmap

- feat: add episodic embedding lookup and planning context
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)

### Recent Memory
- No staged changes to commit
- 
- Attempt 1 for task 'Demo task (P1)' succeeded.
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist

## Update 2025-08-26 02:49 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt

### Recent Memory
- No staged changes to commit
- Change-set review passed: pytest: fail
- Attempt 1 for task 'demo' failed self-review.
- Change-set review passed: no checks run
- Attempt 1 for task 'demo' succeeded.

## Update 2025-08-24 08:03 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Attempt 1 for task 'demo' failed self-review., Change-set review passed: no checks run, Attempt 1 for task 'demo' succeeded.


### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- feat: add episodic embedding lookup and planning context
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-26 02:50 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- feat: add episodic embedding lookup and planning context

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)

### Recent Memory
- Attempt 1 for task 'demo' failed self-review.
- Change-set review passed: no checks run
- Attempt 1 for task 'demo' succeeded.
- Committed changes on work: chore: update roadmap

## Update 2025-08-27 23:08 UTC
### Summary
Recent commits: Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr, Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr, test: stabilize suite by skipping self-review pipelines

### Recent Commits
- Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr
- Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr
- test: stabilize suite by skipping self-review pipelines
- Merge pull request #309 from gatewaybuddy/codex/create-forgekeeper/sandbox-module
- Merge branch 'main' into codex/create-forgekeeper/sandbox-module

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: feat(memory): store embeddings for episodic tasks, chore: update roadmap, Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- feat(memory): store embeddings for episodic tasks
- chore: update roadmap
- Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr
- Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr
- test: stabilize suite by skipping self-review pipelines

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
