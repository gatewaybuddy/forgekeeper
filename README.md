# Forgekeeper (Fresh Start)

Quick CLI entry points and scripts to bring up the Core (llama.cpp by default), ensure the full stack, and chat with reasoning.

## Quick Start

- Copy environment template and adjust as needed:
  - `cp .env.example .env`

- Choose inference core (default is llama.cpp):
  - Edit `.env` and set `FK_CORE_KIND=llama` (default) or `FK_CORE_KIND=vllm`.

- Ensure Core only (idempotent):
  - Windows: `pwsh scripts/ensure_llama_core.ps1`
  - Linux/mac: `bash scripts/ensure_llama_core.sh`
  
- Ensure full stack (profiles + optional MongoDB):
  - Windows: `python -m forgekeeper ensure-stack --build --include-mongo`
  - Linux/mac: `python -m forgekeeper ensure-stack --build --include-mongo --compose-file archive/docker-compose.yml`

- Chat
  - Python CLI (streaming default): `python -m forgekeeper chat -p "Say 'harmony ok'."`
  - Python CLI non-stream: `python -m forgekeeper chat -p "Hello" --no-stream`
  - Tools demo (safe dir listing): `python -m forgekeeper chat -p "List current folder" --tools dir`
  - PowerShell script (Windows):
    - Streaming: `pwsh forgekeeper/scripts/chat_reasoning.ps1 -Prompt "Hello"`
    - Non-stream: `pwsh forgekeeper/scripts/chat_reasoning.ps1 -Prompt "Hello" -NoStream`

Streaming vs non‑stream
- Streaming prints tokens as they arrive via SSE; you’ll see partial reasoning chunks `[r]` and a final `[final]` line.
- Non‑stream waits for the response to finish and prints only the final text.

### No‑GPU mock for smoke tests
- Start a local mock OpenAI server and run the smoke script:
  - `node scripts/mock_openai_server.mjs` (serves `/v1/chat/completions`, `/health[z]`)
  - In another shell: `FK_CORE_API_BASE=http://localhost:8001 python scripts/test_harmony_basic.py`

### Make targets
- `make dev-ui` - run Vite dev server
- `make ui-build` - typecheck + build UI
- `make lint` - ESLint on `src/`
- `make typecheck` - `tsc --noEmit`
- `make test-ui` - vitest (server orchestrator)
- `make test-py` - install + pytest
- `make task-sanity` - lint task cards for required fields
- `make pr-check TASK=T#` - locally enforce Allowed Touches for staged changes

## Frontend (Web UI)

- Dev server (Vite + React):
  - Install deps: `npm --prefix frontend install`
  - Start: `npm --prefix frontend run dev`
  - Opens on `http://localhost:5173` and proxies `/v1`, `/health`, `/healthz` to the Core server.
  - Note: `/api/chat` is not available in Vite dev mode; use the server mode below.

- Tool-enabled chat orchestration (server-side):
  - Endpoint: `POST /api/chat` (non-streaming) via `frontend/server.mjs`.
  - Client helper: `frontend/src/lib/chatClient.ts::chatViaServer`.
  - Tools live under: `frontend/tools/*.mjs` with aggregator `tools/index.mjs` (compat wrapper at `server.tools.mjs`).
  - Orchestrator loop: `frontend/server.orchestrator.mjs` handles `tool_calls`.
  - UI wiring: `Chat.tsx` routes blocking sends via `/api/chat` and streaming sends via `/api/chat/stream` automatically (no separate tools button).
  - Discovery: `GET /api/tools` returns `{ enabled, count, names, defs }`; `/config.json` includes a `tools` summary. The UI disables tools when none available and shows the list in the footer.
  - System prompt: `Chat.tsx::buildSystemPrompt` uses the `/api/tools` metadata (falling back to the names list) to describe each tool. Update that helper if tool usage instructions change so the UI and allowlist stay in sync.

### Built-in Tools (Server)
- `get_time`: returns current UTC ISO timestamp.
- `echo`: echoes provided text.
- `read_file`: reads a text file under the sandbox root (size-limited).
- `read_dir`: lists directory entries under a sandbox root.
- `write_file`: writes a file under the sandbox root (size-limited).
- `run_powershell` (gated): runs a PowerShell command if enabled.

Environment controls (server.mjs process):
- `TOOLS_FS_ROOT` — sandbox root for `read_dir`/`write_file` (default: current working dir of server).
- `TOOLS_MAX_WRITE_BYTES` — max bytes for `write_file` (default: 65536).
- `TOOLS_MAX_READ_BYTES` — max bytes for `read_file` (default: 65536).
- `FRONTEND_ENABLE_POWERSHELL=1` — enable `run_powershell` tool (disabled by default).
- `PWSH_PATH` — override pwsh executable (defaults: `pwsh` or `powershell.exe` on Windows).

