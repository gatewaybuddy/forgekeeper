# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
This repository includes all components required to run the local development environment.

## Docker environment

Copy `.env.example` to `.env` in the repository root and then run the setup script:

```bash
cp .env.example .env
./scripts/setup_docker_env.sh
```

Run from PowerShell:

```powershell
Copy-Item .env.example .env
pwsh scripts/setup_docker_env.ps1
```

## Installation

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

### Start the GraphQL service
```bash
npm run dev --prefix backend
```

### Start the backend
```bash
python -m forgekeeper.main
```

### Start the frontend
```bash
npm run dev --prefix frontend
```

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

1. Copy the sample environment and edit as needed:

   ```bash
   cp .env.example .env
   ```

2. Provide Hugging Face model IDs and ports:

   - `VLLM_MODEL_CORE` / `VLLM_MODEL_CODER`
   - `VLLM_PORT_CORE` / `VLLM_PORT_CODER`

3. Define API bases so the Python agent can route traffic:

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

`docker-compose.yml` includes `vllm-core` and `vllm-coder` services. After
copying `.env.example` to `.env` and optionally running
`./scripts/setup_docker_env.sh` to build images, start the servers with:

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
summary, sentiment, and any artifact paths for later review. The CLI helper
`python -m forgekeeper.memory.episodic --browse N` pretty-prints the last `N`
reflections (use `--review` for raw JSON) so developers can audit recent
activity. `TaskQueue` loads these entries and derives a *memory weight* where
failures push tasks back and successes bring them forward in priority.

## Multi-agent Planning

Complex user requests can be decomposed into smaller subtasks and
delegated to specialized agents. The planner assigns code-centric steps to
the **Coder** agent and reasoning-oriented steps to the **Core** agent. A
shared context log lets agents broadcast brief messages so each subtask
can build on previous outputs.

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

`forgekeeper.task_queue.TaskQueue` parses this file and returns the next task
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
can automatically split complex tasks into subtasks for this pipeline. If a
generated change needs to be rolled back, `TaskPipeline.undo_last_task` reverts
the most recent commit and logs the undo to episodic memory.

## Self-review & commit-check workflow

`git_committer.py` provides `commit_and_push_changes`, which runs language-
specific checks defined in `CHECKS_PY` and `CHECKS_TS` on staged files, storing
results under `logs/<task_id>/commit-checks.json`. After committing, run
`self_review.py`'s `review_change_set(task_id)` to apply pytest hooks and LLM
reasoning on the latest commit, verify the commit message references the active
task, and save a summary to `logs/<task_id>/self-review.json`.

Before committing, `diff_validator.validate_staged_diffs()` scans staged Python
files for definitions removed from one file but still referenced in another,
catching cross-file inconsistencies early.

## Transactional Outbox

`forgekeeper/outbox.py` implements a lightweight transactional outbox. The
`pending_action` context manager writes each tool call to disk before
execution; if a run crashes, the JSON record remains so
`replay_pending()` can replay unfinished actions on the next startup and ensure
side effects are applied exactly once.

## Optional `roadmap_updater` workflow

The optional `roadmap_updater.py` module appends a markdown section to
`Roadmap.md` summarizing recent commits and memory entries. To keep the roadmap
fresh automatically, call
`forgekeeper.roadmap_updater.start_periodic_updates(interval_seconds)` to run
updates in a background thread.

---
This guide is intended to streamline installation and clarify component interactions.
