# ✅ Forgekeeper Tasks

## 🚦 Milestone Status

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |
| Autonomy | In Progress |

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

Sprint plans are generated from active goals and the tasks in this file using `forgekeeper/sprint_planner.py`. The resulting `SprintPlan.md` is reviewed alongside periodic roadmap commits.

---

## 🛠️ Active Tasks

*(none)*


---

## ⏳ Backlog


- [x] FK-301: Implement emotion tagging for memory reflections (P1)
- [ ] FK-302: Consolidate CRUD operations into shared module (P2)
- [ ] FK-303: Unify goal manager components (P1)
- [ ] FK-304: Generate sprints and roadmap automatically (P3)
- [ ] FK-305: Autonomous task execution from high-level goals (P1)
- [ ] FK-306: Optional remote push with changelog and justification (P3)

- [x] Expose task insertion utility via CLI for manual task creation
- [x] FK-201: Transactional outbox for resolvers (P1)
- [x] FK-105: Test commit check command selection (P1)
- [x] FK-106: Test task queue prioritization (P1)
- [x] FK-107: Validate episodic memory logging (P1)
- [x] FK-108: Test mark_done_if_merged flow (P1)
- [x] FK-109: Test LocalEmbedder storage and retrieval (P1)

---

## ✅ Completed

- [x] Improve multi-agent planning and delegation across tasks
- [x] Replace file-based conversation helpers with GraphQL service
- [x] Pin Python and Node dependencies for reproducible installs
- [x] Provide cross-platform setup script to automate environment creation
- [x] Complete tasks independently with user review
- [x] Self-reflect on outcomes using internal memory module
- [x] Persist reflections to a long-term memory log
- [x] Create `AGENTS.md` file to document agent roles
- [x] Implement file summarization module
  *Use LLM or parser to summarize the purpose and structure of each code file.*

- [x] Analyze codebase relevance to a task prompt
  *Map files to a user-defined prompt using file summaries.*

- [x] Generate code edits based on prompt
  *Create modified versions of files that fulfill task intent.*

- [x] Stage and commit edits with explanation
  *Use diffs to stage and describe changes before pushing.*

- [x] Enable multi-agent task handoff
- [x] Add prompt validation to guard against injection attacks
- [x] Run a recursive self-review loop
  *Evaluate whether code changes fulfill the original task prompt.*
- [x] Integrate linting and test validation before commits

- [x] Enable Forgekeeper to pull tasks from this file and complete them autonomously
- [x] Enhance code edit generation with real modifications
  *Replace TODO scaffolds with LLM-generated code changes.*

- [x] Connect summarization, analysis, editing, and commit modules into an end-to-end self-edit pipeline

- [x] Use stored memories to refine future task selection and execution
- [x] Generate follow-up tasks based on reflection outcomes
- [x] Summarize task success and emotional feedback into memory
- [x] Add unit tests for task insertion utility

- [x] Add “undo last task” recovery mode
  *Implemented via `TaskPipeline.undo_last_task`.*

- [x] Design multi-step planning framework for complex tasks
- [x] Implement cross-file validation for code edits
---

## Canonical Tasks

---
id: FK-103
title: Consolidate test directories (P2)
status: done
epic: R-001
owner: agent
labels: [dx, tests]
---
Move all test modules into a unified `tests/` directory and update references.

**AC**
- [x] All tests reside under `tests/`
- [x] CI and imports point to the new location

---
id: FK-104
title: Skip backend smoke test when prerequisites missing (P2)
status: done
epic: R-001
owner: agent
labels: [reliability, tooling]
---
Make `smoke_backend.py` detect missing `backend/`, `npm`, or `node` and exit gracefully. See skip logic in `tools/smoke_backend.py`.

**AC**
- [x] Smoke test exits 0 with skip message when environment absent
- [x] self_review treats skipped state as neutral
---
id: FK-301
title: Implement emotion tagging for memory reflections (P1)
status: done
epic: R-002
owner: agent
labels: [memory, analysis]
---
Enable emotion tagging in the memory reflection pipeline so logs record emotional context.

**AC**
- [x] Emotional labels attach to new memory entries
- [x] Stored emotions persist across sessions
- [x] Unit tests cover positive, negative, and neutral cases

---
id: FK-302
title: Consolidate CRUD operations into shared module (P2)
status: todo
epic: R-003
owner: agent
labels: [backend, refactor]
---
Unify scattered create/read/update/delete logic under a single interface to reduce duplication.

**AC**
- [ ] Existing modules delegate CRUD to shared utility
- [ ] Duplicate functions removed
- [ ] Tests updated for new interface

---
id: FK-303
title: Unify goal manager components (P1)
status: todo
epic: R-003
owner: agent
labels: [planner, architecture]
---
Merge fragmented goal-management logic into a single orchestrator for consistent task routing.

**AC**
- [ ] Legacy managers deprecated
- [ ] Unified manager handles subtask expansion and agent delegation
- [ ] Migration tests ensure parity with previous behavior

---
id: FK-304
title: Generate sprints and roadmap automatically (P3)
status: todo
epic: R-004
owner: agent
labels: [planning, automation]
---
Create an automated process that builds sprint plans and roadmap updates from the backlog.

**AC**
- [ ] Command outputs upcoming sprint plan and roadmap
- [ ] Generated documents reflect task priorities
- [ ] Documentation explains usage

---
id: FK-305
title: Autonomous task execution from high-level goals (P1)
status: todo
epic: R-003
owner: agent
labels: [planner, autonomy]
---
Enable Forgekeeper to expand high-level goals into executable subtasks and run them autonomously.

**AC**
- [ ] High-level goals expand into actionable tasks
- [ ] Tasks run without manual intervention
- [ ] Tests cover goal decomposition and execution flow

---
id: FK-306
title: Optional remote push with changelog and justification (P3)
status: todo
epic: R-003
owner: agent
labels: [git, workflow]
---
Provide an optional mechanism to push commits to a remote repository along with a changelog and justification.

**AC**
- [ ] CLI flag enables remote push with changelog
- [ ] Commit messages include justification details
- [ ] Push is skipped when flag is absent
