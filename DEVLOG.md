# Session Notes — vLLM Startup & DX Improvements (2025-09-09)

These notes summarize the troubleshooting and changes made to improve local startup reliability and LLM configuration.

## What We Changed
- Startup scripts: robust waits and flags
  - PowerShell: `start.ps1` and `scripts/start_local_stack.ps1` support `-Verbose`, `-RequireVLLM`, `-VLLMWaitSeconds`, `-RequireBackend`, `-BackendWaitSeconds`, `-Detach`, `-LogDir`.
  - Bash: `scripts/start_local_stack.sh` mirrors flags (`--debug`, `--require-vllm`, `--vllm-wait-seconds`, `--require-backend`, `--backend-wait-seconds`).
  - Added .env loader, health checks for vLLM and backend, resilient `Wait-Process` loop.
- vLLM fallback
  - If Python vLLM is unavailable, automatically launch Dockerized vLLM (`vllm/vllm-openai:latest`) via:
    - `scripts/start_vllm_core_docker.ps1` (Windows)
    - `scripts/start_vllm_core_docker.sh` (macOS/Linux)
  - Install scripts attempt `pip install vllm`, otherwise `docker pull vllm/vllm-openai:latest` when Docker is present.
- Frontend proxy
  - Vite now proxies `/graphql` → `http://localhost:4000` during dev.
- Backend fix
  - `backend/src/index.ts` imports are extensionless to resolve TS sources via ts-node.
- Docs
  - `README.md`, `AGENTS.md`, `DEVELOPER_NOTES.md`, `frontend/README.md`, `Roadmap.md` updated with flags, vLLM config, Docker fallback.

## Expected Local Config
- One vLLM server for both agents:
  - `.env`: `VLLM_MODEL_CORE=./models/gpt-oss-20b` and `FK_CORE_API_BASE=http://localhost:8001`.
  - Optional: `FK_CODER_API_BASE=http://localhost:8001` (same server).

## How To Start
- Strict waits (Windows):
  - `pwsh ./start.ps1 -RequireVLLM -VLLMWaitSeconds 300 -RequireBackend -BackendWaitSeconds 90 -Verbose`
- Strict waits (macOS/Linux):
  - `./start.sh --require-vllm --vllm-wait-seconds 300 --require-backend --backend-wait-seconds 90 --debug`

## Known Gotchas / Next Steps
- Windows + Python vLLM often fails; prefer Dockerized vLLM with GPU support (Docker Desktop + WSL2 + NVIDIA drivers).
- If health never turns green:
  - Check vLLM: `docker logs -f forgekeeper-vllm-core` (or `logs/start-fg-*/vllm_core.err.log`).
  - Check backend: `http://localhost:4000/health` and console output.
- Optional preflight: add a GPU-capability check in Docker (e.g., `nvidia-smi`) if needed.
