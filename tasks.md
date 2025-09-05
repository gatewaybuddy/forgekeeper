# ✅ Forgekeeper Tasks

## 🚦 Milestone Status

| Milestone | Status |
|-----------|--------|
| Core | Done |
| Automation | Done |
| Autonomy | Done |
| Memory Orchestration | Planned |

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

Conversation history now persists exclusively through the GraphQL service, replacing the old file-based memory path.

Sprint plans are generated from active goals and the tasks in this file using `forgekeeper/sprint_planner.py`. The resulting `SprintPlan.md` is reviewed alongside periodic roadmap commits.

---

## 🛠️ Active Tasks

*(none)*


---

## ⏳ Backlog




- [ ] FK-401: Vectorized memory retrieval (P1)
- [ ] FK-402: Multi-agent collaboration framework (P2)
- [ ] FK-403: Sandbox execution environment (P2)
- [ ] FK-404: Real-time conversation interface (P3)
- [ ] [FK-405](Roadmap.md#fk-405): Implement attention distillation for GraphQL chat memory (P3)
- [ ] [FK-406](Roadmap.md#fk-406): Document memory agent architecture (P1)
- [ ] [FK-407](Roadmap.md#fk-407): Integrate memory agents into orchestration layer (P2)
- [ ] [FK-408](Roadmap.md#fk-408): Expand memory agents with heuristics and feedback loops (P2)

---

## ✅ Completed

- [x] FK-303: Unify goal manager components (P1)
- [x] FK-302: Consolidate CRUD operations into shared module (P2)
- [x] M-031: Emotion tagging for memory reflections
- [x] M-032: Self-generated roadmap and sprint plans
- [x] M-030: Autonomous task execution from high-level goals (P1)
- [x] M-033: Optional remote push with changelog and justification (P3)
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
- [x] Expose task insertion utility via CLI for manual task creation
- [x] FK-201: Transactional outbox for resolvers (P1)
- [x] FK-105: Test commit check command selection (P1)
- [x] FK-106: Test task queue prioritization (P1)
- [x] FK-107: Validate episodic memory logging (P1)
- [x] FK-108: Test mark_done_if_merged flow (P1)
- [x] FK-109: Test LocalEmbedder storage and retrieval (P1)
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
status: done
epic: R-003
owner: agent
labels: [backend, refactor]
---
Unify scattered create/read/update/delete logic under a single interface to reduce duplication.

**AC**
- [x] Existing modules delegate CRUD to shared utility
- [x] Duplicate functions removed
- [x] Tests updated for new interface

---
id: FK-303
title: Unify goal manager components (P1)
status: done
epic: R-003
owner: agent
labels: [planner, architecture]
---
Merge fragmented goal-management logic into a single orchestrator for consistent task routing.

**AC**
- [x] Legacy managers deprecated
- [x] Unified manager handles subtask expansion and agent delegation
- [x] Migration tests ensure parity with previous behavior

---
id: FK-304
title: Generate sprints and roadmap automatically (P3)
status: done
epic: R-004
owner: agent
labels: [planning, automation]
---
Create an automated process that builds sprint plans and roadmap updates from the backlog.

**AC**
- [x] Command outputs upcoming sprint plan and roadmap
- [x] Generated documents reflect task priorities
- [x] Documentation explains usage

---

id: M-030

title: Autonomous task execution from high-level goals (P1)
status: done
epic: R-003
owner: agent
labels: [autonomy, planner]
---
Allow Forgekeeper to autonomously expand high-level goals into actionable tasks and execute them.

**AC**
- [x] Goals are converted into executable tasks automatically
- [x] Top task executes without manual triggers
- [x] Execution outcomes are logged via self-review

---
id: M-033

title: Optional remote push with changelog and justification (P3)
status: done
epic: R-003
owner: agent

labels: [git, automation]
---
When permitted, push commits to a remote repository with a generated changelog and rationale.

**AC**
- [x] Push step can be toggled or approved
- [x] Generated changelog summarizes commit contents
- [x] Push includes justification for changes

---
id: FK-401
title: Vectorized memory retrieval (P1)
status: todo
epic: R-005
owner: agent
labels: [memory, retrieval]
---
Add vector search to retrieve relevant memories using embeddings.

**AC**
- [ ] Memory entries indexed with vector embeddings
- [ ] Similarity queries return relevant context
- [ ] Tests cover indexing and lookup performance

---
id: FK-402
title: Multi-agent collaboration framework (P2)
status: todo
epic: R-006
owner: agent
labels: [agents, collaboration]
---
Enable coordinated task execution across multiple agents with shared context.

**AC**
- [ ] Agents exchange messages via common protocol
- [ ] Tasks support collaborative handoff between roles
- [ ] Integration tests validate multi-agent workflows

---
id: FK-403
title: Sandbox execution environment (P2)
status: todo
epic: R-007
owner: agent
labels: [sandbox, testing]
---
Provide isolated runtime to safely execute code changes without affecting host.

**AC**
- [ ] Sandbox restricts filesystem and network access
- [ ] Execution results captured for review
- [ ] Documentation explains sandbox limitations

---
id: FK-404
title: Real-time conversation interface (P3)
status: todo
epic: R-008
owner: agent
labels: [interface, realtime]
---
Offer live conversational interface with streaming responses and session control.

**AC**
- [ ] Interface streams responses in real time
- [ ] Users can interrupt or resume conversations
- [ ] Usage examples documented

---
id: FK-405
title: Implement attention distillation for GraphQL chat memory (P3)
status: todo
epic: R-009
owner: agent
labels: [memory, attention]
links: ["Roadmap.md#fk-405"]
---
Introduce attention distillation to refine GraphQL chat memory retrieval.

**AC**
- [ ] Distill attention weights into compact representations
- [ ] Retrieval leverages distilled attention summaries
- [ ] Tests validate improved context accuracy

---
id: FK-406
title: Document memory agent architecture (P1)
status: todo
epic: R-010
owner: agent
labels: [memory, docs]
links: ["Roadmap.md#fk-406"]
---
Create documentation for memory agents, their interactions, and extension points.

**AC**
- [ ] Outline current memory agent roles and interfaces
- [ ] Provide examples of extension hooks
- [ ] Reference update process in docs

---
id: FK-407
title: Integrate memory agents into orchestration layer (P2)
status: todo
epic: R-010
owner: agent
labels: [memory, integration]
links: ["Roadmap.md#fk-407"]
---
Embed memory agents into the existing planner so tasks can leverage persistent context.

**AC**
- [ ] Orchestration layer loads and updates memory agents
- [ ] Tasks can query and store memories via shared interface
- [ ] Integration tests cover agent coordination

---
id: FK-408
title: Expand memory agents with heuristics and feedback loops (P2)
status: todo
epic: R-010
owner: agent
labels: [memory, heuristics]
links: ["Roadmap.md#fk-408"]
---
Add adaptive heuristics and feedback loops to improve memory agent performance over time.

**AC**
- [ ] Implement heuristic scoring for memory relevance
- [ ] Feedback loops adjust heuristics based on outcomes
- [ ] Metrics captured to evaluate improvements
