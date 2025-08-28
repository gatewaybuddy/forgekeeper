# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
All conversation data flows through this GraphQL API, replacing earlier file-based helpers.
This repository includes all components required to run the local development environment.

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

Use `--help`/`-h` to display usage or pass `--defaults` (alias `--yes`) to
apply all defaults without interactive prompts.

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
2. Configure the MongoDB connection string:
   ```bash
   export DATABASE_URL="mongodb://localhost:27017/forgekeeper"
   ```
3. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```

### Frontend (React)
1. Install Node dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Running

If you chose to launch services during installation or ran `scripts/setup_dev_env.sh --launch-services`, the GraphQL service, Python agent, and frontend will already be running. Use the commands below to start them manually if needed.

### Start the GraphQL service
```bash
npm run dev --prefix backend
```

### Start the backend
```bash
python -m forgekeeper
```

### Start the frontend
```bash
npm run dev --prefix frontend
```

### Persistent CLI

Forgekeeper includes a small console that interacts solely through the GraphQL API, allowing the running backend and LLM services to generate replies. Start the GraphQL service and backend first, then launch the CLI:

```bash
python -m forgekeeper pconsole
```

The current conversation ID is saved in `.forgekeeper/cli_state.json` so sessions resume automatically. See [persistent_console](persistent_console) for implementation details.

### Interactive console

For a simple console that persists chats via GraphQL, run:

```bash
python -m forgekeeper console
```

### Dual LLM agent CLI

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

Optionally, point to a running `vllm` server:

```bash
export FK_LLM_IMPL=vllm
export FK_API_BASE=http://localhost:8000/v1
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

Other Forgekeeper services can then be launched via `docker compose up`.

#### Routing Core vs Coder

`forgekeeper.llm.llm_service_vllm` reads `FK_CORE_API_BASE` and
`FK_CODER_API_BASE` to send requests to the appropriate server. If the coder
model or base URL is missing, requests automatically fall back to the core
model.

#### Verification

Verify the backend with the smoke-test CLI:

```bash
python tools/smoke_backend.py
```

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
