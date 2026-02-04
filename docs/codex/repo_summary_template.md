# REPO_SUMMARY (Template)

Authored by: Codex
Date: 2025-11-03

> Replace placeholders and remove guidance when producing a concrete summary.

## Structure
- Monorepo layout (paths and roles): <brief list>
- Key modules/folders: <core dirs and purpose>

## Build & Run
- Quick start commands:
  - `cp .env.example .env` (adjust as needed)
  - `make dev-ui` / `npm --prefix frontend run dev`
  - `python -m forgekeeper ensure-stack --build --include-mongo`
- Notable scripts: `scripts/ensure_stack.sh`, `scripts/test_harmony_basic.py`

## Tests
- Python: `pytest -q` (see `tests/`)
- Frontend: `npm --prefix frontend run test`
- Autonomous: `python -m forgekeeper verify --suite auto` (if configured)

## Linting / Typecheck
- ESLint: `make lint`
- TypeScript: `make typecheck`

## Env / Secrets
- Copy `.env.example` to `.env`; do not commit secrets.
- Core selection via `FK_CORE_KIND` (llama|vllm); proxy base via `FRONTEND_VLLM_API_BASE`.

## Notable Scripts / Tools
- `scripts/ensure_stack.sh` — bring up docker stack
- `scripts/mock_openai_server.mjs` — mock OpenAI API for smoke tests
- `scripts/test_harmony_basic.py` — health + chat probe

## Observability & Policies
- ContextLog JSONL under `.forgekeeper/context_log/`; see `docs/observability.md`.
- Reasoning modes/flags in README; see `docs/adr-0002..0004`.

---
Prepared by Codex

