# Forgekeeper Tasks (Fresh Start)
Note: This file is currently maintained manually for the fresh-start codebase. The previous auto-generator lived under the legacy archive; once revived, we will switch back to generating from `ROADMAP.md`.


## M1 — Foundational Workflow Orchestration (Owner: Jordan Ramirez; Target: 2024-08-16)
Establish the orchestration backbone, role definitions, and core data contracts required for multi-role collaboration.
- [ ] T1 · define-role-interaction-contracts — Define role interaction contracts (Assignee: Avery Chen) — Capture the responsibilities, inputs, and outputs for each agent role in a shared schema with validation rules.
  - Deliverables: Role contract YAML schema; Example contract instances
- [ ] T2 · implement-orchestration-service-skeleton — Implement orchestration service skeleton (Assignee: Jordan Ramirez) — Stand up the pipeline orchestrator with multi-tenant authentication, event sourcing, and API endpoints for role actions.
  - Deliverables: Service blueprint; Authenticated action endpoints


- [ ] Pin dependency versions across stacks (Python constraints + Node lockfiles validation)  (Phase 0: Stabilization Baseline)
- [ ] Event/logs smoke coverage for future `.forgekeeper/events.jsonl` + fail-fast CI check  (Phase 0: Stabilization Baseline)
- [ ] ContextLog DB adapter (SQLite/Mongo) for events (parity with future JSON logs)  (Phase 2: Shared State & Memory)
- [ ] Vector memory backend and retrieval scoring (P1)  (Phase 2: Shared State & Memory)
- [ ] Implement `appendMessage` end-to-end callback with retries + idempotency  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] Worker wiring: poll outbox → publish to backend (GraphQL/MQTT) with exponential backoff  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] Health/metrics: expose lag + retry counters on `/health`  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] Define acts: THINK, PLAN, EXEC, OBSERVE, REPORT, REQUEST-APPROVAL  (Phase 4: Acts Protocol + ToolShell)
- [ ] Implement sandboxed ToolShell with allowlist + gating  (Phase 4: Acts Protocol + ToolShell)
- [ ] Record tool outputs back to ContextLog and surface in UI  (Phase 4: Acts Protocol + ToolShell)
- [ ] New Conversation button  (Phase 5: UI Wiring & UX Gaps)
- [ ] Status Bar (GraphQL, Agent, Inference, Queue)  (Phase 5: UI Wiring & UX Gaps)
- [ ] Lightweight message polling (streaming later)  (Phase 5: UI Wiring & UX Gaps)
- [ ] Drive Planner/Implementer/Reviewer from `automation/tasks.yaml` (dry-run first)  (Phase 6: Self-Improvement Loop)
- [ ] Git flow: temp branch → diff preview → PR; approvals for risky paths  (Phase 6: Self-Improvement Loop)
- [ ] Stabilize commit checks + self-review summaries in `logs/<task_id>/`  (Phase 6: Self-Improvement Loop)
- [ ] Tail utility (`scripts/tail_logs.py`) and dev UX for fast triage  (Phase 7: Observability & Guardrails)
- [ ] UI LogPanel wiring with filters  (Phase 7: Observability & Guardrails)
- [ ] Guardrails: allowlist enforcement for ToolShell + redaction hooks  (Phase 7: Observability & Guardrails)

### Observability
- [x] Add a minimal tools diagnostics panel in the UI (toggle under input)  (Phase 7: Observability & Guardrails)

### Tool Orchestration
- [x] Create portable server tool registry and runner (`frontend/server.tools.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Create server-side tool orchestrator loop (`frontend/server.orchestrator.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Add `/api/chat` endpoint using orchestrator in Node server (`frontend/server.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Add client helper to call `/api/chat` (`frontend/src/lib/chatClient.ts::chatViaServer`)  (Phase 4.5: Tool Orchestration)
- [x] Wire UI to route tool-enabled prompts to `/api/chat` (`frontend/src/components/Chat.tsx`)  (Phase 5: UI Wiring & UX Gaps)
- [ ] Add basic guardrails and request limits for tools (server)  (Phase 7: Observability & Guardrails)
- [ ] Consider streaming final turn via SSE for `/api/chat`  (Phase 4.5: Tool Orchestration)

## Completed

- [x] Core runtime env toggles (`FK_LLM_IMPL`, `FK_CORE_API_BASE`, `FK_MEMORY_BACKEND`, etc.)  (Phase 0: Stabilization Baseline)
- [x] Health-check + basic chat verification scripts (`scripts/test_vllm_health.*`, `scripts/test_harmony_basic.*`)  (Phase 1: Inference Core Online)
- [x] CLI wrappers: `compose`, `up-core`, `chat`, `ensure-stack` (Python)  (Phase 1: Inference Core Online)
- [x] Frontend Node server with reverse proxy for `/v1`, `/health`, `/healthz`  (Phase 2: Minimal Backend & Agent Wiring)
- [x] Chat UI with streaming deltas and reasoning toggle  (Phase 2: Minimal Backend & Agent Wiring)
- [x] Harmony protocol summary doc (`forgekeeper/docs/harmony_protocol_summary.md`)  (Docs)
