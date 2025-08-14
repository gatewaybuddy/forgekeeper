# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
This repository includes all components required to run the local development environment.

## Docker environment

Set up and launch all Forgekeeper services with Docker using:

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

Configure vLLM-specific behaviour with environment variables:

- `LLM_BACKEND` (default `vllm`) – selects the backend implementation.
- `VLLM_MODEL_CORE` – model identifier for the Core agent.
- `VLLM_MODEL_CODER` – model identifier for the Coder agent.
- `VLLM_HOST_CORE`/`VLLM_PORT_CORE` – host and port of the Core vLLM server.
- `VLLM_HOST_CODER`/`VLLM_PORT_CODER` – host and port of the Coder vLLM server.
- `VLLM_MAX_MODEL_LEN` – maximum context length expected by vLLM.
- `VLLM_TP` – tensor parallelism degree.
- `VLLM_GPU_MEMORY_UTILIZATION` – fraction of GPU memory allocated to vLLM.
- `VLLM_ENABLE_LOGPROBS` – set to `true` to include log probabilities in responses.

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
summary, and any artifact paths for later review. The CLI helper
`python -m forgekeeper.memory.episodic --review N` prints the last `N`
reflections so developers can audit recent activity. `TaskQueue` loads these
entries and derives a *memory weight* where failures push tasks back and
successes bring them forward in priority.

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
can automatically split complex tasks into subtasks for this pipeline.

## Self-review & commit-check workflow

`git_committer.py` provides `commit_and_push_changes`, which runs language-
specific checks defined in `CHECKS_PY` and `CHECKS_TS` on staged files, storing
results under `logs/<task_id>/commit-checks.json`. After committing, run
`self_review.py`'s `review_change_set(task_id)` to apply pytest hooks and LLM
reasoning on the latest commit, verify the commit message references the active
task, and save a summary to `logs/<task_id>/self-review.json`.

## Optional `roadmap_updater` workflow

The optional `roadmap_updater.py` module appends a markdown section to
`Roadmap.md` summarizing recent commits and memory entries. To keep the roadmap
fresh automatically, call
`forgekeeper.roadmap_updater.start_periodic_updates(interval_seconds)` to run
updates in a background thread.

---
This guide is intended to streamline installation and clarify component interactions.
