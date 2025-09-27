# Forgekeeper Development Roadmap (Consolidated)

This is the single, canonical roadmap for Forgekeeper. All planning flows from here. The generated task list (`tasks.md`) and YAML snapshot (`roadmap.yaml`) are derived from this file via:

```
python scripts/generate_tasks_from_roadmap.py
python scripts/generate_roadmap_yaml.py
```


## Milestones


| Milestone | Status |
|-----------|--------|
| Core single-agent runtime | Done (v2 default) |
| Agentic memory plane | Done (JSON store + feedback log) |
| Queue & GraphQL callbacks | In Progress (Phase 3) |
| Acts protocol + ToolShell | Planned (Phase 4) |
| UI wiring & observability | Planned (Phases 5 & 7) |
| Self-improvement loop | Planned (Phase 6+) |

## Migration Workstream
- See `docs/migration_plan.md` for the detailed porting strategy.
- Active task list lives in `automation/migration_tasks.yaml`.

### Phase 0: Stabilization Baseline (In Progress)

- [x] Add environment kill switches (`FGK_INFERENCE_BACKEND`, `FGK_USE_GATEWAY`, `FGK_MEMORY_BACKEND`)
- [x] Add doctor scripts to verify GPU/LLM/backends (`scripts/doctor.sh`, `scripts/doctor.ps1`)
- [ ] Pin dependency versions across stacks (Python constraints + Node lockfiles validation)
- [ ] Event/logs smoke coverage for `.forgekeeper/events.jsonl` + fail-fast CI check

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

### Phase 2: Shared State & Memory (Complete)

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

- [x] JSON-backed agentic memory and event logs under `.forgekeeper/`
- [ ] ContextLog DB adapter (SQLite/Mongo) for events (optional, parity with JSON)
- [ ] Vector memory backend and retrieval scoring (P1)

### Phase 3: Queue & GraphQL Callback Loop (In Progress)

- [x] Outbox primitives for tool/action durability (`forgekeeper/outbox.py`)
- [x] Smoke scripts for GraphQL append and E2E (`scripts/smoke_graphql_append.py`, `scripts/smoke_e2e_roundtrip.py`)
- [ ] Implement `appendMessage` end-to-end callback with retries + idempotency
- [ ] Worker wiring: poll outbox → publish to backend (GraphQL/MQTT) with exponential backoff
- [ ] Health/metrics: expose lag + retry counters on `/health`

### Phase 3.5: Distributed Inference & Modularity (In Progress)

- [x] M-030: Autonomous task execution based on high-level goals
- [x] M-031: Emotion tagging for memory reflections
- [x] M-032: Self-generated roadmap and sprint plans
- [x] M-033: Optional push to remote repo with changelog and justification


Sprint plans are assembled by `forgekeeper/sprint_planner.py` from active goals and pending tasks. The generated `SprintPlan.md` is refreshed whenever the roadmap updates and committed for review alongside other changes.

### Phase 4: Acts Protocol + ToolShell (Planned)

- [ ] Define acts: THINK, PLAN, EXEC, OBSERVE, REPORT, REQUEST-APPROVAL
- [ ] Implement sandboxed ToolShell with allowlist + gating
- [ ] Record tool outputs back to ContextLog and surface in UI

### Phase 5: UI Wiring & UX Gaps (Planned)

- [ ] New Conversation button
- [ ] Status Bar (GraphQL, Agent, Inference, Queue)
- [ ] Lightweight message polling (streaming later)

#### Completed Milestones
- [x] Multi-file edit support in `task_pipeline.py`
- [x] Diff-aware self-review with task-scoped tests in `self_review/`
- [x] Subtask expansion in goal management via `goal_manager/manager.py`
- [x] Consolidated conversation handling behind a single GraphQL storage path

### Phase 6: Self-Improvement Loop (Planned)

- [ ] Drive Planner/Implementer/Reviewer from `automation/tasks.yaml` (dry-run first)
- [ ] Git flow: temp branch → diff preview → PR; approvals for risky paths
- [ ] Stabilize commit checks + self-review summaries in `logs/<task_id>/`

### Phase 7: Observability & Guardrails (Planned)

