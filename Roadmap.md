# 🛤️ Forgekeeper Development Roadmap

This roadmap outlines the staged evolution of Forgekeeper into a self-improving local development agent.

---

## 🎯 Milestones

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |
| Autonomy | Done |
| Memory Orchestration | Planned |

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

### Phase 4: Agentic Memory Orchestration (Planned)

- Document memory agent architecture and extension points
- Integrate memory agents into the orchestration layer
- Expand memory agents with new heuristics and feedback loops

#### Completed Milestones
- [x] Multi-file edit support in `task_pipeline.py`
- [x] Diff-aware self-review with task-scoped tests in `self_review/`
- [x] Subtask expansion in goal management via `goal_manager/manager.py`
- [x] Consolidated conversation handling behind a single GraphQL storage path

---

## 🧠 Future Capabilities
- <a id="fk-401"></a>[FK-401](tasks.md#fk-401): Vectorized memory retrieval (P1)
- <a id="fk-402"></a>[FK-402](tasks.md#fk-402): Multi-agent collaboration framework (P2)
- <a id="fk-403"></a>[FK-403](tasks.md#fk-403): Sandbox execution environment (P2)
- <a id="fk-404"></a>[FK-404](tasks.md#fk-404): Real-time conversation interface (P3)
- <a id="fk-405"></a>[FK-405](tasks.md#fk-405): Implement attention distillation for GraphQL chat memory (P3)
- <a id="fk-406"></a>[FK-406](tasks.md#fk-406): Document memory agent architecture (P1)
- <a id="fk-407"></a>[FK-407](tasks.md#fk-407): Integrate memory agents into orchestration layer (P2)
- <a id="fk-408"></a>[FK-408](tasks.md#fk-408): Expand memory agents with heuristics and feedback loops (P2)

---

## 📌 Vision Statement

Forgekeeper will become a memory-driven, self-reflective development environment capable of understanding, modifying, and improving its own codebase and objectives using AI agents. It will serve as a prototype for long-term self-sustaining AGI-lite systems.

---

## 🔄 Update History

Each run should append a single update block that includes a `Summary` and corresponding `Recent Commits` list.

## Update 2025-08-28 00:17 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml, docs: mark autonomy milestone complete

### Recent Commits
- chore: update roadmap
- Merge pull request #324 from gatewaybuddy/codex/update-roadmap-and-roadmap-yaml
- docs: mark autonomy milestone complete
- Merge pull request #322 from gatewaybuddy/codex/delete-tasks-m030-and-m033-from-backlog
- Merge branch 'main' into codex/delete-tasks-m030-and-m033-from-backlog

## Update 2025-08-28 00:47 UTC
### Summary
Recent commits: Merge pull request #331 from gatewaybuddy/codex/propose-unified-naming-convention-and-update-docs, Merge remote-tracking branch 'origin/main' into codex/propose-unified-naming-convention-and-update-docs, docs: clarify agent package roles

### Recent Commits
- Merge pull request #331 from gatewaybuddy/codex/propose-unified-naming-convention-and-update-docs
- Merge remote-tracking branch 'origin/main' into codex/propose-unified-naming-convention-and-update-docs
- docs: clarify agent package roles
- Merge pull request #330 from gatewaybuddy/codex/verify-and-remove-unused-files
- Merge branch 'main' into codex/verify-and-remove-unused-files

## Update 2025-08-28 04:03 UTC
### Summary
Recent commits: Merge pull request #333 from gatewaybuddy/codex/delete-memory-folder-and-conversation-file, refactor chat session to use graphql, Merge pull request #332 from gatewaybuddy/codex/add-backlog-entries-in-tasks.md

### Recent Commits
- Merge pull request #333 from gatewaybuddy/codex/delete-memory-folder-and-conversation-file
- refactor chat session to use graphql
- Merge pull request #332 from gatewaybuddy/codex/add-backlog-entries-in-tasks.md
- docs: add backlog tasks and canonical entries
- Merge pull request #331 from gatewaybuddy/codex/propose-unified-naming-convention-and-update-docs

## Update 2025-08-28 04:06 UTC
### Summary
Recent commits: Merge pull request #334 from gatewaybuddy/codex/remove-fk303-from-backlog, chore: clean backlog of completed tasks, Merge pull request #333 from gatewaybuddy/codex/delete-memory-folder-and-conversation-file

### Recent Commits
- Merge pull request #334 from gatewaybuddy/codex/remove-fk303-from-backlog
- chore: clean backlog of completed tasks
- Merge pull request #333 from gatewaybuddy/codex/delete-memory-folder-and-conversation-file
- refactor chat session to use graphql
- Merge pull request #332 from gatewaybuddy/codex/add-backlog-entries-in-tasks.md

## Update 2025-08-28 04:12 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md, docs: ensure single update block per run; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md
- docs: ensure single update block per run
- Merge pull request #334 from gatewaybuddy/codex/remove-fk303-from-backlog
- chore: clean backlog of completed tasks
- Merge pull request #333 from gatewaybuddy/codex/delete-memory-folder-and-conversation-file

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-28 04:18 UTC
### Summary
Recent commits: Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json, chore: ignore legacy logs, Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md

### Recent Commits
- Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json
- chore: ignore legacy logs
- Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md
- docs: ensure single update block per run
- Merge pull request #334 from gatewaybuddy/codex/remove-fk303-from-backlog

## Update 2025-08-28 04:20 UTC
### Summary
Recent commits: docs: link FK-405 roadmap entry, chore: update roadmap, Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- docs: link FK-405 roadmap entry
- chore: update roadmap
- Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json
- chore: ignore legacy logs
- Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-28 04:29 UTC
### Summary
Recent commits: Merge pull request #337 from gatewaybuddy/codex/add-fk-405-to-roadmap-files, chore: update roadmap, Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json

### Recent Commits
- Merge pull request #337 from gatewaybuddy/codex/add-fk-405-to-roadmap-files
- chore: update roadmap
- Merge pull request #336 from gatewaybuddy/codex/delete-intent_test_log.txt-and-conversation_memory.json
- chore: ignore legacy logs
- Merge pull request #335 from gatewaybuddy/codex/merge-duplicate-entries-in-roadmap.md

## Update 2025-08-28 04:33 UTC
### Summary
Recent commits: chore: clean node modules and note reinstall steps, chore: update roadmap, Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: clean node modules and note reinstall steps
- chore: update roadmap
- Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs
- Merge pull request #338 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary
- chore: refresh file summary
- Merge pull request #337 from gatewaybuddy/codex/add-fk-405-to-roadmap-files

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-28 04:57 UTC
### Summary
Recent commits: Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories, chore: update roadmap, Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs

### Recent Commits
- Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories
- chore: update roadmap
- Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs
- Merge pull request #338 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary
- chore: refresh file summary

## Update 2025-08-28 04:58 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories
- chore: update roadmap
- Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs
- Merge pull request #338 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-28 05:05 UTC
### Summary
Recent commits: Merge pull request #341 from gatewaybuddy/codex/add-anchor-links-for-fk-401-to-fk-404, docs: sync roadmap tasks FK-401-FK-404, Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories

### Recent Commits
- Merge pull request #341 from gatewaybuddy/codex/add-anchor-links-for-fk-401-to-fk-404
- docs: sync roadmap tasks FK-401-FK-404
- Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories
- chore: update roadmap
- Merge pull request #339 from gatewaybuddy/codex/run-file-summarization-tool-and-update-summary-jixdzs

## Update 2025-08-28 05:07 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #341 from gatewaybuddy/codex/add-anchor-links-for-fk-401-to-fk-404, docs: sync roadmap tasks FK-401-FK-404; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #341 from gatewaybuddy/codex/add-anchor-links-for-fk-401-to-fk-404
- docs: sync roadmap tasks FK-401-FK-404
- Merge pull request #340 from gatewaybuddy/codex/clean-up-node_modules-directories
- chore: update roadmap

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-28 05:16 UTC
### Summary
Recent commits: Merge pull request #343 from gatewaybuddy/codex/modify-setup_dev_env.sh-for-optional-execution, feat: allow setup script to launch services, Merge pull request #342 from gatewaybuddy/codex/clean-up-duplicate-update-sections

### Recent Commits
- Merge pull request #343 from gatewaybuddy/codex/modify-setup_dev_env.sh-for-optional-execution
- feat: allow setup script to launch services
- Merge pull request #342 from gatewaybuddy/codex/clean-up-duplicate-update-sections
- docs: deduplicate roadmap history
- Merge pull request #341 from gatewaybuddy/codex/add-anchor-links-for-fk-401-to-fk-404

## Update 2025-08-28 05:20 UTC
### Summary
Recent commits: Merge pull request #344 from gatewaybuddy/codex/create-start_local_stack.sh-script, Add unified start script for local development, Merge pull request #343 from gatewaybuddy/codex/modify-setup_dev_env.sh-for-optional-execution

### Recent Commits
- Merge pull request #344 from gatewaybuddy/codex/create-start_local_stack.sh-script
- Add unified start script for local development
- Merge pull request #343 from gatewaybuddy/codex/modify-setup_dev_env.sh-for-optional-execution
- feat: allow setup script to launch services
- Merge pull request #342 from gatewaybuddy/codex/clean-up-duplicate-update-sections

## Update 2025-08-28 05:27 UTC
### Summary
Recent commits: Merge pull request #345 from gatewaybuddy/codex/update-installation-instructions-and-scripts, feat: optional Dockerized MongoDB and warnings, Merge pull request #344 from gatewaybuddy/codex/create-start_local_stack.sh-script

### Recent Commits
- Merge pull request #345 from gatewaybuddy/codex/update-installation-instructions-and-scripts
- feat: optional Dockerized MongoDB and warnings
- Merge pull request #344 from gatewaybuddy/codex/create-start_local_stack.sh-script
- Add unified start script for local development
- Merge pull request #343 from gatewaybuddy/codex/modify-setup_dev_env.sh-for-optional-execution

## Update 2025-08-28 05:44 UTC
### Summary
Recent commits: Merge pull request #347 from gatewaybuddy/codex/add-default-tiny-model-support, test: verify default tiny transformers model, Merge pull request #346 from gatewaybuddy/codex/improve-mongodb-installation-script

### Recent Commits
- Merge pull request #347 from gatewaybuddy/codex/add-default-tiny-model-support
- test: verify default tiny transformers model
- Merge pull request #346 from gatewaybuddy/codex/improve-mongodb-installation-script
- Prompt to launch Docker MongoDB when mongod is absent
- Merge pull request #345 from gatewaybuddy/codex/update-installation-instructions-and-scripts

## Update 2025-08-28 05:55 UTC

### Summary
Recent commits: Merge pull request #349 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme-g1fksh, Merge pull request #348 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme, docs: document tiny model option for CPU tests

### Recent Commits
- Merge pull request #349 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme-g1fksh
- Merge pull request #348 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme
- docs: document tiny model option for CPU tests
- docs: document tiny model option for CPU tests
- Merge pull request #347 from gatewaybuddy/codex/add-default-tiny-model-support

## Update 2025-08-28 05:57 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #349 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme-g1fksh, Merge pull request #348 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #349 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme-g1fksh
- Merge pull request #348 from gatewaybuddy/codex/add-tiny-model-launch-instructions-to-readme
- docs: document tiny model option for CPU tests
- docs: document tiny model option for CPU tests

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-09-08 04:59 UTC

### Summary
Recent commits: Merge pull request #355 from gatewaybuddy/codex/create-milestone-for-agentic-memory-orchestration, docs: outline memory orchestration milestone, Merge pull request #354 from gatewaybuddy/codex/update-file-summarization-script

### Recent Commits
- Merge pull request #355 from gatewaybuddy/codex/create-milestone-for-agentic-memory-orchestration
- docs: outline memory orchestration milestone
- Merge pull request #354 from gatewaybuddy/codex/update-file-summarization-script
- chore: refresh file summary
- Merge pull request #353 from gatewaybuddy/codex/search-and-update-memory-service-references


## Update 2025-09-08 14:58 UTC
### Summary
Recent commits: Merge pull request #357 from gatewaybuddy/codex/add-docker-container-detection-for-mongod, Merge branch 'main' into codex/add-docker-container-detection-for-mongod, feat: auto-start mongo on Windows

### Recent Commits

- Merge pull request #357 from gatewaybuddy/codex/add-docker-container-detection-for-mongod
- Merge branch 'main' into codex/add-docker-container-detection-for-mongod
- feat: auto-start mongo on Windows
- Merge pull request #356 from gatewaybuddy/codex/add-boolean-env-var-for-model-selection
- Add USE_TINY_MODEL override and docs

