# Forgekeeper (Fresh Start)

Quick CLI entry points and scripts to bring up the vLLM Core, ensure the full stack, and chat with reasoning.

## Quick Start

- Ensure vLLM Core only (idempotent):
  - Windows: `pwsh forgekeeper/scripts/ensure_vllm_core.ps1 -AutoBuild`
  - Linux/mac: `bash forgekeeper/scripts/ensure_vllm_core.sh`

- Ensure full stack (profiles + optional MongoDB):
  - Windows: `python -m forgekeeper ensure-stack --build --include-mongo`
  - Linux/mac: `python -m forgekeeper ensure-stack --build --include-mongo --compose-file archive/docker-compose.yml`

- Chat with reasoning (streams deltas, then prints final):
  - Windows: `python -m forgekeeper chat -p "Say 'harmony ok'."`
  - Non‑streaming fallback (Linux/mac): `python forgekeeper/scripts/test_harmony_basic.py`

## Frontend (Web UI)

- Dev server (Vite + React):
  - Install deps: `npm --prefix forgekeeper/frontend install`
  - Start: `npm --prefix forgekeeper/frontend run dev`
  - Opens on `http://localhost:5173` and proxies `/v1`, `/health`, `/healthz` to the vLLM server.

- Dockerized UI (Node.js server):
  - Included in default compose via `python -m forgekeeper`.
  - Serve URL: `http://localhost:${FRONTEND_PORT}` (default `http://localhost:5173`).
  - Container serves static UI with an Express server and runtime config at `/config.json`.
  - Built-in reverse proxy maps `/v1`, `/health`, `/healthz` to the vLLM Core container (default target `http://vllm-core:8000`).
  - Configure via env: `FRONTEND_VLLM_API_BASE` (default `http://vllm-core:8000/v1`), `FRONTEND_VLLM_MODEL` (default `core`), `FRONTEND_PORT` (default `5173` via `.env`; compose fallback `3000` if unset).

- Configure endpoints:
  - Default API base: `/v1` (proxied to `http://localhost:8001`).
  - Change via env: set `VLLM_PROXY_TARGET=http://localhost:8001` before `npm run dev`, or in the UI Settings change API base.
  - Default model: `core` (change in UI or set `VITE_VLLM_MODEL`).

- Run end‑to‑end:
  1) Ensure Core: `python -m forgekeeper up-core`
  2) Start UI: `npm --prefix forgekeeper/frontend run dev`
  3) Visit `http://localhost:5173` → send prompts; toggle “Show reasoning” to view chain‑of‑thought.

## CLI Reference

- `python -m forgekeeper compose`
  - Tries platform start wrapper (`start.ps1`/`start.sh`). If unavailable/fails, falls back to `up-core` and prints a hint.

- `python -m forgekeeper up-core`
  - Ensures the `vllm-core` container is up (rebuilds only if config changed).

- `python -m forgekeeper ensure-stack [--build] [--include-mongo] [--profile NAME ...] [--compose-file FILE]`
  - Cross‑platform wrapper over `scripts/ensure_stack.ps1|.sh`. Defaults to profiles: backend, ui, agent, inference.

- `python -m forgekeeper chat [--base-url URL] [--model NAME] [--no-stream] -p PROMPT`
  - PowerShell streaming client on Windows; simple non‑streaming Python fallback elsewhere.

## Harmony Docs

- Protocol summary: `forgekeeper/docs/harmony_protocol_summary.md`
- Roadmap: `forgekeeper/ROADMAP.md`
