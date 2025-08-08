# ✅ Forgekeeper Tasks

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

---

## 🛠️ Active Tasks

- [ ] **Run a recursive self-review loop**
  *Evaluate whether code changes fulfill the original task prompt.*

- [ ] **Enable Forgekeeper to pull tasks from this file and complete them autonomously**

- [ ] **Integrate linting and test validation before commits**

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

---

## Canonical Tasks

---
id: FK-101
title: Diff-aware self-review (P1)
status: in_progress
epic: R-001
owner: agent
labels: [agent, reliability, tests]
---
Implement self_review.review_change_set and write artifact to logs/.

**AC**
- [ ] ruff/mypy/pytest scoped to touched files
- [ ] JSON verdict emitted to logs/self-review-*.json
- [ ] Fail commit on verdict=fail

---
id: FK-102
title: Commit checks surfacing (P1)
status: todo
epic: R-001
owner: agent
labels: [agent, dx]
---
Capture stdout/stderr, block commit on failure, attach artifact.

**AC**
- [ ] Structured result returned
- [ ] Human summary + artifact path

---
id: FK-201
title: Transactional outbox for resolvers (P1)
status: todo
epic: R-002
owner: agent
labels: [backend, reliability, mqtt]
---
Add Outbox table, worker, idempotent publish, and health endpoint.
