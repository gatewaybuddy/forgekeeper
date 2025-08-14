# ✅ Forgekeeper Tasks

## 🚦 Milestone Status

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

---

## 🛠️ Active Tasks

 - [ ] **Design multi-step planning framework for complex tasks**
 - [ ] **Implement cross-file validation for code edits**

---

## ⏳ Backlog

- [ ] Improve multi-agent planning and delegation across tasks
- [ ] Pin Python and Node dependencies for reproducible installs
- [ ] Provide cross-platform setup script to automate environment creation
- [ ] Expose task insertion utility via CLI for manual task creation
- [ ] FK-201: Transactional outbox for resolvers (P1)
- [ ] FK-105: Test commit check command selection (P1)
- [ ] FK-106: Test task queue prioritization (P1)
- [ ] FK-107: Validate episodic memory logging (P1)
- [ ] FK-108: Test mark_done_if_merged flow (P1)
- [ ] FK-109: Test LocalEmbedder storage and retrieval (P1)

---

## ✅ Completed

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

---

## Canonical Tasks

---
id: FK-103
title: Consolidate test directories (P2)
status: todo
epic: R-001
owner: agent
labels: [dx, tests]
---
Move all test modules into a unified `tests/` directory and update references.

**AC**
- [ ] All tests reside under `tests/`
- [ ] CI and imports point to the new location

---
id: FK-104
title: Skip backend smoke test when prerequisites missing (P2)
status: todo
epic: R-001
owner: agent
labels: [reliability, tooling]
---
Make `smoke_backend.py` detect missing `backend/`, `npm`, or `node` and exit gracefully.

**AC**
- [ ] Smoke test exits 0 with skip message when environment absent
- [ ] self_review treats skipped state as neutral