### Debugging tools
- In the UI, enable "Tools diagnostics" to see recent tool calls (name + args) per step of the server-side orchestration.

### Server Policies & Limits
- Tool allowlist: set `TOOL_ALLOW` to a comma‑separated list of tool names to permit (e.g., `get_time,echo,read_file`). If unset, all registered tools are allowed.
- Rate limiting: set `API_RATE_PER_MIN` to an integer to limit requests per minute per IP for `/api/chat` and `/api/chat/stream` (0 disables limiting).
- Metrics: GET `/metrics` returns counters `{ totalRequests, streamRequests, totalToolCalls, rateLimited }`.
- Auditing: tool executions append JSON lines to `.forgekeeper/tools_audit.jsonl` (fields: `ts`, `name`, `args`, `iter`, `ip`).

### Streaming Final Turn
- Non‑streaming tools loop: `POST /api/chat` runs tool orchestration and returns `{ assistant, messages, debug }`.
- Streaming final turn: `POST /api/chat/stream` runs the tool loop server‑side, then streams the final assistant turn from the upstream OpenAI‑compatible server via SSE (`text/event-stream`).
- The Vite dev client can still stream directly from `/v1/chat/completions`; use the “Send (tools)” button to route via `/api/chat` or integrate your own SSE consumer for `/api/chat/stream`.

- Dockerized UI (Node.js server):
  - Included in default compose via `python -m forgekeeper`.
  - Serve URL: `http://localhost:${FRONTEND_PORT}` (default `http://localhost:5173`).
  - Container serves static UI with an Express server and runtime config at `/config.json`.
  - Built-in reverse proxy maps `/v1`, `/health`, `/healthz` to the Core container (default target `http://llama-core:8000`).
  - Configure via env: `FRONTEND_VLLM_API_BASE` (default `http://llama-core:8000/v1`), `FRONTEND_VLLM_MODEL` (default `core`), `FRONTEND_PORT` (default `5173` via `.env`; compose fallback `3000` if unset).
  - Local server mode (without Docker): `npm --prefix frontend run build && npm --prefix frontend run serve` (serves `/api/chat`).

- Configure endpoints:
  - Default API base: `/v1` (proxied to `http://localhost:8001`).
  - Change via env: set `VLLM_PROXY_TARGET=http://localhost:8001` before `npm run dev`, or in the UI Settings change API base.
  - Default model: `core` (change in UI or set `VITE_VLLM_MODEL`).

- Run end‑to‑end:
  1) Ensure Core: `python -m forgekeeper up-core`
  2) Start UI: `npm --prefix frontend run dev`
  3) Visit `http://localhost:5173` → send prompts; toggle “Show reasoning” to view chain‑of‑thought.

## CLI Reference

- `python -m forgekeeper compose`
  - Tries platform start wrapper (`start.ps1`/`start.sh`). If unavailable/fails, falls back to `up-core` and prints a hint.

- `python -m forgekeeper up-core`
  - Ensures the default core (`llama-core`) is up. Use `FK_CORE_KIND=vllm` to switch and use vLLM instead.

- `python -m forgekeeper ensure-stack [--build] [--include-mongo] [--profile NAME ...] [--compose-file FILE]`
  - Cross‑platform wrapper over `scripts/ensure_stack.ps1|.sh`. Defaults to profiles: backend, ui, agent, inference.

- `python -m forgekeeper chat [--base-url URL] [--model NAME] [--no-stream] -p PROMPT`
  - PowerShell streaming client on Windows; simple non-streaming Python fallback elsewhere.
  - When using the Python CLI, pass `--no-stream` (two hyphens). The PowerShell switch is `-NoStream` only when calling the `.ps1` directly.
  - Tools demo: add `--tools dir` to enable a minimal `list_dir` function; restrict with `--workdir PATH`.

- `python -m forgekeeper switch-core {llama|vllm} [--no-restart]`
  - Updates `.env` (FK_CORE_KIND, FK_CORE_API_BASE) and restarts the appropriate services (UI + selected core). Use `--no-restart` to skip service changes.

## Harmony Docs

- Protocol summary: `docs/harmony_protocol_summary.md`
- Roadmap: `ROADMAP.md`

## Contributing
- Please read `CONTRIBUTING.md` for the Task Cards policy and local/CI enforcement details.
