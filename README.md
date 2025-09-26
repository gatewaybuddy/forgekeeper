# Forgekeeper


Note: The active Forgekeeper runtime now consolidates the modern orchestrator, memory, and tooling code paths. Historical sources remain in `legacy/forgekeeper_v1` for archival reference only. The `forgekeeper` CLI and `python -m forgekeeper` entrypoints load the unified runtime via the `forgekeeper.core` namespace.


Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
All conversation data flows through this GraphQL API, replacing earlier file-based helpers.
This repository includes all components required to run the local development environment.

## Architecture Snapshot

- `forgekeeper/core/` re-exports the modern orchestrator modules and hosts the migration stubs (queue, pipeline, change stager, etc.).
- `python -m forgekeeper` launches the single-agent orchestrator by default; pass `--mode duet` to opt into dual-agent runs.
- Event logs and agentic memory persist under `.forgekeeper/` (`events.jsonl`, `agentic_memory.json`, `facts.json`).
- `legacy/forgekeeper_v1` is archived for reference-only tests and will be removed after migration.

## Migration Tracking

See `docs/migration_plan.md` and `automation/migration_tasks.yaml` for the step-by-step plan to port remaining legacy modules.

## Command Reference

See `docs/COMMANDS.md` for the canonical list of commands used during the stabilization track. Update that file as commands evolve.

## First-Run Checklist

1. Install PowerShell 7 (`pwsh`) on Windows/macOS/Linux and ensure it is on `PATH`.
2. Run the guided installer to generate `.env`, set model paths, and (optionally) launch services:
   - Bash: `./scripts/install.sh --defaults`
   - PowerShell: `pwsh scripts/install.ps1 -Defaults`
3. If `mongod` is not installed, allow the installer to start the Dockerized `forgekeeper-mongo` container (reused across runs).
4. Optional: choose vLLM or a local Transformers model and confirm env vars in `.env` (see vLLM section below).
5. Verify the stack with smoke tests:
   - Backend wiring: `python tools/smoke_backend.py`
   - LLM: `python scripts/llm_smoke_test.py`

## PowerShell 7

