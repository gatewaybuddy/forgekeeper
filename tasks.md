# ✅ Forgekeeper Tasks

This file tracks current, pending, and completed tasks for Forgekeeper development. Tasks may be fulfilled manually by Cody or automatically by Forgekeeper itself as capabilities improve.

Conversation history now persists exclusively through the GraphQL service, replacing the old file-based memory path.

Sprint plans are generated from active goals and the tasks in this file using `forgekeeper/sprint_planner.py`. The resulting `SprintPlan.md` is reviewed alongside periodic roadmap commits.

---

## 🛠️ Active Tasks

- [ ] FK-351: Compose profiles for modular deploys (P1)
 - [x] FK-352: Gateway registry + weighted routing (P1)
- [ ] FK-353: Extract forgekeeper-core and client packages (P1)
- [x] FK-354: Agent worker entrypoint with outbox polling (P1)
- [ ] FK-355: Multi-node deployment guide and examples (P2)
- [ ] FK-356: Helm charts for K8s (optional) (P3)
- [ ] FK-357: Refresh `FILE_SUMMARY.md` after file changes (P3)

- [ ] FK-411: TinyLLM quickstart preset (P1)
- [ ] FK-412: In-prompt reconfiguration via /commands (P1)
- [ ] FK-413: Safe restart/apply-changes flow (P1)
- [ ] FK-414: Live context counter in CLI and UI (P1)
- [ ] FK-415: /help palette and command hints (P2)
- [ ] FK-416: Multiline prompts (Ctrl+Enter) (P1)



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
- [ ] FK-409: Enable CLI-only self-repair of frontend (P2)
- [ ] FK-410: Enable CLI-only self-repair of backend (P2)
- [ ] FK-411: Maintain agentic memory documentation (P2)
- [ ] FK-412: Integrate MQTT listener for task processing (P2)

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
id: FK-351
title: Compose profiles for modular deploys (P1)
status: todo
epic: R-011
owner: agent
labels: [infra, deploy]
---
Add Compose profiles for headless agent worker, backend-only, ui-only, and inference-only; wire Make targets and docs.

**AC**
- [ ] Compose profiles for each mode (profiles)
- [ ] Make targets for `profile=<name>` convenience
- [ ] Docs updated (README and DOCS_INFERENCE.md)

---
id: FK-352
title: Gateway registry + weighted routing (P1)
status: done
epic: R-011
owner: agent
labels: [gateway, routing]
---
Implement backend registration for vLLM/TRT-LLM nodes with per-model availability, health/queue metrics and weighted round-robin.

**AC**
- [x] Registration endpoint and in-memory registry
- [x] Health polling and model availability tracking (heartbeat mutations supported)
- [x] Weighted routing by queue depth/capacity
- [x] Drain flag for rolling updates
- [x] Metrics surfaced on `/healthz`

---
id: FK-353
title: Extract forgekeeper-core and client packages (P1)
status: todo
epic: R-011
owner: agent
labels: [packaging]
---
Publish `forgekeeper-core` (agent service) and `forgekeeper-inference-client` packages with clear extras and versioning.

**AC**
- [ ] Separate Python distributions with README and metadata
- [ ] Optional extras for dev/tests
- [ ] Minimal service entrypoint for headless agent

---
id: FK-354
title: Agent worker entrypoint with outbox polling (P1)
status: done
epic: R-011
owner: agent
labels: [agents, scaling]
---
Add a lightweight worker process that pulls tasks from the outbox, executes with gateway, and writes results; parameterize worker count.

**AC**
- [x] Worker CLI with concurrency flag (backend `npm run worker`)
- [x] Graceful shutdown and retry semantics (exponential backoff)
- [x] Health/metrics logging (lag and retry metrics on `/health`)

---
id: FK-355
title: Multi-node deployment guide and examples (P2)
status: todo
epic: R-011
owner: agent
labels: [docs, deploy]
---
Document running multiple inference nodes and agent workers across machines; include network, auth, and examples.

**AC**
- [ ] Step-by-step guide (Compose and manual)
- [ ] Example env files per node
- [ ] Troubleshooting and sizing guidance

---
id: FK-356
title: Helm charts for K8s (optional) (P3)
status: todo
epic: R-011
owner: agent
labels: [k8s, infra]
---
Provide minimal Helm charts mirroring Compose profiles for gateway, inference nodes, backend, and workers.

**AC**
- [ ] Charts with values for model lists and resources
- [ ] Readme and sample values files
- [ ] Note GPU scheduling requirements
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
status: in_progress
epic: R-005
owner: agent
labels: [memory, retrieval]
---
Add vector search to retrieve relevant memories using embeddings. Basic TF–IDF and optional SentenceTransformer support exist and are used in planning; extend coverage, weighting, and metrics.

