# Unified Runtime Migration Progress

## Summary
- Change stager now runs through `forgekeeper.core.change_stager` with sandbox execution wired into the unified runtime and re-exported via `forgekeeper.change_stager`.
- Sandbox checks now spin up a temp worktree, pick default commands from `CHECKS_*`, log full stdout/stderr, and emit structured error metadata for downstream callers (including git committer shims).
- Git committer flow lives under `forgekeeper.core.git` (checks, pre-review, commit/push orchestration) with lightweight wrappers in `forgekeeper.git_*`; episodic memory, logger, diff validator, and outbox now ship with the unified package.
- Orchestrator internals (events, buffers, policies, facts store) now run under `forgekeeper.core.orchestrator`, with duet/single agents emitting structured JSONL events independent of the old v2 tree.
- Task queue, parser, and episodic memory weighting live under `forgekeeper.core.tasks`; the task pipeline now rides on `forgekeeper.core.pipeline` with `TaskPipeline`, `PipelineContext`, and compatibility shims (`forgekeeper.pipeline.*`, `forgekeeper.task_pipeline`). Pytest coverage (`tests/test_task_pipeline.py`) exercises selection + completion paths.
- Config/goal-manager glue updated for the unified runtime (`AUTONOMY_MODE`, default state paths, modern embedding hooks, planner/tooling fallbacks) so legacy autonomy loops import without v1/v2 trees.
- Minimal LLM facade added in `forgekeeper.llm` (transformers + Triton stubs, HTTP client, benchmarks) with config moved to `forgekeeper/config.py` and harmony renderer in `forgekeeper/inference_backends`.

## Next Steps
1. Expand `TaskPipeline.run_next_task` beyond selection: wire in change staging, diff validation, and commit/push handoff using the new git committer primitives.
2. Backfill orchestrator integration (tool semantics, inbox resilience) so pipeline executions can stream context through the duet/single agents.
3. Port remaining automation/LLM adapters (OpenAI client, roadmap committer, backend callbacks) onto core modules and prune legacy imports.
4. Continue iterating on the migration plan/task YAML, flagging remaining v1/v2-only surfaces until all external imports land under `forgekeeper.core`.