Several setup scripts use the `pwsh` command, which is part of PowerShell 7.
If `pwsh` is not available on your system, download and install PowerShell 7
from the [official website](https://aka.ms/powershell) and ensure it is on
your `PATH` before running the PowerShell examples.

## Environment file

Use the installer as the main entry point to create or update the `.env`
configuration and choose how Forgekeeper runs:

```bash
./scripts/install.sh
```

If the `mongod` command is missing, the installer offers to launch a
temporary MongoDB container (defaults to "yes"). Use `--help`/`-h` to
display usage or pass `--defaults` (alias `--yes`) to apply all defaults
without interactive prompts.

PowerShell users can invoke the equivalent script:

```powershell
pwsh scripts/install.ps1
```

The PowerShell variant also accepts `-Defaults` as an alias for `--defaults`.


During execution the installer prompts for three items:

1. **Setup type** – local single‑user or multi‑agent distributed (Docker)
2. **Model storage directory** – defaults to `./models`
3. **Dependency installation** – install Node/Python dependencies and launch services (backend, Python agent, frontend)

Use `--defaults` to skip these questions and apply the default values.

When the third option is enabled for the local setup, the installer runs `scripts/setup_dev_env.sh --launch-services` to start the GraphQL service, Python agent, and frontend. Rerun the installer any time to switch between local and multi‑agent modes or to change the model directory.

*Advanced*: The legacy `setup_env*` and `setup_docker_env*` scripts remain
available for manual configuration.

## MongoDB

The GraphQL service requires a running MongoDB instance. If the `mongod`
command is unavailable, the installer prompts to start a Dockerized MongoDB
instance (defaulting to starting it). On Windows, the PowerShell installer
(`scripts/install.ps1`) will automatically reuse an existing
`forgekeeper-mongo` container or create one using `mongo:6`. The container is
reused on subsequent runs; stop it with `docker stop forgekeeper-mongo` and
remove it with `docker rm forgekeeper-mongo`. Alternatively, install MongoDB
manually (for example, `brew tap mongodb/brew && brew install mongodb-community`
on macOS or `sudo apt-get install -y mongodb-org` on Ubuntu). The
`docker-compose.yml` file also includes a `mongodb` service for
container-based development.

## Installation

The installer above also handles dependency installation and service startup
based on the selected mode. Rerun it whenever you switch between local and
multi‑agent setups.

*Advanced*: To run individual setup scripts directly, use:

- `scripts/setup_dev_env.sh` / `scripts/setup_dev_env.ps1` for local
  development (add `--launch-services` to start all services after setup)
- `scripts/setup_docker_env.sh` / `scripts/setup_docker_env.ps1` for the
  Docker‑based stack

Alternatively, follow the manual steps below.

If you removed existing `node_modules` directories, reinstall the Node dependencies:

```bash
npm install --prefix backend
npm install --prefix frontend
```

### Backend (Python)
1. Create a virtual environment (optional):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   Triton-based providers require an NVIDIA GPU with a compatible CUDA toolkit
   (e.g., CUDA 12+) for `tritonllm` and `tritonclient[http]`.
3. Optional: configure local Harmony model parameters via environment variables:
   - `OPENAI_REASONING_EFFORT` – one of `low`, `medium`, or `high` (default: `medium`).
   - `LLM_TEMPERATURE` and `LLM_TOP_P` – sampling parameters passed to `llama_cpp`.
   These settings may also be overridden by including lines such as `Reasoning: high` or
   `Temperature: 0.5` at the top of a prompt.

### GraphQL Service (Node/TypeScript)
1. Install Node dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Configure the MongoDB connection string (use `mongodb` as the host when
   running inside Docker). For local development we keep the default pointed at
   `localhost` with `directConnection=true` (to skip replica-set discovery) and
   `retryWrites=false` so Prisma does not follow the container-advertised host:
   ```bash
   export DATABASE_URL="mongodb://localhost:27017/forgekeeper?directConnection=true&retryWrites=false"
   ```
3. Generate the Prisma client:
   ```bash
  npx prisma generate
  ```

4. Optional: run the outbox worker to publish messages to MQTT and track delivery with retries:
   ```bash
   npm run worker --prefix backend
   ```

### Frontend (React)
1. Install Node dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Running

If you chose to launch services during installation or ran `scripts/setup_dev_env.sh --launch-services`, the GraphQL service, Python agent, and frontend will already be running. Use the commands below to start them manually if needed.

### Start all services

- `forgekeeper`
  - Brings up backend, agent, frontend, and the default inference backend.
  - `forgekeeper --cli-only` launches only the CLI agent (no services).

Legacy wrappers remain available if you need direct access to the scripts:

#### macOS/Linux
```bash
./scripts/start_local_stack.sh
# or from repo root:
./start.sh
```

#### Windows PowerShell
```powershell
pwsh scripts/start_local_stack.ps1
# or from repo root:
pwsh ./start.ps1
```


These scripts launch the GraphQL service, Python agent, and frontend concurrently. By default Forgekeeper routes LLM calls through a local OpenAI‑compatible gateway and will offer to start the GPU inference stack if not running. Press <kbd>Ctrl+C</kbd> to stop all processes. The same behavior is available via `make dev`.

Startup flags:
- PowerShell: `pwsh ./start.ps1 [-Verbose] [-RequireVLLM] [-VLLMWaitSeconds 120] [-RequireBackend] [-BackendWaitSeconds 60] [-Detach] [-LogDir <dir>]`
- Bash: `./start.sh [--debug] [--require-vllm] [--vllm-wait-seconds 120] [--require-backend] [--backend-wait-seconds 60]`

Behavior: without strict flags, the scripts wait briefly (~10s) for vLLM and backend before continuing; with `-RequireVLLM`/`--require-vllm` and `-RequireBackend`/`--require-backend`, they block until services are healthy or time out.

For a timeline of recent environment and DX changes, see `docs/dev/DEVLOG.md`.

The backend provides an outbox-backed publish path with exponential backoff and simple lag/ retry metrics on `/health`. The worker entrypoint (`npm run worker --prefix backend`) polls unsent messages and publishes them to the configured MQTT broker.

### CLI-Only Mode

Run just the Python agent and skip launching the backend/frontend. This is ideal for headless self‑repair loops.

- Bash: `./scripts/start_local_stack.sh --cli-only`
- PowerShell: `pwsh ./start.ps1 -CliOnly`

First‑run prompts: if no flags are provided and no saved preferences exist, the start scripts interactively ask whether to use CLI‑only mode, require vLLM/backend health, and use the inference gateway. You may opt to save answers to `.forgekeeper/start_prefs.env` (Bash) or `.forgekeeper/start_prefs.json` (PowerShell). Omit flags to be prompted each time; pass flags or set env to override.

To force CLI‑only from environment: `CLI_ONLY=true ./start.sh`

Reset saved preferences:

- Bash: `./scripts/start_local_stack.sh --reset-prefs`
- PowerShell: `pwsh ./start.ps1 -ResetPrefs`

### Transformers Fallback (No vLLM)

Use a local Hugging Face model via Transformers without the vLLM servers:

```bash
LLM_BACKEND=transformers USE_TINY_MODEL=true FK_DEVICE=cpu python -m forgekeeper [--conversation]
```

Or point to a specific model:

```bash
# New: Python CLI entrypoint

You can now install the Python package in editable mode and use the `forgekeeper` command with subcommands (current orchestrator).

Quick start:

```bash
pip install -e .   # run from the repo root (forgekeeper/)
forgekeeper --help
forgekeeper demo                # run duet demo (LLM mocks + UI)
forgekeeper run                 # run orchestrator loop
forgekeeper server              # run UI server only
forgekeeper check --install-yes # check/install missing Python deps
```

Module form still works if you prefer:

```bash
python -m forgekeeper --help
python -m forgekeeper [--conversation] run
```

Notes:
- The CLI uses the orchestrator. Use `run` to start the loop, or `demo` for a short demo with mocked LLMs.
- For tiny CPU-only mode, you can also use `pwsh ./start.ps1 -CliOnly -Tiny` or set `LLM_BACKEND=transformers USE_TINY_MODEL=true FK_DEVICE=cpu` before running.
```
LLM_BACKEND=transformers \
FK_MODEL_PATH=/path/to/model \
FK_DTYPE=bf16 \
FK_DEVICE=cuda \
python -m forgekeeper [--conversation]
```

### TinyLLM Quickstart (CPU‑only)

Start Forgekeeper with a tiny local Transformers model and no GPU. This is the fastest way to try the experience without the full inference stack.

```bash
# CLI‑only + tiny model preset
CLI_ONLY=true \
LLM_BACKEND=transformers \
USE_TINY_MODEL=true \
FK_DEVICE=cpu \
python -m forgekeeper [--conversation]
```

PowerShell:

```powershell
$env:CLI_ONLY = 'true'
$env:LLM_BACKEND = 'transformers'
$env:USE_TINY_MODEL = 'true'
$env:FK_DEVICE = 'cpu'
python -m forgekeeper [--conversation]
```

Startup wrappers may add a convenience flag in a future update:

- Bash: `./start.sh --cli-only --tiny`
- PowerShell: `pwsh ./start.ps1 -CliOnly -Tiny`

### Slash Commands (Configuration in Prompt)

You can reconfigure Forgekeeper directly from the chat input using `/command` entries. Changes apply immediately when possible, or prompt you to `/restart` to apply.

Common commands (planned):

- `/model <name>`: set the active model (e.g., `mistral`, `tiny`)
- `/temperature <0..2>`: adjust sampling temperature
- `/top_p <0..1>`: adjust nucleus sampling
- `/backend <openai|transformers>`: switch inference backend
- `/gateway <url>`: set OpenAI‑compatible gateway URL
- `/project <id|new>`: switch or create project context
- `/context on|off` or `/context <limit>`: toggle/show context counter
- `/restart`: safely restart local components to apply changes
- `/reset`: revert to defaults
- `/help`: show the command palette and current settings

The CLI and the web UI reserve a small help area where the description and current value of a highlighted `/command` appears while typing.

### Multiline Prompts

- Web UI: press Ctrl+Enter to insert a newline; Enter sends the message.
- CLI: press Ctrl+Enter to insert a newline in the input. Enter submits.

### CLI Chat (TUI)

Launch a simple terminal chat with slash-command support and a live context counter:

```bash
python -m forgekeeper [--conversation] commands chat [session-id]
```

Keybindings:
- Enter: send message
- Ctrl+J: insert newline (some terminals cannot distinguish Ctrl+Enter)
- Type `/help` for available commands. Settings persist to `.forgekeeper/runtime_config.json`.

### Compose Profiles

Selective service startup using Docker Compose profiles:

- Backend only: `make -C forgekeeper up-backend`
- Frontend only: `make -C forgekeeper up-ui`
- Inference only: `make -C forgekeeper up-inference`
- Python agent only: `make -C forgekeeper up-agent`
- Backend outbox worker: `make -C forgekeeper up-worker`
- Stop all: `make -C forgekeeper down`

### Packaging (FK-353)

Build local packages for distribution:

- Core agent:
  - `make -C forgekeeper build-core`
  - Project root: `forgekeeper/packages/forgekeeper-core`
  - Entrypoint: `forgekeeper`
- Inference client:
  - `make -C forgekeeper build-infer`
  - Project root: `forgekeeper/packages/forgekeeper-inference-client`
  - Imports: `from forgekeeper.inference_backends import OpenAICompatClient`

The Transformers backend respects `FK_*_MAX_TOKENS` caps and is suitable for smoke tests and CLI‑only runs.

### Inference Gateway (Default)

Forgekeeper routes LLM traffic via a lightweight OpenAI‑compatible gateway by default.

- Bring up the GPU‑backed inference stack (Docker + NVIDIA runtime required):

```bash
make -C forgekeeper inference-up
```

- Health check and quick load test:

```bash
make -C forgekeeper sanity
make -C forgekeeper load-test
```

- On startup, if models are not set, you will be prompted to select:
  - Core: oss-gpt-20b (default)
  - Coder: WizardCoder-15B (optional). Answer `n` to reuse the core model; the script will confirm the fallback in the console.

- To disable the gateway for a run (or rely on the direct vLLM defaults in `.env`):

```bash
FGK_USE_INFERENCE=0 ./scripts/start_local_stack.sh
```

See `DOCS_INFERENCE.md` for details, configuration, and service layout.

### Start the GraphQL service
```bash
npm run dev --prefix backend
```

### Start the backend
```bash
python -m forgekeeper [--conversation]
```

### Start the frontend
```bash
npm run dev --prefix frontend
```

Vite dev server proxies `/graphql` to the backend at `http://localhost:4000` during development, so the app works at `http://localhost:5173/` without extra config.

### Persistent CLI [Legacy v1]

Forgekeeper includes a small console that interacts solely through the GraphQL API, allowing the running backend and LLM services to generate replies. Start the GraphQL service and backend first, then launch the CLI:

```bash
# Legacy v1 console (kept for reference)
python -m forgekeeper [--conversation] persistent-console
```

For a transient console without history use:

```bash
python -m forgekeeper [--conversation] console
```

The current conversation ID is saved in `.forgekeeper/cli_state.json` so sessions resume automatically. See `forgekeeper/cli.py` for implementation details.

### Interactive console [Legacy v1]

For a simple console that persists chats via GraphQL, run:

```bash
# Legacy v1 console (kept for reference)
python -m forgekeeper [--conversation] console
```

### Dual LLM agent CLI [Legacy v1]

An experimental console that routes prompts through the Core and Coder models directly is available under `scripts/dual_llm_agent.py`:

```bash
python scripts/dual_llm_agent.py
```

End multi-line prompts with `<<END>>`. Type `summarize` to view memory, `nexttask` to execute the next task, or `exit` to quit.

## Memory-based retrieval

Forgekeeper stores episodic task summaries and embeds them for quick
similarity search. When ranking tasks, the queue recalls related past
attempts so that frequently failing tasks are deprioritized while successful
patterns rise to the top. Summaries are vectorized using a lightweight
SentenceTransformer model when available and fall back to a simple TF–IDF
vectorizer otherwise. The resulting vectors are stored in
`.forgekeeper/episodic_vectors.sqlite` and compared via cosine similarity to
adjust task scores.

### Embedding-driven planning

When new goals are created, Forgekeeper queries this embedding store for
semantically similar past tasks using the helpers in
`memory/embeddings.py`. The retrieved summaries are attached to the goal and
surfaced through `forgekeeper.tasks.queue.TaskQueue`, where they adjust each task's priority so
that memories of failures or successes influence scheduling and provide
additional context during execution.

### Tiny model for fast CPU-only tests

Forgekeeper bundles a small GPT‑2 model for lightweight development. It
requires no GPU and is useful for verifying the stack or running tests quickly.
Enable it by setting `USE_TINY_MODEL=true`, which forces the bundled model even
if `FK_MODEL_PATH` or `FK_LLM_IMPL` are configured, switches to the
`transformers` backend, and lets the default model download automatically:

```bash
export USE_TINY_MODEL=true
export FK_DEVICE=cpu
export FK_DTYPE=float32
python -m forgekeeper [--conversation]
```

The tiny model is **not** instruction tuned and has a very limited context
window, so responses will differ from full-size models. Use it only for
development or smoke tests. Unset `USE_TINY_MODEL` (or set it to `false`) to
switch back to larger models via `vllm` or a custom `FK_MODEL_PATH`.

## vLLM (single server) configuration

Use one local vLLM server for both "core" and "coder" agents:

1) Set `.env`:
- `VLLM_MODEL_CORE=./models/<your-model>` (e.g., `./models/gpt-oss-20b`)
- `VLLM_MODEL_CODER=./models/<your-model>` or leave unset
- `FK_CORE_API_BASE=http://localhost:8001`
- `FK_CODER_API_BASE=http://localhost:8001`

