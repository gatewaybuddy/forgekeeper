# Forgekeeper Tasks (Fresh Start)
Note: This file is currently maintained manually for the fresh-start codebase. The previous auto-generator lived under the legacy archive; once revived, we will switch back to generating from `ROADMAP.md`.

## Policy
- Every piece of development work must have a Task Card in this file with a unique `T#` and must be referenced by PRs via `Task ID: T#`.
- Cards use the structure below; CI may enforce presence of required fields and that changes stay within "Allowed Touches."

Task Card header format to use when adding a new task:
- Header: `### T<NUMBER> - <Short title>`
- Required body fields (all bullets must be present): Goal, Scope, Out of Scope, Allowed Touches, Done When, Test Level.

Template to copy (replace placeholders and add details):
- Header to add: `### TNN - Short title`
- Then include these bullets under it:
  - Goal: <what and why>
  - Scope: <bulleted specifics>
  - Out of Scope: <bulleted non-goals>
  - Allowed Touches: `<path or glob>`, `<path or glob>`
  - Done When: <concrete checks you can run>
  - Test Level: <smoke | unit | integration>

## M1 - Foundational Workflow Orchestration (Owner: Jordan Ramirez; Target: 2024-08-16)
Establish the orchestration backbone, role definitions, and core data contracts required for multi-role collaboration.
- [ ] T1 - define-role-interaction-contracts — Capture responsibilities, inputs, and outputs for each agent role in a shared schema with validation rules.
  - Deliverables: Role contract YAML schema; Example contract instances
- [ ] T2 - implement-orchestration-service-skeleton — Stand up the pipeline orchestrator with multi-tenant authentication, event sourcing, and API endpoints for role actions.
  - Deliverables: Service blueprint; Authenticated action endpoints

- [ ] T3 - pin dependency versions across stacks (Python constraints + Node lockfiles validation)  (Phase 0: Stabilization Baseline)
- [ ] T4 - event/logs smoke coverage for future `.forgekeeper/events.jsonl` + fail-fast CI check  (Phase 0: Stabilization Baseline)
- [ ] T5 - ContextLog DB adapter (SQLite/Mongo) for events (parity with future JSON logs)  (Phase 2: Shared State & Memory)
- [ ] T6 - vector memory backend and retrieval scoring (P1)  (Phase 2: Shared State & Memory)
- [ ] T7 - implement `appendMessage` end-to-end callback with retries + idempotency  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] T8 - worker wiring: poll outbox → publish to backend (GraphQL/MQTT) with exponential backoff  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] T9 - health/metrics: expose lag + retry counters on `/health`  (Phase 3: Queue & GraphQL Callback Loop)
- [ ] T10 - define acts: THINK, PLAN, EXEC, OBSERVE, REPORT, REQUEST-APPROVAL  (Phase 4: Acts Protocol + ToolShell)
- [ ] T11 - implement sandboxed ToolShell with allowlist + gating  (Phase 4: Acts Protocol + ToolShell)
- [ ] T12 - record tool outputs back to ContextLog and surface in UI  (Phase 4: Acts Protocol + ToolShell)
- [ ] T13 - New Conversation button  (Phase 5: UI Wiring & UX Gaps)
- [ ] T14 - Status Bar (GraphQL, Agent, Inference, Queue)  (Phase 5: UI Wiring & UX Gaps)
- [ ] T15 - Lightweight message polling (streaming later)  (Phase 5: UI Wiring & UX Gaps)
- [ ] T16 - drive Planner/Implementer/Reviewer from `automation/tasks.yaml` (dry-run first)  (Phase 6: Self-Improvement Loop)
- [ ] T17 - Git flow: temp branch → diff preview → PR; approvals for risky paths  (Phase 6: Self-Improvement Loop)
- [ ] T18 - stabilize commit checks + self-review summaries in `logs/<task_id>/`  (Phase 6: Self-Improvement Loop)
- [ ] T19 - tail utility (`scripts/tail_logs.py`) and dev UX for fast triage  (Phase 7: Observability & Guardrails)
- [ ] T20 - UI LogPanel wiring with filters  (Phase 7: Observability & Guardrails)
- [ ] T21 - guardrails: allowlist enforcement for ToolShell + redaction hooks  (Phase 7: Observability & Guardrails)
- [ ] T22 - add basic request limits for tools (server)  (Phase 7: Observability & Guardrails)
- [ ] T23 - consider streaming final turn via SSE for `/api/chat` (optional)  (Phase 4.5: Tool Orchestration)
- [ ] T24 - document `/api/chat/stream` usage in frontend UI and add a simple client helper (optional)  (Phase 5)
- [ ] T25 - add size limits/redaction for tool args/results in audits (PII hygiene)  (Phase 7)
- [ ] T26 - integrate `/metrics` with a tiny UI status panel (requests, tool calls, rate-limited count)  (Phase 7)

