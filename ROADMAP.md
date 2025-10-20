# Roadmap (Fresh Start)

Status Snapshot - 2025-10-20
- Tool-ready chat path available end-to-end: server orchestrator (`frontend/server.tools.mjs`, `frontend/server.orchestrator.mjs`), `/api/chat`, and the UI tool send path.
- vLLM Core bring-up scripts and health checks exist (`scripts/test_vllm_health.*`, `scripts/test_harmony_basic.*`).
- Python CLI wrappers online: `compose`, `up-core`, `chat`, `ensure-stack`.
- Frontend Node server serves static UI and proxies `/v1`, `/health`, `/healthz`.

Recent Enhancements (since 2025-10-19)
- Persisted tool filesystem writes to the mounted sandbox via `TOOLS_FS_ROOT` (compose default `/workspace/sandbox`).
- Enabled `run_bash` tool (gated) and updated system prompt guidance to call bash for shell workflows and verify results via `read_dir`/`read_file`.
- Added JSONL audit for tool calls and basic rate limiting on `/api/chat` and `/api/chat/stream`.
- Introduced SSE for the final turn behind the tool loop at `/api/chat/stream`.

Phase 1 — Tool-Ready Chat (Server Orchestration)
- Bring up vLLM Core only with the local model path mounted (`/models/gpt-oss-20b`).
- Health-check endpoints return OK: `/healthz` or `/health`.
- Add basic verification scripts:
  - `scripts/test_vllm_health.sh` — polls health.
  - `scripts/test_harmony_basic.py` — simple OpenAI-compatible chat request, verifies response.
- Portable server module for OpenAI-style tool calls (Node/ESM):
  - `frontend/server.tools.mjs` exposes allowlisted tool registry and runners (e.g., `get_time`, `echo`).
  - `frontend/server.orchestrator.mjs` loops on `tool_calls` → executes → appends `role:"tool"` → re-queries until final.
- `/api/chat` endpoint in the frontend Node server uses the orchestrator and routes tool-using prompts from the UI send path.
- Keep the module backend-agnostic so it can be moved to a dedicated backend later.

Reasoning vs Final Responses
- Terminology used by Forgekeeper scripts and UI:
  - reasoning: intermediate chain-of-thought text (not shown to end users by default)
  - final: displayable answer text
- Mapping for vLLM OpenAI-compatible responses (current build):
  - Non-streaming (chat/completions):
    - reasoning ← `choices[0].message.reasoning_content` (string or null)
    - final ← `choices[0].message.content` (string, array of text parts, or null)
  - Streaming (SSE):
    - reasoning deltas ← `choices[0].delta.reasoning_content`
    - final deltas ← `choices[0].delta.content`
- Scripts:
  - `scripts/test_harmony_basic.ps1` passes if either final or reasoning contains the probe phrase; prints `finish_reason`.
  - `scripts/chat_reasoning.ps1` streams reasoning deltas live, then prints `[reasoning]` (full) and `[final]` (full) when complete. Use `-NoStream` for a blocking call.
- App guidance:
  - Persist both fields as `assistant.reasoning` and `assistant.final`.
  - Render only `final` by default. Expose a toggle for reasoning when needed.
  - Treat `finish_reason=length` as a hint to increase `max_tokens` or to request a shorter answer.

## Working Agreements (Guardrails)
- Smallest-change-first. No opportunistic refactors. If a refactor exceeds 20 lines or crosses module boundaries, create a follow-up task.
- Timebox per task: 4 hours. If the timebox is exceeded, stop and report blockers with a concrete proposal.
- Tests default to smoke/unit only. Integration or end-to-end tests are explicitly called out in the task card.
- Touch only files listed in the task’s “Allowed Touches.” New dependencies require a separate, approved task.
- Feature-flag anything risky. New behavior off by default and switchable via env or config.
- Definition of Done must be met before merging: acceptance checks pass, scope/out-of-scope honored, and rollback noted.
- Every change must map to a Task Card (`forgekeeper/tasks.md`) with a unique `T#`. PRs must include `Task ID: T#` and will be checked in CI against that card’s Allowed Touches.

Phase 2 — Minimal Backend and Agent Wiring
- Stand up GraphQL backend + Python agent with only the endpoints needed for smoke tests.
- Route agent traffic to vLLM Core; confirm prompt/response loop works end-to-end.

Phase 3 — DevX and CI
- Add CI job for vLLM health and basic chat verification (gateway or local).
- Add PR templates and labels for the new track.

