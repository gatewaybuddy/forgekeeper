# Work Summary – Forgekeeper v2 + TritonLLM (Resume Notes)

Date: 2025-09-17

## What We Changed
- v2 Default: Routed `forgekeeper` and `python -m forgekeeper` to v2 orchestrator; moved v1 to `forgekeeper/legacy/forgekeeper_v1`.
- Local Precedence: `forgekeeper/forgekeeper/__main__.py` prefers local mono‑repo v2 sources over any stale installed copy.
- Docs/Compose: `forgekeeper-v2/docker-compose.tritonllm.yml` defaults `HOST_MODEL_DIR=./models` and `CHECKPOINT=/models/gpt-oss-20b/original`.
- Triton Adapter: Hardened SSE handling; uses `Authorization` if `OPENAI_API_KEY`/`TRITONLLM_API_KEY` set.
- Gateway Entrypoint: Runs `tritonllm.gpt_oss.responses_api.serve` and forwards to `0.0.0.0:8008` via `socat`; endpoint is `/v1/responses`.
- UI Input: `forgekeeper_v2.ui.server` page submits to `/input` (Enter/Send) and echoes to the log immediately.
- Smoke Scripts: Added `scripts/smoke_tritonllm.{ps1,sh}` and `scripts/download_hf_model.py`.
- One‑Click Dev Start: `scripts/start_v2_with_triton.ps1` starts gateway, v2 UI (`:8787`), orchestrator (duration=0), and writes logs.
- Make Target: `make -C forgekeeper v2-dev-triton` runs the one‑click dev start.
- Merged thoughtworld into `main`; pushed all changes to `origin/main`.

## How To Run
- Full dev stack: `pwsh forgekeeper/scripts/start_v2_with_triton.ps1` (or `make -C forgekeeper v2-dev-triton`)
  - Gateway: `http://127.0.0.1:8008/openapi.json`
  - UI: `http://127.0.0.1:8787` (type, press Enter or click Send)
- Gateway smoke only: `pwsh forgekeeper/scripts/smoke_tritonllm.ps1 -WaitSeconds 600` (or bash `.sh` variant)
- Direct v2: `forgekeeper server` and `forgekeeper run --llm triton --duration 0` (or `python -m forgekeeper …`)

## Current Status
- TritonLLM gateway returns 200 OK from `/v1/responses`.
- v2 UI streams events and accepts input; orchestrator tails `.forgekeeper/inbox_user.jsonl` and processes messages via TRITONLLM_URL.

## Key Files
- `forgekeeper/scripts/start_v2_with_triton.ps1`
- `forgekeeper/scripts/smoke_tritonllm.ps1`, `forgekeeper/scripts/smoke_tritonllm.sh`, `forgekeeper/scripts/download_hf_model.py`
- `forgekeeper/forgekeeper_v2/ui/server.py`
- `forgekeeper-v2/docker-compose.tritonllm.yml`
- `forgekeeper/forgekeeper/__main__.py`
- `forgekeeper/Makefile` (target: `v2-dev-triton`)

## Next Steps (Optional)
- Add UI status badges (WS connected, sent OK/error, gateway OK).
- Unix one‑shot dev script matching the PowerShell flow.
- Integrate a proper TRT‑LLM engine build (requires NGC auth) for maximum performance.