## Task Guidelines (Guardrails)
- Keep tasks discrete and shippable within 4 hours of focused work.
- No opportunistic refactors. If a change exceeds ~20 lines or crosses modules, split into a new task.
- Default test scope: smoke/unit. Only add integration/E2E where called out below.
- Touch only files listed under “Allowed Touches.” New dependencies require a separate, approved task.
- Gate risky behavior behind env flags and document them in README.
- Each task must state “Done When” checks that can be executed locally.

## Detailed Scope and Guardrails

### T1 — Define role interaction contracts
- Goal: Capture responsibilities, inputs, and outputs for each agent role in a shared schema with validation rules.
- Scope:
  - Author a versioned schema describing required/optional fields for every role-to-role interaction.
  - Provide example YAML contract instances for Planner, Implementer, Reviewer, and Orchestrator roles.
  - Document validation instructions for contributors in the README.
- Out of Scope:
  - Implementing runtime enforcement inside the orchestrator.
  - Automating contract publication to external services.
- Allowed Touches: `docs/roles/contracts/*`, `forgekeeper/schemas/role_contracts.py`, `forgekeeper/config/role_contracts/*.yaml`, `README.md`.
- Done When:
  - `python -m pytest tests/contracts/test_role_contracts.py -q` validates the schema and samples.
  - `python forgekeeper/schemas/role_contracts.py --validate docs/roles/contracts/*.yaml` exits 0.
- Test Level: unit (schema validation).

### T2 — Implement orchestration service skeleton
- Goal: Stand up the pipeline orchestrator with multi-tenant authentication, event sourcing, and role action endpoints.
- Scope:
  - Create a FastAPI (or similar) application exposing `/actions/{role}` endpoints with auth guards.
  - Stub event sourcing by persisting requests to an in-memory store or SQLite table.
  - Provide a docker-compose service entry and local run instructions.
- Out of Scope:
  - Production-grade queueing or distributed coordination.
  - UI wiring beyond a simple health/heartbeat route.
- Allowed Touches: `forgekeeper/orchestration/*`, `forgekeeper/api/routes/*.py`, `docker-compose.yml`, `docs/orchestration.md`.
- Done When:
  - `uvicorn forgekeeper.orchestration.app:app --reload` starts and serves `/health` + `/actions/planner` locally.
  - `pytest tests/orchestration -q` passes.
- Test Level: integration (service skeleton).

### T3 — Pin dependency versions across stacks
- Goal: Lock Python and Node dependencies to improve reproducibility.
- Scope:
  - Python: add/update `constraints.txt` and ensure local install honors it.
  - Node: verify and document `npm ci` for `frontend/` (and `backend/` if present).
  - Add a simple validation step in README/Makefile.
- Out of Scope:
  - Migrating libraries or large version upgrades.
  - CI wiring beyond a single make/command stub.
