# Roadmap (Fresh Start)

Status Snapshot - 2025-09-29
- vLLM Core bring-up scripts and health checks exist (`scripts/test_vllm_health.*`, `scripts/test_harmony_basic.*`).
- Python CLI wrappers online: `compose`, `up-core`, `chat`, `ensure-stack`.
- Frontend Node server serves static UI and proxies `/v1`, `/health`, `/healthz`.
- Tool orchestration on the server is implemented: `frontend/server.tools.mjs`, `frontend/server.orchestrator.mjs`, and `/api/chat`.
- Client helper exists: `frontend/src/lib/chatClient.ts::chatViaServer`; wiring UI to use it is pending.

Phase 1 — Inference Core Online and Verified
- Bring up vLLM Core only with the local model path mounted (`/models/gpt-oss-20b`).
- Health-check endpoints return OK: `/healthz` or `/health`.
- Add basic verification scripts:
  - `scripts/test_vllm_health.sh` — polls health.
  - `scripts/test_harmony_basic.py` — simple OpenAI-compatible chat request, verifies response.
- Decide and document exact “Harmony” request/response contract; extend tests accordingly.

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

Phase 2 - Minimal Backend and Agent Wiring
- Stand up GraphQL backend + Python agent with only the endpoints needed for smoke tests.
- Route agent traffic to vLLM Core; confirm prompt/response loop works end-to-end.

Phase 3 — DevX and CI
- Add CI job for vLLM health and basic chat verification (gateway or local).
- Add PR templates and labels for the new track.

Phase 4 — Feature Bring-up (incremental)
- Reintroduce components from `archive/` as needed, behind clear flags.
- Maintain tests for every reintroduced unit.

Phase 4.5 - Tool Orchestration (Server-Side)
- Portable server module for OpenAI-style tool calls (Node/ESM):
  - Implemented: `frontend/server.tools.mjs` with an allowlisted tool registry and runners (e.g., `get_time`, `echo`).
  - Implemented: `frontend/server.orchestrator.mjs` loops on `tool_calls` → executes → appends `role:"tool"` → re-queries until final.
- Implemented: `/api/chat` endpoint in the frontend Node server using the orchestrator.
- Keep the module backend-agnostic so it can be moved to a dedicated backend later.
- Frontend wiring:
  - Implemented: client helper `frontend/src/lib/chatClient.ts::chatViaServer`.
  - Implemented: route tool-requiring prompts in `frontend/src/components/Chat.tsx` through `/api/chat` (Send (tools) button).
- Guardrails (done): audit logs, allowlist, and basic rate limits on tools (server).
- Streaming (done): SSE endpoint (`/api/chat/stream`) streams the final turn after the tool loop completes.

## Phase Exit Criteria

Phase 1 — Inference Core Online and Verified
- `scripts/test_vllm_health.*` returns healthy within 60s on a fresh stack.
- `scripts/test_harmony_basic.*` completes with the probe phrase present in either reasoning or final content.
- README quick-start path succeeds end-to-end without manual edits.

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

Phase 4.5 — Tool Orchestration (Server-Side)
- `/api/chat` completes tool-required prompts using the orchestrator loop and records an audit entry.
- Tool allowlist enforced; exceeding request limits returns a clear 429 with guidance.
- Optional: SSE for final turn added behind a flag; not required to pass the phase.

## Out of Scope (for this track)
- Distributed inference, multi-GPU sharding, or performance tuning beyond loggable latency.
- Full-featured persistence or vector DB selection; a minimal adapter or stub is sufficient until Phase 2 completes.
- UI polish beyond functional flows explicitly listed in tasks.