**AC**
- [ ] Memory entries indexed with vector embeddings (TF–IDF or ST)
- [ ] Similarity queries return relevant context across modules
- [ ] Heuristics weight planning/prioritization using retrieval scores
- [ ] Metrics captured for retrieval quality and impact

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

---
id: FK-409
title: Enable CLI-only self-repair of frontend (P2)
status: todo
epic: R-003
owner: agent
labels: [frontend, cli, autonomy]
---
Allow Forgekeeper to repair and evolve the React/Vite frontend without launching it, running only the Python pipeline. Scope TS checks to UI edits.

**AC**
- [ ] `scripts/start_local_stack.(sh|ps1)` supports `--cli-only`/`-CliOnly`
- [ ] In CLI-only mode, pipeline runs without backend/frontend
- [ ] TS checks run only for tasks modifying `frontend/`
- [ ] Example repair task completes end-to-end from CLI

---
id: FK-410
title: Enable CLI-only self-repair of backend (P2)
status: todo
epic: R-003
owner: agent
labels: [backend, cli, autonomy]
---
Allow Forgekeeper to repair and evolve the GraphQL backend without launching it, running only the Python pipeline. Scope TS checks to backend edits.

**AC**
- [ ] Pipeline can modify `backend/` and run only backend TS checks
- [ ] CLI-only mode skips frontend and GraphQL UI bring-up
- [ ] Example backend fix task completes end-to-end from CLI

---
id: FK-411
title: TinyLLM quickstart preset (P1)
status: todo
epic: R-011
owner: agent
labels: [dx, setup]
---
Provide a zero-deps CPU-only startup using a tiny Transformers model for fast trials.

**AC**
- [ ] One-liner start with tiny model in CLI-only mode
- [ ] Docs: clearly list env vars (`LLM_BACKEND=transformers`, `USE_TINY_MODEL=true`, `FK_DEVICE=cpu`)
- [ ] Start scripts accept `--tiny`/`-Tiny` to set sane defaults

---
id: FK-412
title: In-prompt reconfiguration via /commands (P1)
status: todo
epic: R-003
owner: agent
labels: [cli, ui, config]
---
Allow runtime configuration from the chat input using `/command` syntax; changes persist to `.forgekeeper` and apply immediately when possible.

**AC**
- [ ] Recognize `/model`, `/temperature`, `/top_p`, `/backend`, `/gateway`, `/project`, `/reset`
- [ ] Persist changes to a config file and current session
- [ ] Validate and echo effective config back to the user
- [ ] Backend/agent receive config updates through GraphQL or local IPC

---
id: FK-413
title: Safe restart/apply-changes flow (P1)
status: todo
epic: R-003
owner: agent
labels: [dx, reliability]
---
Introduce `/restart` to apply changes requiring a restart (e.g., backend URL change); cleanly stop workers and resume sessions post-restart.

**AC**
- [ ] `/restart` command prompts for confirmation and reason
- [ ] Graceful shutdown of local workers; resume on start
- [ ] Persist pending conversations; reload after restart
- [ ] Start scripts honor a restart request from the agent/CLI

---
id: FK-414
title: Live context counter in CLI and UI (P1)
status: todo
epic: R-008
owner: agent
labels: [ui, ux]
---
Display running token count for the current chat context at the bottom of the screen in the CLI and beneath the input area in the web UI.

**AC**
- [ ] Token estimator shows current/remaining tokens per model
- [ ] Updates as you type; counts messages included in next turn
- [ ] Toggle via `/context on|off`

---
id: FK-415
title: /help palette and command hints (P2)
status: todo
epic: R-008
owner: agent
labels: [ui, cli, docs]
---
Provide discoverability: `/help` opens a command palette with descriptions; inline hints appear when typing `/`.

**AC**
- [ ] `/help` lists commands with descriptions and current values
- [ ] UI shows a dropdown of matching commands after typing `/`
- [ ] CLI prints a compact help panel above the input

---
id: FK-416
title: Multiline prompts (Ctrl+Enter) (P1)
status: todo
epic: R-008
owner: agent
labels: [ui, cli]
---
Allow multiline chat input by inserting a newline on Ctrl+Enter and sending on Enter in the web UI; mirror behavior in CLI TUI.

**AC**
- [ ] Web: Ctrl+Enter inserts newline, Enter sends
- [ ] CLI: Ctrl+Enter inserts newline in input widget
- [ ] Setting persists per user/session