- Allowed Touches: `forgekeeper/constraints.txt`, `forgekeeper/README.md`, `forgekeeper/Makefile`.
- Done When:
  - `pip install -r forgekeeper/requirements.txt -c forgekeeper/constraints.txt` succeeds (Windows/mac/Linux).
  - `npm --prefix forgekeeper/frontend ci` completes without changes; document the command.
- Test Level: smoke only (local install commands).

### T4 — Event/logs smoke coverage + fail-fast check
- Goal: Establish a simple JSONL event log and a smoke validator.
- Scope:
  - Define event JSONL path: `.forgekeeper/events.jsonl`.
  - Add a minimal script `scripts/tail_logs.py` (placeholder OK) or document a one-liner to validate JSON lines.
- Out of Scope:
  - Full observability stack, dashboards, or schema migrations.
- Allowed Touches: `forgekeeper/scripts/tail_logs.py`, `forgekeeper/README.md`.
- Done When:
  - Running `python forgekeeper/scripts/tail_logs.py --validate .forgekeeper/events.jsonl` exits 0 if file contains valid JSON lines (or is empty).
- Test Level: smoke only.

### T5 — ContextLog DB adapter (SQLite/Mongo)
- Goal: Provide a minimal append/query interface with SQLite default; Mongo optional.
- Scope:
  - Implement `append(role, act, payload)` and `tail(n)` using SQLite in `services/context_log/`.
  - Document env toggle for Mongo (stub acceptable at this stage).
- Out of Scope:
  - Migrations, indexing strategies, or long-term retention.
- Allowed Touches: `forgekeeper/services/context_log/sqlite.py`, `forgekeeper/README.md`.
- Done When:
  - Short script snippet in README appends and tails entries locally without exceptions.
- Test Level: unit-level invocation in a REPL or tiny script.

### T6 — Vector memory backend and retrieval scoring (P1)
- Goal: Introduce an interchangeable vector adapter with a trivial scorer.
- Scope:
  - Define interface and a naive in-memory or SQLite-backed embedding store.
  - Provide `put`, `search(query, k)` with simple cosine similarity placeholder.
- Out of Scope:
  - Real embedding models or external vector DB integrations.
- Allowed Touches: `forgekeeper/services/memory/vector.py`, `forgekeeper/README.md`.
- Done When:
  - `python -c "from forgekeeper.services.memory.vector import put,search; put('a','hello'); print(search('hello',1))"` prints one result.
- Test Level: unit only.

### T7 — Implement `appendMessage` end-to-end callback with retries + idempotency
- Goal: Ensure the agent can call `appendMessage` reliably.
- Scope:
  - Add retry with backoff and idempotency key to the callback client.
  - Log attempts and final status to `.forgekeeper/events.jsonl`.
- Out of Scope:
  - Changing GraphQL schema beyond adding an idempotency header/key.
- Allowed Touches: `forgekeeper/forgekeeper/*.py` (callback client only), `forgekeeper/README.md`.
- Done When:
  - Manual test shows transient failure retries and exactly one committed message.
- Test Level: smoke via a local stub or mock server.

### T8 — Worker: poll outbox → publish (GraphQL/MQTT) with backoff
- Goal: Background worker loop that drains an outbox and publishes upstream.
- Scope:
  - Implement a polling loop with exponential backoff and jitter.
  - Emit metrics: publish success/failure counts.
- Out of Scope:
  - Durable queues; a simple in-memory list is sufficient.
- Allowed Touches: `forgekeeper/forgekeeper/*.py` (worker module only), `forgekeeper/README.md`.
- Done When:
  - Local run drains a seeded outbox and prints success metrics.
- Test Level: smoke only.

### T9 — Health/metrics: expose lag + retry counters on `/health`
- Goal: Extend existing health endpoint to include queue lag and retry counters.
- Scope:
  - Add fields: `{ queue_lag, retry_count }` to health response.
- Out of Scope:
  - Prometheus integration beyond an optional `/metrics` text.