- [x] JSONL logs (`.forgekeeper/events.jsonl`)
- [ ] Tail utility (`scripts/tail_logs.py`) and dev UX for fast triage
- [ ] UI LogPanel wiring with filters
- [ ] Guardrails: allowlist enforcement for ToolShell + redaction hooks

## 🧠 Future Capabilities
See Backlog and in‑progress items in `tasks.md` for the canonical list and status.

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

## Update 2025-09-08 20:13 UTC
### Summary
Recent commits: Merge pull request #359 from gatewaybuddy/codex/add-start_local_stack.ps1-script, Merge branch 'main' into codex/add-start_local_stack.ps1-script, feat: add PowerShell start script

### Recent Commits
- Merge pull request #359 from gatewaybuddy/codex/add-start_local_stack.ps1-script
- Merge branch 'main' into codex/add-start_local_stack.ps1-script
- feat: add PowerShell start script
- docs: quick DX improvements
- Merge pull request #357 from gatewaybuddy/codex/add-docker-container-detection-for-mongod

## Update 2025-09-09 00:23 UTC
### Summary
Recent commits: Merge pull request #361 from gatewaybuddy/codex/updates, feat: update scripts and gitignore, chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit

### Recent Commits
- Merge pull request #361 from gatewaybuddy/codex/updates
- feat: update scripts and gitignore
- chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers
- fix(ps1): move Set-StrictMode after param block to avoid CmdletBinding parser error
- feat(ps1): run child processes in same window (-NoNewWindow), prefer .venv python, set default DATABASE_URL, and set WorkingDirectory for stability

### Recent Memory
- Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit
- No staged changes to commit
- Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit
- No staged changes to commit
- Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

## Update 2025-09-09 03:30 UTC
### Summary
Recent commits: fix(ps1): resolve Start-Process failures by using resolved npm path and explicit argument arrays; set WorkingDirectory, chore: update roadmap, Merge pull request #361 from gatewaybuddy/codex/updates; Recent memory: Committed changes on main: chore: update roadmap, No staged changes to commit, Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt

### Recent Commits
- fix(ps1): resolve Start-Process failures by using resolved npm path and explicit argument arrays; set WorkingDirectory
- chore: update roadmap
- Merge pull request #361 from gatewaybuddy/codex/updates
- feat: update scripts and gitignore
- chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers

### Recent Memory
- Committed changes on main: chore: update roadmap
- No staged changes to commit
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt
- Recent commits: Merge pull request #361 from gatewaybuddy/codex/updates, feat: update scripts and gitignore, chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.

## Update 2025-09-09 03:33 UTC
### Summary
Recent commits: chore: update roadmap, fix(ps1): resolve Start-Process failures by using resolved npm path and explicit argument arrays; set WorkingDirectory, chore: update roadmap; Recent memory: Recent commits: Merge pull request #361 from gatewaybuddy/codex/updates, feat: update scripts and gitignore, chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline., Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.

### Recent Commits
- chore: update roadmap
- fix(ps1): resolve Start-Process failures by using resolved npm path and explicit argument arrays; set WorkingDirectory
- chore: update roadmap
- Merge pull request #361 from gatewaybuddy/codex/updates
- feat: update scripts and gitignore

### Recent Memory
- Recent commits: Merge pull request #361 from gatewaybuddy/codex/updates, feat: update scripts and gitignore, chore(gitignore): ignore .venv, models/, logs/, extra env variants, common caches and local helpers; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Push failed: Remote named 'origin' didn't exist, No staged changes to commit, No staged changes to commit
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt

## Update 2025-09-09 04:10 UTC
### Summary
Improve local DX: unify vLLM to a single server for both agents, add strict/non-strict vLLM startup, wire Vite dev proxy, and add verbose logging flags to start wrappers.

### Recent Commits
- feat(start): add -RequireVLLM/-VLLMWaitSeconds and -Verbose flags (PS); mirror flags in Bash
- feat(start): auto-load .env and start vLLM if not healthy; health checks with timeouts
- fix(backend): ts-node resolves TS sources by removing .js extensions in imports
- feat(frontend): proxy /graphql to backend in dev
- docs: update README, frontend README, AGENTS with startup flags and vLLM config

## Update 2025-09-10 04:45 UTC
### Summary
Recent commits: Merge pull request #362 from gatewaybuddy/fix/backend-esm-imports, fix(backend): ESM module resolution — add .js extensions and use ts-node --esm in dev scripts, Merge feat/vllm-docker-fallback: vLLM Docker fallback, robust