Phase 4 - Feature Bring-up (incremental)
- Reintroduce components from `archive/` as needed, behind clear flags.
- Maintain tests for every reintroduced unit.

## Reasoning UX & Orchestration (New Track)

Goals
- Provide predictable, debuggable reasoning flows for chat and code edits.
- Let users stop, refine, and relaunch with targeted guidance without losing context.
- Keep deterministic defaults for code/tooling; allow higher entropy for ideation where explicitly enabled.

Key Capabilities
- Reasoning modes: `off` | `brief` | `two_phase`.
  - `off`: do not request/parse analysis; final only.
  - `brief` (default): request analysis with a small budget and stream it; render in a collapsible box.
  - `two_phase`: Phase 1 emits analysis only; user can edit/approve; Phase 2 generates final from the approved plan.
- Budgets and caps: small analysis budget (128–256 tokens) and hard limits for tool iterations and auto-continue.
- Stop & Revise: abort the current stream, inject a developer steering message, and relaunch.
- Reflection pass (optional): cheap follow-up call that critiques the draft against a checklist; applies a small correction budget.
- Context hygiene: sliding-window + summary compaction aligned to core context (4096 right now); keep only last system/developer, last user, recent tools I/O, and a short rolling summary.

Feature Flags (proposed)
- `FRONTEND_REASONING_MODE`: `off|brief|two_phase` (default `brief`).
- `FRONTEND_REASONING_MAX_TOKENS`: integer (default 192).
- `FRONTEND_TOOL_MAX_ITERS`: integer (default 3); `FRONTEND_TOOL_TIMEOUT_MS` (default 20000).
- `FRONTEND_REFLECTION_ENABLED`: `0|1` (default `0`).
- `FRONTEND_CTX_LIMIT`: already present; keep aligned with `LLAMA_N_CTX`.

Milestones
- M-R1: Brief Reasoning Mode (streaming, capped, deterministic).
- M-R2: Stop & Revise (developer message) and deterministic relaunch.
- M-R3: Two‑Phase Harmony (Approve analysis → Generate final) behind a flag.
- M-R4: Optional Reflection Pass (checklist‑driven critique + tiny fix budget).
- M-R5: Context Hygiene & Compaction polish (budget-aware, tool transcript focusing).

Exit Criteria
- Reasoning appears in UI when enabled; absent when off.
- Abort → Revise relaunch works with a developer message and preserves prior context.
- Two‑phase flow: Phase 1 halts at analysis; Phase 2 consumes the approved analysis plus edits and produces a final.
- Reflection pass, when enabled, edits only within its token budget and logs that it ran.

## Phase Exit Criteria

Phase 1 — Tool-Ready Chat (Server Orchestration)
- `scripts/test_vllm_health.*` returns healthy within 60s on a fresh stack.
- `scripts/test_harmony_basic.*` completes with the probe phrase present in either reasoning or final content.
- README quick-start path succeeds end-to-end without manual edits.
- `/api/chat` completes tool-required prompts using the orchestrator loop and records an audit entry.
- Tool allowlist enforced; exceeding request limits returns a clear 429 with guidance.
- Optional: SSE for final turn added behind a flag; not required to pass the phase.

Phase 2 — Minimal Backend and Agent Wiring
- Agent round-trip to Core verified via the UI “Send (tools)” path or via the Python CLI.
- GraphQL/backend exposes only the endpoints needed for smoke tests; nonessential endpoints remain stubbed or disabled.
- No persistent DB requirement to pass; SQLite or in-memory is acceptable for smoke.

Phase 3 — DevX and CI
- CI job executes vLLM health and basic chat verification against the configured target and fails fast on regressions.
- PR templates and labels are present and referenced in CONTRIBUTING or README.
- CI does not spin up nonessential services for this track.

Phase 4 — Feature Bring-up (incremental)
- Any component reintroduced from `archive/` has a minimal smoke test and is behind a feature flag.
- New code paths list “Allowed Touches” and respect guardrails above.

## Out of Scope (for this track)
- Distributed inference, multi-GPU sharding, or performance tuning beyond loggable latency.
- Full-featured persistence or vector DB selection; a minimal adapter or stub is sufficient until Phase 2 completes.
- UI polish beyond functional flows explicitly listed in tasks.

### Next: Self‑Improvement Plan
See docs/roadmap/self_improvement_plan.md for the prioritized plan (TGT → SAPL → MIP), acceptance criteria, flags, and milestones.