- Allowed Touches: `forgekeeper/frontend/server.mjs` (or backend health route), `forgekeeper/README.md`.
- Done When:
  - `curl http://localhost:5173/health` (or service port) returns JSON with the new fields.
- Test Level: smoke via curl.

### T10 — Define acts: THINK, PLAN, EXEC, OBSERVE, REPORT, REQUEST-APPROVAL
- Goal: Establish acts constants and brief docs.
- Scope:
  - Add an enum/constants and a short doc page.
- Out of Scope:
  - Complex state machines or multi-turn planners.
- Allowed Touches: `forgekeeper/forgekeeper/*.py` (constants), `forgekeeper/docs/acts.md`.
- Done When:
  - Acts are importable and referenced in one log line during a demo run.
- Test Level: unit only.

### T11 — Implement sandboxed ToolShell with allowlist + gating
- Goal: Minimal tool execution shell with allowlisted commands.
- Scope:
  - Implement allowlist, arg validation, size/time limits.
- Out of Scope:
  - Arbitrary process execution or network access beyond what’s explicitly allowed.
- Allowed Touches: `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/README.md`.
- Done When:
  - `/api/tools` reflects enabled tools; disallowed tool returns a clear error.
- Test Level: smoke via HTTP calls.

### T12 — Record tool outputs to ContextLog and surface in UI
- Goal: Persist tool outputs and show them in a simple panel.
- Scope:
  - Append tool results to ContextLog.
  - UI: a minimal toggle/panel listing recent tool calls and outputs.
