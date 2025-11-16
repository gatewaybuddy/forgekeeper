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

GPU Setup Gotchas (2025-10-04)
------------------------------
- Use the correct llama.cpp server image: set `LLAMA_DOCKER_GPU_IMAGE=ghcr.io/ggml-org/llama.cpp:server-cuda`.
- Do not pass `--api` to the server; the `server-*` images expose the OpenAI API by default.
- Ensure Docker sees the NVIDIA runtime: `docker info` should list `Runtimes: ... nvidia`. If missing, install/enable NVIDIA Container Toolkit in Docker Desktop (WSL2).
- Validate GPU passthrough quickly: `docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi`.
- If you started the CPU fallback first, free port 8001 before switching to GPU: `docker compose -f forgekeeper/docker-compose.yml stop llama-core-cpu && docker compose -f forgekeeper/docker-compose.yml rm -f llama-core-cpu`.
- Start the stack with auto-detect + health wait: `pwsh forgekeeper/scripts/start_gpu.ps1 -TimeoutSeconds 600`.
- Model path: keep `LLAMA_MODELS_HOST_DIR` pointing at your host models dir and `LLAMA_MODEL_CORE` to the `.gguf` file; verify via `GET http://localhost:8001/v1/models`.
