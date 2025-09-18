# v2 Stabilization – Implementation Plan (Planning Draft)

This plan is derived from `codex.json` and `codex.plan`, adapted to the current Forgekeeper repository structure. It is documentation-only; no code changes are made in this phase.

## Branch Strategy
- Working branch: `v2-stabilization` (create from default branch when we begin execution).
- Keep PRs granular per phase/task with clear acceptance checks.

## Phase Summary and Acceptance
- Phase 0 – Repo sanity & kill switches
  - Goals: Pin Python/Node deps; add env flags; add `scripts/doctor.sh`.
  - Accept: `requirements.txt`, lockfile updated; `doctor.sh` exists; `.env.example` contains FGK_* flags.
- Phase 1 – Inference Path A (Triton)
  - Goals: Minimal Triton model repo + compose; `scripts/infer_cli.py` against HTTP/gRPC.
  - Accept: Triton healthcheck OK; CLI returns “hello” for smoke.
- Phase 1b – Fallback Path B (llama.cpp)
  - Goals: `scripts/llamacpp_infer_cli.py` with same interface as Triton CLI.
  - Accept: CLI returns “hello” for smoke.
- Phase 2 – Shared State & Memory
  - Goals: ContextLog (SQLite/Mongo) append/query; Memory adapter (kv) with interface.
  - Accept: Unit tests pass for ContextLog; `services/memory/kv.py` present.
- Phase 3 – Queue & GraphQL callback
  - Goals: Ensure outbox → agent → `appendMessage` path with retries/idempotency.
  - Accept: Smoke script prints success token.
- Phase 4 – UI wiring & UX gaps
  - Goals: New Conversation button; Status Bar; lightweight polling.
  - Accept: Components exist; app shows elements; basic polling works.
- Phase 5 – Acts protocol + ToolShell
  - Goals: THINK/PLAN/EXEC/OBSERVE/REPORT/REQUEST-APPROVAL; sandboxed ToolShell; allowlist.
  - Accept: Orchestrator integrates acts; EXEC path gated and recorded.
- Phase 6 – Self-improvement loop
  - Goals: `tasks.yaml` drives Planner/Implementer/Reviewer in dry-run; PR flow gating.
  - Accept: Dry-run prints success token; merge rules present.
- Phase 7 – Observability & guardrails
  - Goals: JSONL structured logs; tail script; UI LogPanel tab.
  - Accept: Logs file produced; tail script outputs success token; UI patch applied.
- Phase 8 – Docs
  - Goals: Inference decision tree; acts doc; first-run and troubleshooting runbooks.
  - Accept: Docs files exist and render.

## Execution Order (Fast Feedback)
1 → 3 → 4 → 5 → 2 → 6–8 (per codex.plan quick wins), with Phase 0 up front.

## Environment Flags (to add in Phase 0)
- `FGK_INFERENCE_BACKEND=(triton|llamacpp|transformers)`
- `FGK_USE_GATEWAY=(0|1)`
- `FGK_MEMORY_BACKEND=(kv|vector)`

## Validation Commands (for later; do not run now)
- `bash forgekeeper/scripts/doctor.sh`
- `docker compose -f infra/triton/docker-compose.yml up -d`
- `python forgekeeper/scripts/infer_cli.py --prompt "Say hello."`
- `pytest -q` (run from `forgekeeper/`)

## Notes & Non-Goals (v2)
- Prefer minimal, inspectable CLIs and simple adapters over full-featured frameworks.
- Keep GPU/IaaC specifics in `infra/`; avoid coupling agent logic to deployment.
- Postpone streaming UI until basic polling is stable.

Refer to FILE_PATH_MAPPING for the exact path alignment between plan artifacts and this repo.

