# ✅ Forgekeeper Tasks

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

---

## 🛠️ Active Tasks

- [ ] **Enable Forgekeeper to pull tasks from this file and complete them autonomously**
- [ ] **Enhance code edit generation with real modifications**
  *Replace TODO scaffolds with LLM-generated code changes.*

- [ ] **Connect summarization, analysis, editing, and commit modules into an end-to-end self-edit pipeline**

---

## ⏳ Backlog

- [ ] Summarize task success and emotional feedback into memory
- [ ] Add “undo last task” recovery mode
- [ ] Improve multi-agent planning and delegation across tasks
- [ ] Pin Python and Node dependencies for reproducible installs
- [ ] Provide cross-platform setup script to automate environment creation

---

## ✅ Completed

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

---

## Canonical Tasks

---
id: FK-201
title: Transactional outbox for resolvers (P1)
status: todo
epic: R-002
owner: agent
labels: [backend, reliability, mqtt]
---
Add Outbox table, worker, idempotent publish, and health endpoint.

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

---
id: FK-105
title: Test commit check command selection (P1)
status: todo
epic: R-001
owner: agent
labels: [tests, reliability]
---
Add unit tests ensuring `git_committer` runs language-specific checks and logs results.

**AC**
- [ ] Commands include `CHECKS_PY` for Python files
- [ ] Commands include `CHECKS_TS` for TS/TSX files
- [ ] `commit-checks.json` captures stdout/stderr

---
id: FK-106
title: Test task queue prioritization (P1)
status: todo
epic: R-001
owner: agent
labels: [tests, scheduling]
---
Verify `TaskQueue.next_task` selects lowest priority with FIFO tie-break and falls back to checkbox tasks.

**AC**
- [ ] Front-matter priorities honored
- [ ] FIFO ordering on ties
- [ ] Legacy checkbox tasks used when no front-matter tasks qualify

---
id: FK-107
title: Validate episodic memory logging (P1)
status: todo
epic: R-001
owner: agent
labels: [memory, tests]
---
Add tests for `append_entry` and CLI tail output to ensure memory persistence.

**AC**
- [ ] JSONL entries written by `append_entry`
- [ ] CLI displays recent entries

---
id: FK-108
title: Test mark_done_if_merged flow (P1)
status: todo
epic: R-001
owner: agent
labels: [tests, vcs]
---
Mock GitHub responses to verify tasks are marked `done` only when associated PRs merge.

**AC**
- [ ] `mark_done_if_merged` updates status on merge
- [ ] Startup polling handles multiple `needs_review` tasks

---
id: FK-109
title: Test LocalEmbedder storage and retrieval (P1)
status: todo
epic: R-001
owner: agent
labels: [search, tests]
---
Ensure embeddings persist and influence ranking via cosine similarity.

**AC**
- [ ] Vectors stored in `.forgekeeper/vectors.sqlite`
- [ ] Query ranking reflects combined keyword and vector scores
