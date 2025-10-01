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

## M1 - Tool Integration & Guardrails (Owner: Jordan Ramirez; Target: 2024-08-16)
Harden the end-to-end tool pathway so chat users get reliable feedback, logged execution history, and safe guardrails.
- [ ] T11 - Harden ToolShell execution sandbox and gating  (Phase 1: Tool Execution Core)
- [ ] T12 - Persist tool outputs to ContextLog and surface them in UI diagnostics  (Phase 1: Tool Execution Core)
- [ ] T21 - Enforce tool allowlists and redact sensitive arguments before logging  (Phase 2: Guardrails & Safety)
- [ ] T22 - Apply per-request rate limits for tool invocations  (Phase 2: Guardrails & Safety)
- [ ] T28 - Refresh system prompt instructions for tool-capable conversations  (Phase 0: Chat Foundations)
- [ ] T29 - Improve UI feedback for tool success, errors, and follow-up actions  (Phase 1: Tool Execution Core)
- [ ] T30 - Document tool usage patterns, limits, and troubleshooting steps  (Phase 0: Chat Foundations)

## Task Guidelines (Guardrails)
- Keep tasks discrete and shippable within 4 hours of focused work.
- No opportunistic refactors. If a change exceeds ~20 lines or crosses modules, split into a new task.
- Default test scope: smoke/unit. Only add integration/E2E where called out below.
- Touch only files listed under “Allowed Touches.” New dependencies require a separate, approved task.
- Gate risky behavior behind env flags and document them in README.
- Each task must state “Done When” checks that can be executed locally.

## Detailed Scope and Guardrails

### T11 — Harden ToolShell execution sandbox and gating
- Goal: Lock down the Node-based ToolShell so only curated commands run with clear telemetry and env toggles.
- Scope:
  - Centralize the allowlist, argument schema, and runtime limits used by ToolShell.
  - Add a feature flag for enabling/disabling tool execution per environment.
  - Emit structured logs for start/finish/error that downstream guardrails can consume.
- Out of Scope:
  - Creating new tool integrations beyond updating existing registry entries.
  - Full multi-tenant isolation or containerized execution environments.
- Allowed Touches: `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/config/*.ts`, `forgekeeper/README.md`.
- Done When:
  - `npm --prefix forgekeeper/frontend run lint` passes with the updated ToolShell configuration.
  - Calling a disallowed tool via `curl -X POST http://localhost:5173/api/tools` returns a gated error with the new telemetry fields.
- Test Level: smoke via HTTP calls.

### T12 — Persist tool outputs to ContextLog and surface them in UI diagnostics
- Goal: Make every tool call auditable and visible to chat participants without leaving the conversation.
- Scope:
  - Append tool request/response metadata to ContextLog with correlation IDs.
  - Render a diagnostics drawer in the chat UI that lists recent tool calls with status and timestamps.
  - Provide quick links or copy buttons for troubleshooting failed executions.
