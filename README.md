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

System prompt
- UI: open the "Assistant System Prompt" panel to switch between the auto‑generated prompt (includes tool list) and a custom prompt. The custom prompt is saved to localStorage and applied to the first system message in the chat.
- CLI: pass a one‑off override with `--system "..."` when using `python -m forgekeeper chat`.

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
- `TOOLS_FS_ROOT` — sandbox root for `read_dir`/`write_file`.
  - Default: current working dir of the server process.
  - Docker: docker-compose sets `TOOLS_FS_ROOT=/workspace/sandbox` so files persist in the bind-mounted repo directory (`./ -> /workspace`).
  - Override in `.env` if you want another persisted path (e.g., `/workspace/data`).
- `TOOLS_MAX_WRITE_BYTES` — max bytes for `write_file` (default: 65536).
- `TOOLS_MAX_READ_BYTES` — max bytes for `read_file` (default: 65536).
- `FRONTEND_ENABLE_POWERSHELL=1` — enable `run_powershell` tool (disabled by default).
- `PWSH_PATH` — override pwsh executable (defaults: `pwsh` or `powershell.exe` on Windows).

### Debugging tools
- In the UI, enable "Tools diagnostics" to see recent tool calls (name + args) per step of the server-side orchestration.
- New: `GET /api/ctx/tail?n=50&conv_id=...` returns recent ContextLog events (JSONL-backed).

### Server Policies & Limits
- Tool allowlist: set `TOOL_ALLOW` to a comma‑separated list of tool names to permit (e.g., `get_time,echo,read_file`). If unset, all registered tools are allowed.
- Rate limiting: set `API_RATE_PER_MIN` to an integer to limit requests per minute per IP for `/api/chat` and `/api/chat/stream` (0 disables limiting).
- Metrics: GET `/metrics` returns counters `{ totalRequests, streamRequests, totalToolCalls, rateLimited }`.
- Auditing: tool executions append JSON lines to `.forgekeeper/tools_audit.jsonl` (fields: `ts`, `name`, `args`, `iter`, `ip`).
- ContextLog: structured JSONL under `.forgekeeper/context_log/` with correlation fields (`conv_id`, `trace_id`, `iter`). See `docs/observability.md` and `docs/contextlog/adr-0001-contextlog.md`.

### Streaming Final Turn
- Non‑streaming tools loop: `POST /api/chat` runs tool orchestration and returns `{ assistant, messages, debug }`.
- Streaming final turn: `POST /api/chat/stream` runs the tool loop server‑side, then streams the final assistant turn from the upstream OpenAI‑compatible server via SSE (`text/event-stream`).
- The Vite dev client can still stream directly from `/v1/chat/completions`; use the “Send (tools)” button to route via `/api/chat` or integrate your own SSE consumer for `/api/chat/stream`.
- See: `docs/api/chat_stream.md` for curl examples and client helper notes.

### Finishers & Continuations
- When the model output looks incomplete (short text without terminal punctuation or a dangling code fence), the server auto-requests short continuations to complete the response.
- Defaults:
  - Env: `FRONTEND_CONT_ATTEMPTS` defaults to `2` when unset. Set to `0` to disable.
  - Env: `FRONTEND_CONT_TOKENS` controls the size of each continuation chunk.
  - UI: “Continue attempts” defaults to `2` and persists to localStorage; can be set per-conversation.
- Telemetry: continuation attempts are recorded to ContextLog with `act=auto_continue` including `attempt`, `reason` (`short|punct|fence`), and `elapsed_ms`.

See also: docs/ui/diagnostics_drawer.md for the Diagnostics Drawer and how continuation attempts are summarized in the UI.

### Task Suggestions (TGT)
- Enable: set `TASKGEN_ENABLED=1` for the server process.
- Endpoint: `GET /api/tasks/suggest?window_min=60` analyzes recent ContextLog events and continuation ratios to propose Task Cards.
- UI: open the menu in Chat and choose “Tasks…” to view and copy suggestions.
- Flags:
  - `TASKGEN_CONT_MIN` (default 5), `TASKGEN_CONT_RATIO_THRESHOLD` (default 0.15)
  - `TASKGEN_WINDOW_MIN` (default 60)
  - `TASKGEN_UPSTREAM_MIN` (default 3) — minimum upstream 5xx errors to suggest resilience tasks
  - `TASKGEN_ENABLED` (default `0` → disabled)
