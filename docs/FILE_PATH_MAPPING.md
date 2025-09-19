# File Path Mapping (Plan → Repo)

This maps paths referenced in `codex.json`/`codex.plan` to the canonical locations in this repository to preserve existing structure.

- scripts/* → `forgekeeper/scripts/*`
- services/context_log/* → `forgekeeper/forgekeeper/services/context_log/*`
- services/memory/* → `forgekeeper/forgekeeper/services/memory/*`
- services/logging.py → `forgekeeper/forgekeeper/services/logging.py`
- agents/orchestrator.py → `forgekeeper/forgekeeper/agents/orchestrator.py`
- tools/shell.py → `forgekeeper/tools/shell.py`
- automation/tasks.yaml → `forgekeeper/tools/automation/tasks.yaml`
- automation/pipeline.py → `forgekeeper/tools/automation/pipeline.py`
- docs/* → `forgekeeper/docs/*`
- web/src/components/* → `forgekeeper/frontend/src/components/*`
- docker/triton/* → `infra/docker/triton/*`
- models/oss-gpt-20b/* → `infra/models/oss-gpt-20b/*`
- config/allowlist.json → `forgekeeper/config/allowlist.json`
- logs/* (JSONL) → `forgekeeper/logs/*`
- tests for ContextLog → `forgekeeper/tests/services/test_context_log.py`

Notes:
- Keep GPU/serving assets under `infra/` to avoid coupling app code to deployment.
- Use `forgekeeper/tools` for developer/automation helpers; keep runtime agent logic under `forgekeeper/forgekeeper`.
- Frontend lives in `forgekeeper/frontend`; avoid creating sibling `web/`.