- Out of Scope:
  - Building a full-text search or historical export for tool results.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/state/*`, `forgekeeper/services/context_log/*`, `forgekeeper/README.md`.
- Done When:
  - Triggering a tool via the chat UI appends an entry visible through `python forgekeeper/scripts/tail_logs.py --tail 5`.
  - The diagnostics drawer displays success/error badges for the last three tool calls during a local dev session.
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

### T21 — Enforce tool allowlists and redact sensitive arguments before logging
- Goal: Ensure only supported tools run and sensitive parameters never leave the server as plain text.
- Scope:
  - Validate incoming tool requests against the canonical allowlist produced by T11.
  - Add argument scrubbing utilities that remove tokens such as API keys, emails, and file paths before logging.
  - Cover edge cases with unit tests for the redaction helpers.
- Out of Scope:
  - Integrating third-party secret scanners or DLP APIs.
- Allowed Touches: `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.guardrails.mjs`, `tests/frontend/test_tool_guardrails.ts`.
- Done When:
  - `npm --prefix forgekeeper/frontend run test` executes new guardrail unit tests successfully.
  - Tool attempts with sensitive arguments show redacted payloads inside `.forgekeeper/events.jsonl`.
- Test Level: unit + smoke via `/api/chat` tool calls.

### T22 — Apply per-request rate limits for tool invocations
- Goal: Prevent runaway tool loops by throttling chat-to-tool traffic at the server boundary.
- Scope:
  - Implement a lightweight in-memory token bucket with configurable burst and refill parameters.
  - Emit rate-limit metrics so tooling dashboards can alert on saturation.
  - Document override instructions for local development.
- Out of Scope:
  - Persistent quota tracking or user-specific allowance ledgers.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/server.metrics.mjs`, `forgekeeper/README.md`.
- Done When:
  - `npm --prefix forgekeeper/frontend run lint` passes with the new middleware enabled by default.
  - A local `for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/chat; done` script returns at least one `429` once the bucket empties.
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

### T28 — Refresh system prompt instructions for tool-capable conversations
- Goal: Align the base system/developer prompts with the hardened tool workflow so agents know when and how to call tools.
- Scope:
  - Update the shared system prompt text to highlight tool eligibility, guardrails, and failure-handling expectations.
  - Regenerate any developer messages or prompt templates consumed by the frontend orchestrator.
  - Document how to switch between tool-enabled and tool-disabled prompt variants for testing.
- Out of Scope:
  - Training new models or rewriting Harmony protocol guidance beyond tool usage specifics.
- Allowed Touches: `forgekeeper/forgekeeper/config.py`, `forgekeeper/forgekeeper/llm/tool_usage.py`, `docs/prompts/system_prompt.md`, `forgekeeper/README.md`.
- Done When:
  - `python -m pytest forgekeeper/tests/test_tool_usage.py -q` passes with updated prompt helpers.
  - Running `python - <<'PY'\nfrom forgekeeper.llm import tool_usage\nprint(tool_usage.render_tool_developer_message([])["content"])\nPY` shows the refreshed instructions mentioning tool guardrails.
- Test Level: unit (prompt helper tests).

### T29 — Improve UI feedback for tool success, errors, and follow-up actions
- Goal: Provide immediate visual feedback in chat when a tool succeeds, fails, or needs user follow-up.
- Scope:
  - Add inline status toasts or message badges indicating tool execution outcomes.
  - Surface actionable guidance (e.g., "retry", "view logs") when a tool fails or is rate-limited.
  - Ensure accessibility by announcing status changes to screen readers.
- Out of Scope:
  - Major UI redesigns beyond augmenting existing chat components.
- Allowed Touches: `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/state/*`, `forgekeeper/frontend/src/lib/*`, `forgekeeper/frontend/src/styles/*`.
- Done When:
  - `npm --prefix forgekeeper/frontend run lint` passes after UI updates.
  - Triggering a successful and failed tool call during local dev shows distinct feedback elements in the chat transcript.
- Test Level: UI smoke.

### T30 — Document tool usage patterns, limits, and troubleshooting steps
- Goal: Publish up-to-date documentation so contributors understand how to work with the tool-enabled chat stack.
- Scope:
  - Write a tooling quickstart covering configuration flags, feature toggles, and guardrail expectations.
  - Add troubleshooting guides for common failures (rate limits, disallowed tools, missing telemetry).
  - Link documentation from the project README and relevant onboarding materials.
- Out of Scope:
  - Auto-generated API references or deep protocol specifications already covered elsewhere.
- Allowed Touches: `README.md`, `docs/tooling/*.md`, `docs/onboarding/*.md`.
- Done When:
  - Updated docs include a "Tool Guardrails" section listing limits and escalation steps.
  - `python -m compileall docs` completes without errors, ensuring code samples are syntax-valid.
- Test Level: documentation (smoke).

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