### Recent Commits
- Merge pull request #362 from gatewaybuddy/fix/backend-esm-imports
- fix(backend): ESM module resolution — add .js extensions and use ts-node --esm in dev scripts
- Merge feat/vllm-docker-fallback: vLLM Docker fallback, robust
- feat(start): add Docker vLLM fallback; strict/non-strict waits; backend wait; docs; fix PS/
- Merge feat/vLLM-startup-robustness: vLLM startup

## Update 2025-09-10 04:46 UTC
### Summary
Recent commits: chore: update roadmap, Merge pull request #362 from gatewaybuddy/fix/backend-esm-imports, fix(backend): ESM module resolution — add .js extensions and use ts-node --esm in dev scripts; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- Merge pull request #362 from gatewaybuddy/fix/backend-esm-imports
- fix(backend): ESM module resolution — add .js extensions and use ts-node --esm in dev scripts
- Merge feat/vllm-docker-fallback: vLLM Docker fallback, robust
- feat(start): add Docker vLLM fallback; strict/non-strict waits; backend wait; docs; fix PS/

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-09-11 02:54 UTC
### Summary
Recent commits: chore(sync): sync local repository state to origin, Merge pull request #365 from gatewaybuddy/chore/roadmap-phase-3_5-prioritize, docs(roadmap): reorder Phase 3.5 before Phase 4; update SprintPlan.md with FK-351..FK-356; Recent memory: Committed changes on main: chore: update roadmap, Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.

### Recent Commits
- chore(sync): sync local repository state to origin
- Merge pull request #365 from gatewaybuddy/chore/roadmap-phase-3_5-prioritize
- docs(roadmap): reorder Phase 3.5 before Phase 4; update SprintPlan.md with FK-351..FK-356
- docs(roadmap): add Phase 3.5 (Distributed Inference & Modularity) and prioritized tasks FK-351..FK-356 above Phase 4
- Merge pull request #364 from gatewaybuddy/feat/inference-gateway-default

### Recent Memory
- Committed changes on main: chore: update roadmap
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt

## Update 2025-09-11 20:09 UTC
### Summary
Recent commits: Add script for regenerating file summary and document usage, feat(startup): add model selection flags for Windows start scripts, chore(sync): sync local repository state to origin

### Recent Commits
- Add script for regenerating file summary and document usage

- feat(startup): add model selection flags for Windows start scripts
- chore(sync): sync local repository state to origin
- Merge pull request #365 from gatewaybuddy/chore/roadmap-phase-3_5-prioritize
- docs(roadmap): reorder Phase 3.5 before Phase 4; update SprintPlan.md with FK-351..FK-356

## Update 2025-09-12 03:45 UTC
### Summary
Recent commits: Merge codex/quick-docs-dx into main (docs changes superseded by newer updates), docs(deploy): add multi-node deployment guide and example env files; link from README, feat(defaults): use tiny Transformers model by default when no model/gateway configured; update README note; Recent memory: Committed changes on main: chore: update roadmap, Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.

### Recent Commits
- Merge codex/quick-docs-dx into main (docs changes superseded by newer updates)
- docs(deploy): add multi-node deployment guide and example env files; link from README
- feat(defaults): use tiny Transformers model by default when no model/gateway configured; update README note
- feat(cli): make  default to starting the local stack with cross-platform Python starter; update README instructions
- Merge pull request #373 from gatewaybuddy/feat/slash-commands-and-tinyllm

### Recent Memory
- Committed changes on main: chore: update roadmap
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt

## Update 2025-09-12 03:55 UTC
### Summary
Recent commits: chore: update roadmap, Merge codex/quick-docs-dx into main (docs changes superseded by newer updates), docs(deploy): add multi-node deployment guide and example env files; link from README; Recent memory: Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline., Committed changes on main: chore: update roadmap

### Recent Commits
- chore: update roadmap
- Merge codex/quick-docs-dx into main (docs changes superseded by newer updates)
- docs(deploy): add multi-node deployment guide and example env files; link from README
- feat(defaults): use tiny Transformers model by default when no model/gateway configured; update README note
- feat(cli): make  default to starting the local stack with cross-platform Python starter; update README instructions