2) Start the stack via `./start.sh` or `pwsh ./start.ps1` (optionally require vLLM with `--require-vllm`/`-RequireVLLM`). If vLLM is not installed in Python, the start scripts will attempt to launch a Dockerized vLLM server using the `vllm/vllm-openai:latest` image (requires Docker Desktop with GPU support).

3) Health check: `http://localhost:8001/healthz` should return 200. The scripts will try to launch a local Python vLLM server (`scripts/run_vllm_core.(sh|bat)`) or a Dockerized server (`scripts/start_vllm_core_docker.(ps1|sh)`) automatically if needed.

### GPT-OSS-20B Model Setup

Download the open-source model from Hugging Face:

```bash
huggingface-cli download openai/gpt-oss-20b --local-dir /path/to/model
```

Configure Forgekeeper to use the model via `transformers`:

```bash
export FK_LLM_IMPL=transformers
export FK_MODEL_PATH=/path/to/model
export FK_DTYPE=bf16
export FK_DEVICE=cuda
```

Optionally, point to a running `vllm` server (single endpoint):

```bash
export FK_LLM_IMPL=vllm
# For a single vLLM endpoint, set both bases (or use FK_API_BASE for backward-compat):
export FK_CORE_API_BASE=http://localhost:8000/v1
export FK_CODER_API_BASE=http://localhost:8000/v1
# Backward-compat (deprecated): export FK_API_BASE=http://localhost:8000/v1
```

