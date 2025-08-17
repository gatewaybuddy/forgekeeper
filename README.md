# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
This repository includes all components required to run the local development environment.

## PowerShell 7

Several setup scripts use the `pwsh` command, which is part of PowerShell 7.
If `pwsh` is not available on your system, download and install PowerShell 7
from the [official website](https://aka.ms/powershell) and ensure it is on
your `PATH` before running the PowerShell examples.

## Environment file

Interactively create or update the `.env` configuration used by the run scripts:

```bash
./scripts/setup_env.sh
```

From PowerShell:

```powershell
pwsh scripts/setup_env.ps1
```

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

Run the helper script to install Python and Node dependencies for local development:

```bash
./scripts/setup_dev_env.sh
```

From PowerShell:

```powershell
pwsh scripts/setup_dev_env.ps1
```

Alternatively, follow the manual steps below.

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
surfaced through `task_queue.py`, where they adjust each task's priority so
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

## Optional `roadmap_updater` workflow

The optional `roadmap_updater.py` module appends a markdown section to
`Roadmap.md` summarizing recent commits and memory entries. To keep the roadmap
fresh automatically, call
`forgekeeper.roadmap_updater.start_periodic_updates(interval_seconds)` to run
updates in a background thread. When running in fully autonomous mode,
`roadmap_committer.py` extends this workflow by committing those updates
without manual prompts via
`forgekeeper.roadmap_committer.start_periodic_commits(interval_seconds)`.

---
This guide is intended to streamline installation and clarify component interactions.