- Out of Scope:
  - Full filtering/triage; basic list is fine.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/src/components/*`, ContextLog module.
- Done When:
  - Triggering a tool shows an entry in the UI diagnostics and an append in the log.
- Test Level: smoke in UI.

### T13 — New Conversation button
- Goal: Simple UI affordance to start a new thread.
- Scope:
  - Button clears local history and issues a new conversation ID.
- Out of Scope:
  - Server-side thread persistence.
- Allowed Touches: `forgekeeper/frontend/src/components/Chat.tsx` (or equivalent), `forgekeeper/frontend/src/state/*`.
- Done When:
  - Clicking the button yields an empty thread and fresh ID in logs.
- Test Level: UI smoke.

### T14 — Status Bar (GraphQL, Agent, Inference, Queue)
- Goal: Minimal status indicators.
- Scope:
  - Read-only indicators sourced from existing health endpoints.
- Out of Scope:
  - Auto-retry logic or complex tooltips.
- Allowed Touches: `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/lib/*`.
- Done When:
  - Each indicator shows up/down based on current health endpoints.
- Test Level: UI smoke.

### T15 — Lightweight message polling (streaming later)
- Goal: Poll for new messages on an interval.
- Scope:
  - Client-side interval with basic backoff and pause on focus.
- Out of Scope:
  - SSE/WebSocket streaming.
- Allowed Touches: `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/frontend/src/components/Chat.tsx`.
- Done When:
  - Messages appear within N seconds without manual refresh.
- Test Level: UI smoke.

### T16 — Drive Planner/Implementer/Reviewer from `automation/tasks.yaml` (dry-run)
- Goal: Wire a dry-run loop that reads tasks and prints a plan.
- Scope:
  - Parse YAML and emit a console plan; no writes.
- Out of Scope:
  - Auto-commits or patch application.
- Allowed Touches: `forgekeeper/tools/automation/*.py`, `forgekeeper/README.md`.
- Done When:
  - `python forgekeeper/tools/automation/plan.py --dry-run` prints a plan for at least 3 tasks.
- Test Level: unit/smoke.

### T17 — Git flow: temp branch → diff preview → PR; approvals for risky paths
- Goal: Provide a scripted helper that branches, shows a diff, and opens a PR.
- Scope:
  - Local script that shells to `git` and optionally `gh` if available.
- Out of Scope:
  - Auto-merge policies or CI gates.
- Allowed Touches: `forgekeeper/scripts/dev_git_flow.*`.
- Done When:
  - Running the script on a dirty tree shows a clear preview and instructions; no push by default.
- Test Level: manual smoke.

### T18 — Stabilize commit checks + self-review summaries in `logs/<task_id>/`
- Goal: Write a short self-review and capture basic stats per task.
- Scope:
  - On task completion, write a text/JSON summary with touched files and commands run.
- Out of Scope:
  - Reviewer assignment or templates beyond a minimal stub.
- Allowed Touches: `forgekeeper/scripts/*`, `forgekeeper/logs/`.
- Done When:
  - A demo run creates `logs/<task_id>/summary.json` and `review.txt`.
- Test Level: smoke.

### T19 — Tail utility and dev UX for fast triage
- Goal: Provide a simple tail/grep helper for local logs.
- Scope:
  - `scripts/tail_logs.py` with `--follow` and `--filter` options or a PowerShell equivalent.
- Out of Scope:
  - Cross-process sync or remote log shipping.
- Allowed Touches: `forgekeeper/scripts/tail_logs.py`.
- Done When:
  - `python forgekeeper/scripts/tail_logs.py --follow` prints new events.
- Test Level: smoke.

### T20 — UI LogPanel wiring with filters
- Goal: A small panel listing recent events with a text filter.
- Scope:
  - Read from `/api/logs` or a local stub; client-side filter only.
- Out of Scope:
  - Server-side search or pagination.
- Allowed Touches: `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/lib/*`.
- Done When:
  - Panel appears, lists events, filter hides non-matching rows.
- Test Level: UI smoke.

### T21 — Guardrails: allowlist enforcement for ToolShell + redaction hooks
- Goal: Harden tool execution with explicit allowlist and arg redaction.
- Scope:
  - Enforce allowlist; redact sensitive strings in args before logging.
- Out of Scope:
  - Full DLP or secrets scanning.
- Allowed Touches: `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`.
- Done When:
  - Disallowed tool attempt returns 403-style error; logs show redacted args.
- Test Level: smoke via `/api/chat` tool calls.

### T22 — Add basic request limits for tools (server)
- Goal: Rate-limit tool-invoking requests.
- Scope:
  - Add simple token bucket or per-minute cap; return 429 with Retry-After.
- Out of Scope:
  - Multi-tenant quotas or persistence.
- Allowed Touches: `forgekeeper/frontend/server.mjs`.
- Done When:
  - Bursty calls quickly surface 429; normal usage unaffected.
- Test Level: smoke with a looped curl.

### T23 — Consider streaming final turn via SSE for `/api/chat` (optional)
- Goal: Add SSE streaming for the final model turn behind a flag.
- Scope:
  - Implement event stream for final turn; maintain non-streaming default.
- Out of Scope:
  - Full multi-turn streaming orchestration.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/src/lib/chatClient.ts`.
- Done When:
  - With `FRONTEND_ENABLE_SSE=1`, a test client receives `event: message` frames until `[DONE]`.
- Test Level: smoke with curl or a tiny Node client.

### T24 — Document `/api/chat/stream` usage in frontend UI
- Goal: Teach contributors how to invoke the streaming endpoint and expose a helper in the UI codebase.
- Scope:
  - Add README or docs updates describing `/api/chat/stream` parameters and sample curl usage.
  - Provide a lightweight client helper or hook in the frontend that wraps the streaming endpoint.
- Out of Scope:
  - Backend changes to streaming semantics.
  - UI redesign beyond adding helper documentation/tooltips.
- Allowed Touches: `docs/api/chat_stream.md`, `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/frontend/README.md`.
- Done When:
  - Documentation renders the new instructions and includes example output.
  - `npm --prefix forgekeeper/frontend run lint` (or equivalent) passes with the new helper.
- Test Level: smoke (manual curl or devtools verification).

### T25 — Add size limits/redaction for tool args/results in audits (PII hygiene)
- Goal: Prevent oversized or sensitive payloads from leaking through tool audit trails.
- Scope:
  - Enforce a configurable payload size cap before writing to logs or ContextLog.
  - Apply a redaction function for known sensitive fields prior to persistence.
- Out of Scope:
  - Full secrets scanning or third-party DLP integration.
- Allowed Touches: `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/README.md`.
- Done When:
  - Unit tests covering oversized payload truncation and redaction pass.
  - Manual tool invocation shows redacted output in `.forgekeeper/events.jsonl`.
- Test Level: unit + smoke.

### T26 — Integrate `/metrics` with a tiny UI status panel
- Goal: Surface backend metrics (requests, tool calls, rate-limited count) inside the UI.
- Scope:
  - Add a lightweight fetcher polling `/metrics` and parsing the exposed counters.
  - Render a compact status component within the existing diagnostics area.
- Out of Scope:
  - Real-time charting or historical retention.
- Allowed Touches: `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/lib/*`, `forgekeeper/frontend/server.mjs`.
- Done When:
  - Local dev session shows live metric counts updating at least every 30 seconds.
  - `npm --prefix forgekeeper/frontend run test` (or lint equivalent) passes.
- Test Level: UI smoke.

### T27 — Reorder roadmap phases around tool-ready chat
- Goal: Align the roadmap with the current tool-first priorities and documented status.
- Scope:
  - Update `ROADMAP.md` so server/tool orchestration becomes Phase 1 and reorder subsequent phases accordingly.
  - Refresh the status snapshot, exit criteria, and guardrail references to reflect the new ordering.
- Out of Scope:
  - Implementation changes to services, tooling, or UI beyond documentation updates.
- Allowed Touches: `ROADMAP.md`
- Done When:
  - `python -m markdown ROADMAP.md` renders without errors.
- Test Level: smoke.

### Observability
- [x] Add a minimal tools diagnostics panel in the UI (toggle under input)  (Phase 7: Observability & Guardrails)

### Tool Orchestration
- [x] Create portable server tool registry and runner (`frontend/server.tools.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Create server-side tool orchestrator loop (`frontend/server.orchestrator.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Add `/api/chat` endpoint using orchestrator in Node server (`frontend/server.mjs`)  (Phase 4.5: Tool Orchestration)
- [x] Add client helper to call `/api/chat` (`frontend/src/lib/chatClient.ts::chatViaServer`)  (Phase 4.5: Tool Orchestration)
- [x] Wire UI to route tool-enabled prompts to `/api/chat` (`frontend/src/components/Chat.tsx`)  (Phase 5: UI Wiring & UX Gaps)
- [x] Remove explicit "Send (tools)" button; integrate tool orchestration into default send paths (stream/block)  (Phase 5: UI Wiring & UX Gaps)
- [x] Add basic guardrails and request limits for tools (server)  (Phase 7: Observability & Guardrails)
- [x] Consider streaming final turn via SSE for `/api/chat`  (Phase 4.5: Tool Orchestration)

## Completed

- [x] Core runtime env toggles (`FK_LLM_IMPL`, `FK_CORE_API_BASE`, `FK_MEMORY_BACKEND`, etc.)  (Phase 0: Stabilization Baseline)
- [x] Health-check + basic chat verification scripts (`scripts/test_vllm_health.*`, `scripts/test_harmony_basic.*`)  (Phase 1: Inference Core Online)
- [x] CLI wrappers: `compose`, `up-core`, `chat`, `ensure-stack` (Python)  (Phase 1: Inference Core Online)
- [x] Frontend Node server with reverse proxy for `/v1`, `/health`, `/healthz`  (Phase 2: Minimal Backend & Agent Wiring)
- [x] Chat UI with streaming deltas and reasoning toggle  (Phase 2: Minimal Backend & Agent Wiring)
- [x] Harmony protocol summary doc (`forgekeeper/docs/harmony_protocol_summary.md`)  (Docs)