### Recent Memory
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- No staged changes to commit
- No staged changes to commit

## Update 2025-09-12 04:06 UTC
### Summary
Recent commits: chore: update roadmap, Merge codex/quick-docs-dx into main (docs changes superseded by newer updates), docs(deploy): add multi-node deployment guide and example env files; link from README; Recent memory: Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline., Committed changes on main: chore: update roadmap

### Recent Commits
- chore: update roadmap
- Merge codex/quick-docs-dx into main (docs changes superseded by newer updates)
- docs(deploy): add multi-node deployment guide and example env files; link from README
- feat(defaults): use tiny Transformers model by default when no model/gateway configured; update README note
- feat(cli): make  default to starting the local stack with cross-platform Python starter; update README instructions

### Recent Memory
- Pushed changes on main: chore: update roadmap. Changelog at D:\Projects\codex\forgekeeper\logs\roadmap-update\changelog.txt
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- No staged changes to commit
- No staged changes to commit

## Update 2025-09-12 04:11 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, Merge codex/quick-docs-dx into main (docs changes superseded by newer updates); Recent memory: No staged changes to commit, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline., Committed changes on main: chore: update roadmap

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- Merge codex/quick-docs-dx into main (docs changes superseded by newer updates)
- docs(deploy): add multi-node deployment guide and example env files; link from README
- feat(defaults): use tiny Transformers model by default when no model/gateway configured; update README note

### Recent Memory
- No staged changes to commit
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
- No staged changes to commit
- No staged changes to commit

## Update 2025-09-12 17:46 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline., Committed changes on main: chore: update roadmap

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- Merge codex/quick-docs-dx into main (docs changes superseded by newer updates)
- docs(deploy): add multi-node deployment guide and example env files; link from README

### Recent Memory
- No staged changes to commit
- Attempt 1 for task 'Vectorized memory retrieval (P1)' did not complete the pipeline.
- Committed changes on main: chore: update roadmap
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
Recent commits: feat: add unified CLI entry and clean root scripts, Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr, Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- feat: add unified CLI entry and clean root scripts
- Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr
- Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr
- test: stabilize suite by skipping self-review pipelines
- Merge pull request #309 from gatewaybuddy/codex/create-forgekeeper/sandbox-module

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-27 23:08 UTC
### Summary
Recent commits: chore: update roadmap, feat: add unified CLI entry and clean root scripts, Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr; Recent memory: No staged changes to commit, No staged changes to commit, Committed changes on work: chore: update roadmap

### Recent Commits
- chore: update roadmap
- feat: add unified CLI entry and clean root scripts
- Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr
- Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr
- test: stabilize suite by skipping self-review pipelines

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist
- Recent commits: feat: add unified CLI entry and clean root scripts, Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr, Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, feat: add unified CLI entry and clean root scripts; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- feat: add unified CLI entry and clean root scripts
- Merge pull request #313 from gatewaybuddy/codex/implement-embedding-based-storage-and-apis-3vmxcr
- Merge branch 'main' into codex/implement-embedding-based-storage-and-apis-3vmxcr

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: Committed changes on work: chore: update roadmap, Push failed: Remote named 'origin' didn't exist, Recent commits: chore: update roadmap, chore: update roadmap, feat: add unified CLI entry and clean root scripts; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- feat: add unified CLI entry and clean root scripts

### Recent Memory
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist
- Recent commits: chore: update roadmap, chore: update roadmap, feat: add unified CLI entry and clean root scripts; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit
- Committed changes on work: chore: update roadmap
- Push failed: Remote named 'origin' didn't exist

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap
- chore: update roadmap

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit

## Update 2025-08-27 23:09 UTC
### Summary
Recent commits: chore: update roadmap, chore: update roadmap, chore: update roadmap; Recent memory: No staged changes to commit, No staged changes to commit, No staged changes to commit

### Recent Commits
- Merge pull request #306 from gatewaybuddy/codex/wire-sprint-planner-into-main-pipeline-x30gz6
- feat: schedule sprint planning (FK-304)
- Merge pull request #304 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager-6v5lmt
- Merge pull request #303 from gatewaybuddy/codex/replace-forgekeeper-import-with-goal_manager
- refactor: drop deprecated goal manager alias

## Update 2025-08-24 07:58 UTC
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

### Recent Memory
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
- No staged changes to commit
