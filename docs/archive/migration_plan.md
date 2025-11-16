# Legacy-to-Unified Runtime Migration

This plan tracks the work required to fold the remaining `legacy/forgekeeper_v1`
functionality into the consolidated runtime exposed through `forgekeeper.core`.
The end state removes versioned terminology while preserving battle-tested
features (task queues, planners, self-review, etc.) under one namespace.

## Objectives
- Map every `forgekeeper.*` import used by the historical test suite to a
  maintained module under `forgekeeper.core.*`.
- Port or re-implement critical services (queue, pipeline, change stager,
  memory agents, CLI helpers) so they work with the modern orchestrator and
  storage layouts.
- Retire `legacy/forgekeeper_v1` once parity tests run against the new
  modules.

## Guiding Principles
- Prefer incremental ports: land a thin facade backed by new primitives,
  then iterate rather than dropping in large monolithic copies.
- Maintain backwards-compatible APIs long enough to update caller code and
  tests; surface clear deprecation notices where behaviour changes.
- Keep observability and configuration consistent with the stabilization
  roadmap (ContextLog, `.forgekeeper/` state, env kill switches).

## Workstreams & Tasks

### 1. Inventory & Gap Analysis *(in progress)*
- [x] Catalogue v1/v2 modules consumed by active tests (`tests/`, `automation/`).
- [x] Identify modules already landed under `forgekeeper.core` (change stager,
  git committer, sandbox, task queue, orchestrator stub).
- [ ] Produce a coverage map showing which legacy modules still have no
  replacement; flag orchestrator internals, roadmap committer, and memory agent
  flows as remaining large gaps.
- [ ] Capture prerequisites for each gap (e.g., needs episodic memory adapters,
  requires CLI integration) and refresh this section after each sprint.

### 2. Core Services Port *(active)*
- _Current state_
  - ✅ `forgekeeper.core.change_stager` + sandbox orchestration with shims in
    `forgekeeper.change_stager`.
  - ✅ Git committer stack (checks, pre-review, commit/push) now runs from
    `forgekeeper.core.git`; legacy compatibility surfaces via `forgekeeper.git.*`.
  - ✅ Episodic memory, diff validator, logger, outbox, and self-review scaffolds exist under `forgekeeper.*`.
  - ✅ `forgekeeper.core.orchestrator` now ships events/buffers/policies/facts store; inbox tooling and rich tool semantics remain TODO.
  - ✅ `forgekeeper.core.pipeline` wraps the task queue via `TaskPipeline`/`PipelineContext`, persists state, and re-exports legacy entry points (`forgekeeper.pipeline.*`, `forgekeeper.task_pipeline`).
  - ⚠️ `TaskPipeline.run_next_task` still only selects/marks tasks; change execution/commit loop pending.

- Next actions
  1. **Pipeline execution** – extend `TaskPipeline.run_next_task` to orchestrate diff generation, staging, self-review, and commit/push via the core git modules.
  2. **Orchestrator parity** – finalize inbox tooling and richer tool pumps built on the new `forgekeeper.core.orchestrator` primitives.
  3. **Self-review upgrade** – restore review summaries + user prompts and add coverage under `tests/git_committer/` for abort paths.
  4. **Memory bridge** – expose facts store / retrieval helpers required by the orchestrator prompt construction.

### 3. LLM & Tooling Clients *(queued)*
- Validate the existing `forgekeeper.llm` facade against v2 provider coverage;
  port streaming adapters, retries, and tracing hooks as needed.
- Relocate tooling (benchmarks, adapters) from v2 into
  `forgekeeper.core.llm`/`forgekeeper.core.orchestrator.adapters`.
- Update CLI entrypoints once orchestrator internals settle, ensuring
  `forgekeeper/main.py` runs unified modes by default.

### 4. Automation & Review Loop *(queued)*
- Align automation tasks in `automation/migration_tasks.yaml` with new module
  layout; remove `legacy/forgekeeper_v1` references.
- Port roadmap committer + task committer agents to use the unified git
  committer and orchestrator.
- Wire GraphQL/backend callbacks once event schemas stabilize.

### 5. Decommission Legacy Tree *(future milestone)*
- Track remaining imports of `legacy/forgekeeper_v1` via static analysis.
- Remove shim aliases and delete the legacy tree once orchestrator + pipeline
  parity tests pass.
- Publish a release checklist covering config changes and migration scripts.

## Deliverables
- Updated tests that run against `forgekeeper.core.*` modules by default.
- Build + smoke scripts referencing the unified runtime only.
- Documentation refresh (README, roadmap, commands) with no versioned
  terminology beyond historical footnotes.

## Backlog / Nice-to-haves
- Optional compatibility layer to load archived state files into the new
  ContextLog/agentic memory format.
- Sandbox runner orchestration updates once the ToolShell work (Phase 4)
  lands.