- Smoke test: with the server running, `bash forgekeeper/scripts/test_taskgen.sh 60`

### Safe Auto‑PR Loop (SAPL) — Demo
- Preview (dry‑run): `AUTO_PR_ENABLED=1 FRONTEND_PORT=3000 bash forgekeeper/scripts/sapl_demo.sh README.md docs`
  - Calls `POST /api/auto_pr/preview` to validate the allowlist and show unified diff append previews.
  - No PR is created; enable `AUTO_PR_DRYRUN=0` and use the UI’s “Create PR” to open a PR.
- Flags: `AUTO_PR_ENABLED`, `AUTO_PR_DRYRUN`, `AUTO_PR_ALLOW`, `AUTO_PR_LABELS`, `AUTO_PR_AUTOMERGE`.
- PR creation prerequisites:
  - `gh` is installed in the container image (we install it automatically).
  - Provide a GitHub token as `GH_TOKEN` or `GITHUB_TOKEN` (PAT with `repo` scope is sufficient). In Docker Compose, the frontend service forwards these env vars.
  - Ensure `origin` points to your GitHub repo and that Git is configured to use HTTPS (the server route runs `gh auth setup-git` when a token is present).

### GitHub Auth Options (local dev)
- Host env pass‑through (recommended):
  - Windows PowerShell: `$env:GH_TOKEN='ghp_…'; docker compose up -d frontend`
  - Linux/macOS: `export GH_TOKEN='ghp_…'; docker compose up -d frontend`
- Paste token via API (no host env):
  - Enable: `FRONTEND_ENABLE_AUTH_LOCAL=1`
  - `curl -H 'Content-Type: application/json' -d '{"token":"ghp_…"}' http://localhost:${FRONTEND_PORT}/api/auth/github/token`
  - Stored at `.forgekeeper/secrets/gh_token` (gitignored). The server attempts `gh auth login` + `gh auth setup-git` automatically.
- Notes:
  - Tokens are never logged; secrets live under `.forgekeeper/secrets/` which is gitignored by `forgekeeper/.gitignore`.
  - For OAuth/web login (device flow), register an OAuth app and wire its client ID to a future auth handler (tracked as a follow‑up task).

### Upstream Resilience (stub)
- Optional circuit‑breaker/backoff stub for upstream 5xx spikes.
- Flags:
  - `UPSTREAM_CB_ENABLED=1` to enable
  - `UPSTREAM_CB_THRESHOLD` (default 3 failures within window)
  - `UPSTREAM_CB_WINDOW_MS` (default 30000)
  - `UPSTREAM_CB_OPEN_MS` (default 20000)
- Behavior: when open, `/api/chat` and `/api/chat/stream` return `503 { error: "circuit_open", retry_after_ms }` and set `Retry-After`.
- Diagnostics: `GET /api/diagnose` includes `circuit` status.

### Metrics‑Informed Prompting (MIP)
- When `PROMPTING_HINTS_ENABLED=1`, the server may inject a short developer note into the final turn based on recent continuation reasons (e.g., close code fences, finish sentences).
- Tuning envs: `PROMPTING_HINTS_MINUTES` (default 10), `PROMPTING_HINTS_THRESHOLD` (default 0.15).

### Safe Auto‑PR Loop (SAPL)
- Preview: `POST /api/auto_pr/preview` validates an allowlist for docs/config/tests; disabled unless `AUTO_PR_ENABLED=1`.
- Create: `POST /api/auto_pr/create` creates a branch, commits allowlisted files, pushes, and opens a PR via `gh` when `AUTO_PR_ENABLED=1` and `AUTO_PR_DRYRUN=0`.
- Flags: `AUTO_PR_ENABLED`, `AUTO_PR_DRYRUN`, `AUTO_PR_ALLOW`, `AUTO_PR_AUTOMERGE`.
- UI: open Tasks… → Propose PR → Preview → Create PR (enabled by flags).
- See docs/ui/sapl.md for details and the UI flow.

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
