Unified Runtime Migration Playbook (2025-09-23)
------------------------------------------------

Recent work
- Unified git committer stack, sandbox, episodic memory utilities under forgekeeper.core.
- Orchestrator internals (events, buffers, policies, facts store) run from forgekeeper.core.orchestrator; duet/single smoke tests succeeding.
- Task pipeline rebuilt on forgekeeper.core.pipeline (TaskPipeline/PipelineContext, heuristics-based planner + executor, staging/commit scaffolding, state persistence, legacy shims) with pytest coverage in tests/test_task_pipeline.py.
- Local tooling installed via python3 -m pip install --user --break-system-packages GitPython pytest pytest-asyncio.
- Smoke test commands: python3 -m pytest tests/test_v2_modes.py -q | python3 -m pytest tests/test_task_pipeline.py -q.

Dependency checkpoints
1. Orchestrator parity -> finish inbox tailers + richer tool pumps to unlock end-to-end pipeline streaming.
2. Pipeline execution -> replace heuristic planner with migrated v1 analysis/LLM loop so change_stager + git committer run without manual stubs.
3. Self-review enhancements -> require episodic memory + diff validator; feed into git_committer abort-path regressions.
4. Automation agents -> depend on pipeline + orchestrator before we retire the legacy tree.

Near-term tasks
- Port forgekeeper-v2/forgekeeper_v2/orchestrator inbox tailer + tool pumps while keeping the JSONL schema stable.
- Swap the heuristic planner for the migrated v1 analysis/LLM adapters so the staging + git committer scaffolding runs end-to-end.
- Rehydrate legacy self_review + diff_validator with pytest coverage (tests/git_committer/*).
- Point forgekeeper/main.py and forgekeeper/__main__.py at forgekeeper.core.orchestrator once parity lands.

Quick start
- Install deps: python3 -m pip install --user --break-system-packages GitPython pytest pytest-asyncio
- Smoke commands: python3 -m pytest tests/test_v2_modes.py -q | python3 -m pytest tests/test_task_pipeline.py -q | python3 -m pytest tests/git_committer -q (post-parity)
- Debug tips: export PYTHONASYNCIODEBUG=1 when hacking on orchestrator/pipeline code.

Logging & telemetry
- Use forgekeeper.logger.get_logger for consistent formatting.
- Recorder outputs live under .forgekeeper/ - keep event schemas stable.

Open questions
- Keep JSONL facts store or migrate to ContextLog?
- Should sandbox jobs invoke pipeline hooks automatically or remain opt-in?

Keep this document updated as milestones close or new risks surface.
