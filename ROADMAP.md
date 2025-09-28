# Roadmap (Fresh Start)

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

Phase 4.5 — Tool Orchestration (Server-Side)
- Portable server module for OpenAI-style tool calls (Node/ESM):
  - Implement `server.tools.mjs` with an allowlisted tool registry and runners (e.g., `get_time`, `echo`).
  - Implement `server.orchestrator.mjs` to loop on `tool_calls` → execute → append `role:"tool"` → re-query until final.
- Add `/api/chat` endpoint in the frontend Node server using the orchestrator.
- Keep the module backend-agnostic so it can be moved to a dedicated backend later.
- Frontend wiring (next): add a client helper to call `/api/chat` and route tool-requiring prompts through it.
- Guardrails (next): add audit logs and input size limits; consider sandboxing for future tools.
- Streaming (later): add SSE for the final turn once tool loop completes.
