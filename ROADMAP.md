# Roadmap (Fresh Start)

Status Snapshot — 2025-09-29
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

Phase 2 — Minimal Backend and Agent Wiring
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
- Guardrails (next): add audit logs and tighter request limits/redaction hooks for tools.
- Streaming (later): add SSE for the final turn once the tool loop completes.
