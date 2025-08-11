# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a React frontend, a Node/TypeScript GraphQL service backed by MongoDB via Prisma, and a Python core agent.
This repository includes all components required to run the local development environment.

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
3. Copy the sample environment file and adjust values as needed:
   ```bash
    cp .env.example .env
    ```

4. Optional: configure local Harmony model parameters via environment variables:
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

---
This guide is intended to streamline installation and clarify component interactions.