### vLLM Backend

Forgekeeper now defaults to **vLLM** for both the reasoning **Core** agent and
the code‑oriented **Coder** agent. Ensure `LLM_BACKEND=vllm` is set in your
environment (it's included in `.env.example`).

1. Run the Docker setup script to gather model IDs, ports, and other settings, writing `.env` automatically:

   ```bash
   ./scripts/setup_docker_env.sh
   ```

   PowerShell:

   ```powershell
   pwsh scripts/setup_docker_env.ps1
   ```

   It prompts for values such as `VLLM_MODEL_CORE`, `VLLM_MODEL_CODER`, `VLLM_PORT_CORE`, and `VLLM_PORT_CODER`.

2. Define API bases so the Python agent can route traffic:

   - `FK_CORE_API_BASE` / `FK_CODER_API_BASE`

Optional tuning flags include `VLLM_MAX_MODEL_LEN`, `VLLM_TP` and
`VLLM_GPU_MEMORY_UTILIZATION`.

#### Bare‑metal servers

Install [vLLM](https://github.com/vllm-project/vllm) locally and launch the
servers:

```bash
./scripts/run_vllm_core.sh      # start Core model
./scripts/run_vllm_coder.sh     # start Coder model
```

Windows users can run the corresponding `.bat` scripts.

#### Docker

`docker-compose.yml` includes `vllm-core` and `vllm-coder` services. Run
`scripts/setup_docker_env.sh` (or `.ps1`) to gather values, write `.env`, and
build the images. To start the servers later:

```bash
docker compose up -d vllm-core vllm-coder
```

Other Forgekeeper services can then be launched via `docker compose up`. The
`backend` service now uses a multi-stage Docker build (context `./backend`)
that runs `npm ci && npm run build`; `docker compose up backend` automatically
rebuilds the image when backend sources change. Set `BACKEND_PORT` in your
`.env` to pick the exposed port—Compose forwards that port and also injects
`PORT` for the Node runtime so the container binds correctly.

#### Routing Core vs Coder

`forgekeeper.llm.llm_service_vllm` reads `FK_CORE_API_BASE` and
`FK_CODER_API_BASE` to send requests to the appropriate server. If the coder
model or base URL is missing, requests automatically fall back to the core
model.

When running a single vLLM endpoint for both models, set both variables to the
same base URL (or use `FK_API_BASE` for backward compatibility).

#### Verification

Verify the backend with the smoke-test CLI:

```bash
python tools/smoke_backend.py
```

### Triton Backend

Use the experimental `triton` implementation to run GPT‑OSS‑20B with a
lightweight Triton runtime.

1. Install dependencies and download the model:
   ```bash
   pip install tritonllm tritonclient[http] huggingface_hub
   huggingface-cli download openai/gpt-oss-20b --local-dir /path/to/gpt-oss-20b
   ```
2. Launch the Triton responses API server (single‑GPU example):
   ```bash
   torchrun --nproc-per-node=1 -m tritonllm.gpt_oss.responses_api.serve \\
     --checkpoint /path/to/gpt-oss-20b --port 8000
   ```
3. Configure Forgekeeper to use the Triton backend:
   ```bash
   export FK_LLM_IMPL=triton
   export TRITON_MODEL=/path/to/gpt-oss-20b
   export TRITON_CHECKPOINT=/path/to/gpt-oss-20b
   # Optional overrides
   export TRITON_URL=http://localhost:8000
   export TRITON_DEVICE=cuda:0
   export TRITON_CONTEXT_LENGTH=2048
   export TRITON_INPUT_NAME=INPUT_0
   export TRITON_OUTPUT_NAME=OUTPUT_0
   ```

See [docs/inference_triton.md](docs/inference_triton.md) for GPU
requirements, troubleshooting tips, and multi‑GPU examples.

### llama.cpp Backend

Run Forgekeeper on systems without vLLM by using the [llama.cpp](https://github.com/ggerganov/llama.cpp) bindings.

1. Install dependencies:

   ```bash
   pip install llama-cpp-python
   ```

2. Configure the environment:

   ```bash
   export LLM_BACKEND=llama_cpp
   export FK_MODEL_PATH=/path/to/ggml-model.gguf
   export FK_THREADS=4        # tune for your CPU
   export FK_GPU_LAYERS=0     # >0 to offload layers to GPU
   ```

3. Launch the simple HTTP server:

   ```bash
   python forgekeeper/main_llamacpp.py
   ```

   The endpoint will be available at `http://localhost:5000/api/llm`.

### LLM smoke test

Generate a short response using the configured LLM:

```bash
python scripts/llm_smoke_test.py
```

Override the backend for a single run with `--backend`:

```bash
python scripts/llm_smoke_test.py --backend vllm
```

## Testing
Run the Python test suite with:
```bash
pytest
```

Commit checks and sandbox:
- Commit checks automatically scope by file type. Python changes run `ruff`, `mypy`, `pytest`; TypeScript changes run backend/frontend builds. In CLI‑only mode or when Node is missing, TS checks are skipped unless `.ts/.tsx` files are staged.
- Sandbox checks apply staged diffs in a temporary Git worktree and run the selected commands there before committing. This helps prevent partial or environment‑dependent failures leaking into your main worktree.

## Development Tooling
Contributors should have the following tools installed and available in `PATH`:

- `ruff` (flake8-compatible linter)
- `mypy`
- `pytest`
- `node` and `npm` for TypeScript checks and builds

These are the commands run as part of the automated commit checks (`CHECKS_PY` and `CHECKS_TS`).

## Episodic Memory

`forgekeeper/memory/episodic.py` records short reflections about each task
attempt in `.forgekeeper/memory/episodic.jsonl`. Entries are appended via
`append_entry`, which stores the task ID, outcome, changed files, a free-form
summary, sentiment, emotion, and any artifact paths for later review. The CLI
helper `python -m forgekeeper.memory.episodic --browse N` pretty-prints the last
`N` reflections (use `--review` for raw JSON) so developers can audit recent
activity. `TaskQueue` loads these entries and derives a *memory weight* where
failures push tasks back and successes bring them forward in priority.

## Agent Packages

Forgekeeper exposes two agent-oriented subpackages:

- `forgekeeper.agent` – the foundational :class:`ForgeAgent` implementation and
  shared utilities like communication helpers and tool execution.
- `forgekeeper.agents` – higher-level wrappers such as `ask_core`/`ask_coder`
  that power the legacy multi-agent planner.

Use the former for building new agent behaviors and the latter for compatibility
with the existing planning pipeline.

## Multi-agent Planning
Forgekeeper uses a lightweight planner to split complex user requests
into ordered subtasks. Each subtask is tagged for either the **Core** or
**Coder** agent based on whether it requires reasoning or code
generation.

1. The planner analyzes the request and identifies code- vs reasoning-focused steps.
2. Each step is delegated to the agent best suited for the work.
3. After executing a step, an agent appends a short note to a shared context log.
4. Subsequent steps read this log so later subtasks can build on earlier outputs.

This coordination enables complex tasks to be solved through a series of
focused agent interactions.

## `tasks.md` format and `TaskQueue` usage

Forgekeeper tracks work items in `tasks.md`, which contains checkbox lists under
"Active", "Backlog", and "Completed" sections. The "Canonical Tasks" section
uses YAML front‑matter blocks to capture structured metadata such as `id`,
`title`, `status`, `labels`, and priority markers like `(P0)`–`(P3)`:

```markdown
---
id: FK-123
title: Example task (P1)
status: todo
labels: [demo]
---
Detailed description...
```

`forgekeeper.tasks.queue.TaskQueue` parses this file and returns the next task
based on priority. Manage tasks via the command helpers:

```bash
python -m forgekeeper.commands list   # show all tasks
python -m forgekeeper.commands pick   # print next task
python -m forgekeeper.commands defer 0  # move task 0 to backlog
python -m forgekeeper.commands done 0   # mark task 0 completed
```

For a fully automated workflow, `TaskPipeline.run_next_task` pulls the highest
priority item, runs analysis and code edits, stages multiple files, and commits
the result end-to-end without manual intervention. The high-level goal manager
can automatically split complex tasks into subtasks for this pipeline.
The underlying goal storage and utilities now live in the standalone `goal_manager` package (`import goal_manager`) for easy reuse across modules.
If a generated change needs to be rolled back, `TaskPipeline.undo_last_task` reverts
the most recent commit and logs the undo to episodic memory.

## Self-review & commit-check workflow

`git_committer.py` provides `commit_and_push_changes`, which runs language-
specific checks defined in `CHECKS_PY` and `CHECKS_TS` on staged files, storing
results under `logs/<task_id>/commit-checks.json`. After committing, run
`self_review/checks.py`'s `review_change_set(task_id)` to apply pytest hooks and LLM
reasoning on the latest commit, verify the commit message references the active
task, and save a summary to `logs/<task_id>/self-review.json`.

Before committing, `diff_validator.validate_staged_diffs()` scans staged Python
files for definitions removed from one file but still referenced in another,
catching cross-file inconsistencies early.

The push step is controlled by the `AUTO_PUSH` environment variable. When set to
`true`, `commit_and_push_changes` uses `commit_ops.push_branch` to push commits
automatically and records the changelog path and rationale in episodic memory.

To review recent automated pushes, run:

```bash
python -m forgekeeper.memory.episodic --pushes 5
```

This prints the last five push entries from episodic memory along with the
rationales recorded at commit time.

## Transactional Outbox

`forgekeeper/outbox.py` implements a lightweight transactional outbox. The
`pending_action` context manager writes each tool call to disk before
execution; if a run crashes, the JSON record remains so
`replay_pending()` can replay unfinished actions on the next startup and ensure
side effects are applied exactly once.

`forgekeeper/outbox_worker.py` runs in a background daemon thread at startup
to execute pending actions. Its poll frequency and retry backoff are
configurable via the `OUTBOX_POLL_INTERVAL`, `OUTBOX_BASE_DELAY`, and
`OUTBOX_MAX_DELAY` environment variables.

## MQTT Listener (Experimental)

Forgekeeper includes a minimal MQTT listener that can receive task
instructions and publish acknowledgements.

1. Install the MQTT client dependency:
   ```bash
   pip install paho-mqtt
   ```
2. Start an MQTT broker (example using Docker):
   ```bash
   docker run -p 1883:1883 eclipse-mosquitto
   ```
3. Run the listener:
   ```bash
   python scripts/mqtt_forgekeeper_listener.py
   ```

The script subscribes to `forgekeeper/task` and publishes status updates to
`forgekeeper/status`.

## Automated sprint planning and roadmap updates

On startup the backend writes the next sprint plan to `SprintPlan.md` using
`sprint_planner.update_sprint_plan`. To keep the roadmap fresh automatically,
set `ROADMAP_COMMIT_INTERVAL` (seconds) and optionally `ROADMAP_AUTO_PUSH=true`.
The backend spawns a background thread via
`roadmap_committer.start_periodic_commits` that regenerates the sprint plan and
commits updates to both `Roadmap.md` and `SprintPlan.md` at the configured
interval.

Periodic commit behavior is controlled via two environment variables:

- `ROADMAP_COMMIT_INTERVAL` – seconds between automatic commits (set to `0` to disable, default `3600`).
- `ROADMAP_AUTO_PUSH` – when `true`, pushes the commit to the remote after creation.

Each autonomous roadmap commit logs its rationale to `.forgekeeper/memory/episodic.jsonl` for later review.

---
This guide is intended to streamline installation and clarify component interactions.

## Contributor Flow (Docs and Planning)

- Installer-driven bring-up: `./scripts/install.sh --defaults` or `pwsh scripts/install.ps1 -Defaults`.
- Roadmap/Sprint auto-updates: set environment and run the backend.
  - `ROADMAP_COMMIT_INTERVAL=3600` (seconds; set `0` to disable)
  - `ROADMAP_AUTO_PUSH=true` (optional, pushes commits after creation)
- Manually update planning docs:
  - Regenerate sprint plan: `python -m forgekeeper.sprint_planner`
  - Browse recent memories: `python -m forgekeeper.memory.episodic --browse 10`
- Open a development console:
  - Persistent CLI (GraphQL-backed): `python -m forgekeeper pconsole`
  - Simple console: `python -m forgekeeper console`

## Orchestrator Tests

When running the orchestrator tests, ensure the local sources are used rather than an older installed copy:

- Option 1 (recommended): change into the orchestrator package directory and run pytest:
  
  ```bash
  cd forgekeeper-v2
  pytest -q
  ```

- Option 2: run tests from the repo root (the orchestrator package is included in the mono-repo build):
  
  ```bash
  pip install -e .
  pytest -q forgekeeper-v2/tests
  ```

This avoids import-path confusion when a prior version is present in a virtual environment.

## Agentic Memory

Forgekeeper's agentic memory plane coordinates pluggable agents that annotate, patch, and augment text. The MemoryOrchestrator ranks suggestions, merges non-overlapping patches, and can run in interactive or deepthink modes. Interactive mode presents edits for approval, while deepthink chains agents for a more thorough pass. See [docs/agentic_memory.md](docs/agentic_memory.md) for details.

## Agentic Memory Plane — Quick Start

Run memory agents on text:

```bash
echo "This is teh best." | fk-memory run
```

List available agents:

```bash
fk-memory list
```

Dump a built-in agent to YAML:

```bash
fk-memory dump mem.reflex.teh-typo
```

Example output snippet:

```yaml
id: mem.reflex.teh-typo
kind: reflex
system_prompt: |-
  Replace the common typo 'teh' with 'the' while avoiding identifiers and URLs.
```
