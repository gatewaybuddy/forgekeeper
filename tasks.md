# Forgekeeper Tasks (Fresh Start)
Note: This file is currently maintained manually for the fresh-start codebase. The previous auto-generator lived under the legacy archive; once revived, we will switch back to generating from `ROADMAP.md`.

## Policy
- Follow the shared guardrails in [`docs/policies/guardrails.md`](docs/policies/guardrails.md).
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

## M2 - Self-Review and Chunked Reasoning (Owner: TBD; Target: TBD; Priority: HIGH)
Enable iterative self-review for quality improvement and chunked response generation to overcome context limits and produce comprehensive outputs.
- [x] T200 - Self-Review and Chunked Reasoning design spec (ADR)  (Phase 0: Design) [Complete: 2025-10-25]
- [x] T201 - Review orchestration module implementation  (Phase 1: Review Mode MVP) [Complete: 2025-10-25]
- [x] T202 - Review prompt templates and configuration  (Phase 1: Review Mode MVP) [Complete: 2025-10-25]
- [ ] T203 - Chunked orchestration module implementation  (Phase 2: Chunked Mode MVP)
- [ ] T204 - Chunked prompt templates and configuration  (Phase 2: Chunked Mode MVP)
- [x] T205 - Orchestrator routing and integration  (Phase 1-2: Integration) [Complete: 2025-10-25]
- [x] T206 - ContextLog schema extensions for review and chunked events  (Phase 1-2: Observability) [Complete: 2025-10-25]
- [ ] T207 - UI controls for review and chunked modes  (Phase 3: UI Integration)
- [ ] T208 - DiagnosticsDrawer enhancements for review/chunk events  (Phase 3: UI Integration)
- [ ] T209 - Combined mode implementation (review + chunked)  (Phase 4: Combined Mode)
- [ ] T210 - Auto-detection heuristics and smart triggers  (Phase 4: Optimization)
- [ ] T211 - Documentation, examples, and configuration guide  (Phase 5: Documentation)
- [ ] T212 - Testing suite and validation  (Phase 5: Testing)

## M3 - Collaborative Intelligence (Owner: TBD; Target: TBD; Priority: HIGH)
Enable human-in-the-loop collaboration with approval workflows, decision checkpoints, and feedback integration for safer, more controlled autonomous operations.
- [x] T301 - Approval request system and backend API  (Phase 8.1: Core Approval System)
- [ ] T302 - Risk assessment engine and classification rules  (Phase 8.1: Core Approval System)
- [ ] T303 - Approval UI components and notification system  (Phase 8.1: Core Approval System)
- [ ] T304 - Decision checkpoint system and triggers  (Phase 8.2: Decision Checkpoints)
- [ ] T305 - Interactive planning UI and modification interface  (Phase 8.2: Decision Checkpoints)
- [ ] T306 - Confidence calibration and threshold logic  (Phase 8.2: Decision Checkpoints)
- [ ] T307 - Feedback collection forms and storage  (Phase 8.3: Feedback & Learning)
- [ ] T308 - User preference pattern analysis  (Phase 8.3: Feedback & Learning)
- [ ] T309 - Adaptive recommendation system  (Phase 8.3: Feedback & Learning)
- [ ] T310 - ContextLog integration for collaboration events  (Phase 8.4: Integration & Polish)
- [ ] T311 - Configuration, tuning, and documentation  (Phase 8.4: Integration & Polish)
- [ ] T312 - Integration testing and validation  (Phase 8.4: Integration & Polish)

## Task Guidelines (Guardrails)
See [`docs/policies/guardrails.md`](docs/policies/guardrails.md) for the canonical guidance. Highlights specific to task cards:
- Keep tasks discrete and shippable within 4 hours of focused work.
- Each task must state “Done When” checks that can be executed locally.

## Detailed Scope and Guardrails

### T120 — ContextLog design spec (JSONL MVP + future DB)
- Goal: Define event schema, retention, correlation, and backends.
- Scope:
  - Write ADR covering JSONL MVP with rotate-on-size policy; outline SQLite/Mongo future.
  - Include examples for tool_call, tool_result, message, error, metric.
- Out of Scope:
  - Implementing DB backends.
- Allowed Touches: `forgekeeper/docs/contextlog/adr-0001-contextlog.md`.
- Done When:
  - ADR merged; sample events validate via `python -m json.tool`.
- Test Level: documentation.

### T121 — ContextLog file adapter (JSONL) and write API
- Goal: Implement `append()` and `tail()` with rotation.
- Scope:
  - Module at `forgekeeper/services/context_log/jsonl.py` with rotate at 10MB and hourly index.
  - Write minimal unit tests.
- Out of Scope:
  - DB adapters.
- Allowed Touches: `forgekeeper/services/context_log/*`, `forgekeeper/tests/test_context_log.py`.
- Done When:
  - `pytest -q` passes; `tail(n)` returns newest-first; rotation preserves JSONL integrity.
- Test Level: unit.

### T122 — Instrument server to ContextLog
- Goal: Replace/augment tool audit writes with ContextLog appends and correlation IDs.
- Scope:
  - Call ContextLog from `frontend/server.mjs` where tool audits occur; preserve existing JSONL audit as fallback.
- Out of Scope:
  - Removing legacy audit file.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/services/context_log/*`.
- Done When:
  - `/api/chat` tool calls emit ContextLog entries with `trace_id`, `iter`, `name`, `status`.
- Test Level: smoke + unit (if feasible).

### T123 — Orchestrator diagnostics: correlation plumbed
- Goal: Thread `trace_id` and `iter` through orchestrator diagnostics.
- Scope:
  - Update `frontend/server.orchestrator.mjs` to include correlation in `debug.diagnostics[*]`.
- Out of Scope:
  - API changes to upstream model calls.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`.
- Done When:
  - Diagnostics objects consistently include `trace_id` and `iter`.
- Test Level: unit (shape check) + smoke.

### T124 — UI Diagnostics Drawer (read-only)
- Goal: Show last N tool events for current conversation.
- Scope:
  - Add a diagnostics drawer in Chat; copy-to-clipboard for event JSON.
- Out of Scope:
  - Server-side search or pagination.
- Allowed Touches: `forgekeeper/frontend/src/components/*`, `forgekeeper/frontend/src/lib/*`.
- Done When:
  - Drawer lists timestamp, tool, status; toggled from the UI.
- Test Level: UI smoke.

### T125 — Metrics and docs refresh
- Goal: Ensure counters and docs reflect ContextLog instrumentation.
- Scope:
  - Add/verify `totalToolCalls` on `/metrics`; document tailing and rotation.
- Out of Scope:
  - Persistent dashboards.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/README.md`, `forgekeeper/docs/observability.md`.
- Done When:
  - `GET /metrics` shows counters; docs published.
- Test Level: smoke.

### T130 — New Conversation design note
- Goal: Define conversation identity and reset behavior.
- Scope: Doc covering ID generation, state reset, ContextLog tagging.
- Allowed Touches: `forgekeeper/docs/ui/new_conversation.md`.
- Done When: Doc merged with examples.
- Test Level: documentation.

### T131 — New Conversation button + state reset
- Goal: Implement UI affordance and reset transcript/ID.
- Scope: Update `Chat.tsx` and state; set fresh `conv_id`.
- Out of Scope: Server-side thread persistence.
- Allowed Touches: `forgekeeper/frontend/src/components/Chat.tsx`, `forgekeeper/frontend/src/state/*`.
- Done When: Clicking button shows empty thread and fresh ID; ContextLog tags events with new `conv_id`.
- Test Level: UI smoke.

### T132 — New Conversation docs + telemetry note
- Goal: Update README and design doc with telemetry.
- Allowed Touches: `forgekeeper/README.md`, `forgekeeper/docs/ui/new_conversation.md`.
- Done When: README includes instructions; ContextLog example updated.

### T140 — Status Bar probe plan
- Goal: Define probe sources and semantics.
- Scope: Doc mapping Inference/Agent/GraphQL/Queue to endpoints.
- Allowed Touches: `forgekeeper/docs/ui/status_bar.md`.
- Done When: Plan doc merged.
- Test Level: documentation.

### T141 — Status Bar component + probes
- Goal: Implement read-only indicators.
- Scope: `StatusBar.tsx` and lightweight fetch probes.
- Out of Scope: Auto-retry/backoff.
- Allowed Touches: `forgekeeper/frontend/src/components/StatusBar.tsx`, `forgekeeper/frontend/src/lib/*`.
- Done When: Indicators reflect probe results in dev.
- Test Level: UI smoke.

### T142 — Status Bar docs/toggles
- Goal: Update README with instructions and env toggles.
- Allowed Touches: `forgekeeper/README.md`, `forgekeeper/docs/ui/status_bar.md`.
- Done When: Docs merged; basic toggle documented.

### T150 — Polling spec
- Goal: Define interval, focus pause, and backoff.
- Allowed Touches: `forgekeeper/docs/ui/polling.md`.
- Done When: Spec merged.

### T151 — Lightweight message polling
- Goal: Client-side polling with focus pause.
- Scope: `chatClient.ts` helper and Chat wiring.
- Out of Scope: SSE/WebSocket streaming (already available for final turn).
- Allowed Touches: `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/frontend/src/components/Chat.tsx`.
- Done When: Messages appear within N seconds; pauses on focus.
- Test Level: UI smoke.

### T170 — Redaction policy
- Goal: Define redaction patterns and principles.
- Allowed Touches: `forgekeeper/docs/security/redaction_policy.md`.
- Done When: Doc merged; patterns listed with examples.

### T171 — Redact args/results before logging
- Goal: Redact sensitive values before ContextLog/audit writes.
- Scope: Guardrail helpers + unit tests.
- Allowed Touches: `forgekeeper/frontend/server.guardrails.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`, `tests/frontend/test_tool_guardrails.ts`.
- Done When: Logs show redacted payloads; tests pass.
- Test Level: unit + smoke.

### T172 — Payload size caps for audits
- Goal: Enforce truncation with clear markers.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/README.md`.
- Done When: Oversized payloads truncated with `[TRUNCATED] (n bytes)`.
- Test Level: unit (helper) + smoke.

### T173 — Guardrail docs and tests
- Goal: Consolidate tests and doc pointers.
- Allowed Touches: `forgekeeper/README.md`, `forgekeeper/docs/security/redaction_policy.md`, `tests/frontend/test_tool_guardrails.ts`.
- Done When: Tests pass; docs reference helpers.

### T180 — `/api/chat/stream` usage docs
- Goal: Publish endpoint usage and examples.
- Allowed Touches: `forgekeeper/docs/api/chat_stream.md`, `forgekeeper/frontend/README.md`, `forgekeeper/frontend/src/lib/chatClient.ts`.
- Done When: curl example included; ESLint passes.
- Test Level: documentation.

### T183 — `docs-safe` CI workflow and enforcement
- Goal: Add a lightweight CI workflow for `[docs]` PRs that enforces an allowlist, requires a Task ID, and runs frontend unit tests.
- Scope:
  - Create `.github/workflows/docs-safe.yml` with allowlisted paths and a Task ID check.
  - Run `npm --prefix forgekeeper/frontend ci && npm --prefix forgekeeper/frontend test` on PRs with `[docs]` in the title or a `docs` label.
  - Document making `docs-safe` a required status check in branch protection.
- Out of Scope:
  - Full CI for all code paths or Docker builds.
- Allowed Touches: `.github/workflows/docs-safe.yml`, `forgekeeper/README.md`.
- Done When:
  - Workflow triggers on `[docs]` PRs or `docs` label and fails for non-allowlisted paths or missing Task ID.
  - Branch protection in GitHub requires the `docs-safe` check (manual step).
- Test Level: CI-only (smoke).

### T184 — Install `gh` and enable non-interactive auth for SAPL
- Goal: Allow the SAPL create route to open PRs from the frontend container when enabled.
- Scope:
  - Extend the frontend Dockerfile to install GitHub CLI (`gh`).
  - Support non-interactive auth via `GH_TOKEN`/`GITHUB_TOKEN` environment variables.
  - Document how to mount or forward Git config/SSH if needed, and recommend PAT scope (`repo` minimal).
- Out of Scope:
  - Complex multi-remote setups or SSH agent forwarding.
- Allowed Touches: `forgekeeper/frontend/Dockerfile`, `forgekeeper/README.md`.
- Done When:
  - With `AUTO_PR_ENABLED=1` and `AUTO_PR_DRYRUN=0`, `/api/auto_pr/create` opens a PR against `origin` using `GH_TOKEN`.
  - Failure modes (no token, blocked files) return clear errors.
- Test Level: smoke (manual).

### T185 — Container Git credential flow for SAPL
- Goal: Ensure the container can push branches to `origin` when creating PRs.
- Scope:
  - Document options: `git config user.*` inside container, HTTPS with token, or mounting host git config and known hosts.
  - Provide a tiny self-check route or script that prints `git remote -v` and push capability without exposing secrets.
- Out of Scope:
  - Managing SSH keys; users supply their own.
- Allowed Touches: `forgekeeper/README.md`, `forgekeeper/frontend/server.mjs` (optional self-check route).
- Done When:
  - A documented, repeatable recipe exists; self-check route reports readiness (`remote: OK`, `gh: OK`).
- Test Level: documentation + smoke.

### T186 — GitHub OAuth Device Flow (UI login)
- Goal: Allow users to sign in to GitHub from the UI and persist a repo‑scoped token for SAPL without manual env setup.
- Scope:
  - Register a GitHub OAuth app; add `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET` envs (dev only).
  - Add endpoints: `POST /api/auth/github/device/start` (returns `user_code`, `verification_uri`), `POST /api/auth/github/device/poll` (exchanges for token), store under `.forgekeeper/secrets/gh_token`.
  - UI: minimal modal to show code + link; poll and confirm; “Sign out” clears token file.
- Out of Scope:
  - Multi‑tenant or production secret storage; SSO org enforcement.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/src/components/*`, `forgekeeper/README.md`.
- Done When:
  - User can complete device flow from UI and `/api/auto_pr/create` opens a PR without host env.
- Test Level: smoke (manual + mocked unit for token store).
### T182 — Upstream circuit‑breaker (stub) and backoff hooks
- Goal: Provide a minimal, flag‑gated circuit‑breaker for upstream 5xx spikes and timeouts so the UI degrades gracefully and SAPL can surface tasks without overwhelming the core.
- Scope:
  - Add in‑memory failure tracking with thresholds and open/close windows (env‑configurable).
  - Return `503 { error: "circuit_open", retry_after_ms }` and set `Retry-After` on `/api/chat` and `/api/chat/stream` while open.
  - Expose breaker status on `/api/diagnose` and ContextLog `act=circuit` entries on open events.
  - Document flags and behavior in README; link to SAPL allowlist and labels for resilience tasks.
- Out of Scope:
  - Persistent counters, per‑endpoint buckets, or distributed breakers.
  - Automatic backoff/jitter tuning and exponential strategy (future task).
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/README.md`, `forgekeeper/frontend/test/*.mjs` (optional unit), `.github/workflows/docs-safe.yml` (if docs flags change).
- Done When:
  - With `UPSTREAM_CB_ENABLED=1`, three quick upstream failures cause subsequent `/api/chat` and `/api/chat/stream` to return 503 with `Retry-After` for the open window.
  - `/api/diagnose` shows `circuit.open=true`; ContextLog records a `circuit` event.
  - README documents flags: `UPSTREAM_CB_ENABLED`, `UPSTREAM_CB_THRESHOLD`, `UPSTREAM_CB_WINDOW_MS`, `UPSTREAM_CB_OPEN_MS`.
- Test Level: smoke (manual + tiny unit if feasible).

### T101 - Reasoning Modes (off | brief | two_phase)
- Goal: Introduce selectable reasoning modes with safe defaults and small analysis budgets.
- Scope:
  - Add `FRONTEND_REASONING_MODE` env (values: `off|brief|two_phase`, default `brief`).
  - In server orchestrator: gate Harmony analysis extraction and streaming by mode; for `off` skip analysis; for `brief` stream and cap; for `two_phase` stop after analysis.
  - UI: expose a simple selector in dev menu; persist choice in `localStorage`.
  - Docs: describe modes and when to use which.
- Out of Scope:
  - Non-Harmony model-specific templates beyond current support.
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.harmony.mjs`, `forgekeeper/frontend/src/components/Chat.tsx`, `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/README.md`.
- Done When:
  - Changing the selector alters server behavior without restarting (via env or live toggle).
  - In `brief`, reasoning is streamed and capped; in `off`, no reasoning field emitted; in `two_phase`, Phase 1 halts before final.
- Test Level: smoke (manual) + unit (delta parsing helper).

### T102 - Reasoning Budget & Caps
- Goal: Keep analysis concise and predictable.
- Scope:
  - Add `FRONTEND_REASONING_MAX_TOKENS` (default 192) and enforce in Harmony rendering/streaming.
  - Align `FRONTEND_TOOL_MAX_ITERS` default with orchestrator loop cap (3) and enforce timeouts per tool call (`FRONTEND_TOOL_TIMEOUT_MS`).
- Out of Scope:
  - Per-tool custom timeouts.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/server.tools.mjs`, `forgekeeper/README.md`.
- Done When:
  - A long prompt shows truncated analysis near the configured budget; tool loops abort after the configured iter/timeout.
- Test Level: unit (budget estimator) + smoke.

### T103 - Stop & Revise (Developer Message)
- Goal: Allow mid-stream abort and relaunch with targeted guidance.
- Scope:
  - UI: add a "Stop & Revise" action to stop current stream and open a small textarea for a developer note.
  - Server: accept an optional `developer` message role and ensure Harmony renderer includes it as `<|start|>developer`.
  - Orchestrator: on relaunch, preserve prior context + inject the developer note before the last user turn.
- Out of Scope:
  - Persisting these notes across sessions.
- Allowed Touches: `forgekeeper/frontend/src/components/Chat.tsx`, `forgekeeper/frontend/server.harmony.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`, `forgekeeper/README.md`.
- Done When:
  - Aborting and relaunching with a developer note materially changes the output and the note appears in the Harmony prompt (debug mode).
- Test Level: smoke.

### T104 - Two‑Phase Harmony (Approve Analysis → Generate Final)
- Goal: Add a gated two-call flow for high-risk or ambiguous tasks.
- Scope:
  - Phase 1 endpoint: render with `prefillFinal=false` and stop at `<|channel|>final` tag; return `assistant.reasoning` only.
  - UI: show analysis with an editable textarea; "Approve & Continue" triggers Phase 2.
  - Phase 2 endpoint: include approved analysis as assistant analysis + optional developer message; prefill final channel and return `assistant.content`.
- Out of Scope:
  - Persisting approval history or publishing analysis externally.
- Allowed Touches: `forgekeeper/frontend/server.harmony.mjs`, `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/src/components/Chat.tsx`, `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/README.md`.
- Done When:
  - Phase 1 returns only analysis; Phase 2 produces final that references approved analysis; toggle controlled by `FRONTEND_REASONING_MODE=two_phase`.
- Test Level: integration (end-to-end through UI).

### T105 - Reflection Pass (Optional)
- Goal: Add an optional, low-cost self-critique step with a tiny correction budget.
- Scope:
  - Add `FRONTEND_REFLECTION_ENABLED=1` to enable; orchestrator runs a checklist prompt after final and applies a small follow-up call if corrections are found.
  - Log that reflection ran and how many tokens were used.
- Out of Scope:
  - Heavy multi-round debate or large second-pass rewrites.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`, `forgekeeper/README.md`, `docs/reflection.md`.
- Done When:
  - With reflection enabled, at least one small correction can be observed on a seeded failing example; logs show token usage.
- Test Level: smoke + doc example.

### T106 - Context Hygiene & Compaction Polish
- Goal: Keep transcripts within budget and semantically relevant.
- Scope:
  - Tune compaction to prioritize (system|developer) + last user + last 10 turns + tool summaries + rolling summary.
  - Raise `FRONTEND_CTX_LIMIT` to match `LLAMA_N_CTX` by default and verify budgeting math.
  - Add diagnostics to `/api/diagnose` to show compaction method and token estimates.
- Out of Scope:
  - Tokenizer-accurate counting (approximation acceptable).
- Allowed Touches: `forgekeeper/frontend/server.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/src/components/Chat.tsx`.
- Done When:
  - Diagnostics show compaction method + before/after estimates; long chats stay within budget without losing the recent tool I/O context.
- Test Level: smoke.

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
- Status: Done (2025-10-20); roadmap already reflects Tool‑Ready Chat as Phase 1.
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

### T200 — Self-Review and Chunked Reasoning design spec (ADR)
- Goal: Define architecture, event schema, configuration flags, and rollout plan for self-review iteration and chunked reasoning features to improve response quality and overcome context limits.
- Scope:
  - Write ADR-0002 covering review cycle protocol, chunked response flow, ContextLog schema extensions, and combined mode strategies.
  - Include configuration examples, execution flows, tradeoffs, and success metrics.
  - Define phased rollout plan with feature flags.
- Out of Scope:
  - Implementation of orchestrators or UI components.
  - Performance testing or load analysis.
- Allowed Touches: `forgekeeper/docs/adr-0002-self-review-and-chunked-reasoning.md`.
- Done When:
  - ADR merged with complete architecture, protocol examples, and configuration guide.
  - Sample event schemas validate via `python -m json.tool`.
  - Phased rollout plan approved by stakeholders.
- Test Level: documentation.

### T201 — Review orchestration module implementation
- Goal: Implement core review loop that evaluates generated responses and triggers regeneration based on quality scores.
- Scope:
  - Create `frontend/server.review.mjs` with `orchestrateWithReview()`, `evaluateResponse()`, and `regenerateWithCritique()`.
  - Implement review question templating and score extraction from model responses.
  - Support configurable quality threshold and max iteration limits.
  - Emit ContextLog events for each review cycle with scores and critiques.
- Out of Scope:
  - UI components or user-facing controls.
  - Custom review questions per request (use default set only).
- Allowed Touches: `forgekeeper/frontend/server.review.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/services/context_log/*`, `forgekeeper/tests/frontend/test_review.mjs`.
- Done When:
  - `npm --prefix forgekeeper/frontend run test` passes with new review tests.
  - Manual test with `FRONTEND_ENABLE_REVIEW=1` shows multiple review passes in ContextLog.
  - Response quality score extracted correctly; regeneration triggered when score < threshold.
- Test Level: unit + smoke.

### T202 — Review prompt templates and configuration
- Goal: Define default review questions and provide configuration for review behavior.
- Scope:
  - Create `frontend/config/review_prompts.mjs` with default question templates.
  - Add environment variables: `FRONTEND_ENABLE_REVIEW`, `FRONTEND_REVIEW_ITERATIONS`, `FRONTEND_REVIEW_THRESHOLD`, `FRONTEND_REVIEW_MAX_REGENERATIONS`, `FRONTEND_REVIEW_EVAL_TOKENS`, `FRONTEND_REVIEW_MODE`.
  - Ensure prompts work with both Harmony and OpenAI protocols.
  - Document configuration in README.
- Out of Scope:
  - Per-user or per-conversation custom review questions.
  - Advanced NLP-based quality scoring.
- Allowed Touches: `forgekeeper/frontend/config/review_prompts.mjs`, `forgekeeper/README.md`, `forgekeeper/.env.example`.
- Done When:
  - Default prompts render correctly for both Harmony and OpenAI models.
  - All configuration flags documented with defaults and examples.
  - `npm --prefix forgekeeper/frontend run lint` passes.
- Test Level: unit (template rendering) + documentation.

### T203 — Chunked orchestration module implementation
- Goal: Implement chunked response generation with outline phase and per-chunk think-write loops.
- Scope:
  - Create `frontend/server.chunked.mjs` with `orchestrateChunked()`, `generateOutline()`, `generateChunk()`, and `assembleChunks()`.
  - Implement outline generation that breaks user requests into N logical chunks.
  - For each chunk: generate reasoning (analysis channel) then content (final channel).
  - Accumulate chunks into final assembled response.
  - Emit ContextLog events for outline and each chunk with token counts and labels.
- Out of Scope:
  - Review of individual chunks (T209 combined mode handles this).
  - Streaming chunk progress to UI (buffer all chunks first).
- Allowed Touches: `forgekeeper/frontend/server.chunked.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/services/context_log/*`, `forgekeeper/tests/frontend/test_chunked.mjs`.
- Done When:
  - `npm --prefix forgekeeper/frontend run test` passes with chunked tests.
  - Manual test with `FRONTEND_ENABLE_CHUNKED=1` generates outline + multiple chunks visible in ContextLog.
  - Final response correctly assembled from all chunks.
- Test Level: unit + smoke.

### T204 — Chunked prompt templates and configuration
- Goal: Define templates for outline generation and chunk think-write phases with full configuration support.
- Scope:
  - Create `frontend/config/chunked_prompts.mjs` with outline and chunk templates.
  - Add environment variables: `FRONTEND_ENABLE_CHUNKED`, `FRONTEND_CHUNKED_MAX_CHUNKS`, `FRONTEND_CHUNKED_TOKENS_PER_CHUNK`, `FRONTEND_CHUNKED_AUTO_THRESHOLD`, `FRONTEND_CHUNKED_AUTO_OUTLINE`, `FRONTEND_CHUNKED_OUTLINE_RETRIES`, `FRONTEND_CHUNKED_OUTLINE_TOKENS`, `FRONTEND_CHUNKED_REVIEW_PER_CHUNK`.
  - Ensure templates work with both Harmony and OpenAI protocols.
  - Document configuration in README.
- Out of Scope:
  - Machine learning-based chunk boundary detection.
  - Custom chunk labels per domain.
- Allowed Touches: `forgekeeper/frontend/config/chunked_prompts.mjs`, `forgekeeper/README.md`, `forgekeeper/.env.example`.
- Done When:
  - Templates render correctly for both protocols.
  - All configuration flags documented with defaults and examples.
  - `npm --prefix forgekeeper/frontend run lint` passes.
- Test Level: unit (template rendering) + documentation.

### T205 — Orchestrator routing and integration
- Goal: Wire review and chunked orchestrators into main server orchestration flow with feature detection.
- Scope:
  - Update `frontend/server.orchestrator.mjs` to detect review/chunked feature flags.
  - Route requests to appropriate orchestrator: standard, review-only, chunked-only, or combined.
  - Maintain backward compatibility when features disabled.
  - Update `frontend/server.mjs` to expose feature flags via `/config.json`.
- Out of Scope:
  - Auto-detection logic (handled in T210).
  - UI routing changes (handled in T207).
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.mjs`, `forgekeeper/tests/frontend/test_orchestrator_routing.mjs`.
- Done When:
  - With `FRONTEND_ENABLE_REVIEW=0` and `FRONTEND_ENABLE_CHUNKED=0`, behavior unchanged from baseline.
  - With `FRONTEND_ENABLE_REVIEW=1`, requests route to review orchestrator.
  - With `FRONTEND_ENABLE_CHUNKED=1`, requests route to chunked orchestrator.
  - `/config.json` exposes `reviewEnabled` and `chunkedEnabled` flags.
  - `npm --prefix forgekeeper/frontend run test` passes.
- Test Level: integration + smoke.

### T206 — ContextLog schema extensions for review and chunked events
- Goal: Extend ContextLog event schema to capture review cycles, quality scores, chunk outlines, and chunk generation events.
- Scope:
  - Add event types: `review_cycle`, `chunk_outline`, `chunk_write`.
  - Extend Python and Node ContextLog helpers to support new event types.
  - Update tail queries to filter by new event types.
  - Add unit tests for new event schemas.
- Out of Scope:
  - Database backend support (JSONL only for MVP).
  - Historical analytics or aggregation queries.
- Allowed Touches: `forgekeeper/services/context_log/jsonl.py`, `forgekeeper/services/context_log/review.py`, `forgekeeper/services/context_log/chunked.py`, `forgekeeper/frontend/server.contextlog.mjs`, `forgekeeper/tests/test_context_log.py`.
- Done When:
  - Review events include `quality_score`, `threshold`, `critique`, `accepted` fields.
  - Chunk events include `chunk_index`, `chunk_label`, `reasoning_tokens`, `content_tokens` fields.
  - `pytest -q` passes with new schema tests.
  - Tail queries successfully filter by new event types.
- Test Level: unit.

### T207 — UI controls for review and chunked modes
- Goal: Add user-facing toggles and progress indicators for review and chunked modes.
- Scope:
  - Add optional toggles in Chat UI for enabling review/chunked modes (when flags allow).
  - Display progress indicators: "Reviewing response (pass 2 of 3)..." or "Writing section 3 of 5...".
  - Store user preferences in `localStorage`.
  - Disable unavailable features based on `/config.json`.
- Out of Scope:
  - Custom review question UI or chunk label editing.
  - Real-time streaming of chunk content (buffer first).
- Allowed Touches: `forgekeeper/frontend/src/components/Chat.tsx`, `forgekeeper/frontend/src/components/ProgressIndicator.tsx`, `forgekeeper/frontend/src/lib/chatClient.ts`, `forgekeeper/frontend/src/state/*`.
- Done When:
  - Toggles appear when features enabled in `/config.json`.
  - Progress indicators show current review pass or chunk index during generation.
  - User preferences persist across sessions.
  - `npm --prefix forgekeeper/frontend run lint` passes.
- Test Level: UI smoke.

### T208 — DiagnosticsDrawer enhancements for review/chunk events
- Goal: Display review cycles and chunk breakdowns in the diagnostics drawer for transparency.
- Scope:
  - Update `DiagnosticsDrawer.tsx` to render review events with quality scores and critiques.
  - Display chunk outline and per-chunk reasoning/content summaries.
  - Add collapsible sections for review history and chunk breakdown.
  - Support copy-to-clipboard for review/chunk event JSON.
- Out of Scope:
  - Chart visualizations or historical trends.
  - Server-side filtering or pagination (client-side only).
- Allowed Touches: `forgekeeper/frontend/src/components/DiagnosticsDrawer.tsx`, `forgekeeper/frontend/src/lib/ctxClient.ts`.
- Done When:
  - Drawer lists review passes with scores, thresholds, and accepted status.
  - Drawer shows chunk outline with labels and per-chunk token counts.
  - Collapsible sections work correctly; copy function works.
  - `npm --prefix forgekeeper/frontend run lint` passes.
- Test Level: UI smoke.

### T209 — Combined mode implementation (review + chunked)
- Goal: Implement strategies for using review and chunked modes together.
- Scope:
  - Add `FRONTEND_COMBINED_REVIEW_STRATEGY` env (values: `per_chunk`, `final_only`, `both`).
  - Implement `per_chunk`: review each chunk before moving to next.
  - Implement `final_only`: generate all chunks, then review assembled response.
  - Implement `both`: review each chunk AND final assembly.
  - Log combined mode execution to ContextLog.
- Out of Scope:
  - ML-based strategy selection.
  - User-selectable strategy per request (use env default only).
- Allowed Touches: `forgekeeper/frontend/server.review.mjs`, `forgekeeper/frontend/server.chunked.mjs`, `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/README.md`, `forgekeeper/tests/frontend/test_combined_mode.mjs`.
- Done When:
  - With both features enabled and strategy set, appropriate review cycles occur.
  - `per_chunk` strategy shows review events after each chunk in ContextLog.
  - `final_only` strategy shows single review after assembly.
  - `both` strategy shows all review events.
  - `npm --prefix forgekeeper/frontend run test` passes.
- Test Level: integration + smoke.

### T210 — Auto-detection heuristics and smart triggers
- Goal: Automatically enable review or chunked modes based on question complexity and expected response length.
- Scope:
  - Implement heuristics to detect when to use chunked mode (e.g., question asks for comprehensive analysis, multi-part answer, or step-by-step guide).
  - Implement heuristics to detect when to use review mode (e.g., high-stakes question, technical accuracy required, or previous response was incomplete).
  - Add `FRONTEND_AUTO_REVIEW` and `FRONTEND_AUTO_CHUNKED` env flags to enable auto-detection.
  - Log auto-detection decisions to ContextLog.
  - Document heuristics and override behavior.
- Out of Scope:
  - Machine learning models for intent classification.
  - User training or feedback loops.
- Allowed Touches: `forgekeeper/frontend/server.orchestrator.mjs`, `forgekeeper/frontend/server.heuristics.mjs`, `forgekeeper/README.md`, `forgekeeper/tests/frontend/test_heuristics.mjs`.
- Done When:
  - Questions like "Explain X in detail with examples" automatically trigger chunked mode when `FRONTEND_AUTO_CHUNKED=1`.
  - Questions about technical specifications or code correctness trigger review mode when `FRONTEND_AUTO_REVIEW=1`.
  - Heuristics documented with examples; override instructions clear.
  - `npm --prefix forgekeeper/frontend run test` passes.
- Test Level: unit + smoke.

### T211 — Documentation, examples, and configuration guide
- Goal: Publish comprehensive documentation for self-review and chunked reasoning features.
- Scope:
  - Create `docs/features/self_review.md` with overview, configuration, examples, and troubleshooting.
  - Create `docs/features/chunked_reasoning.md` with overview, configuration, examples, and use cases.
  - Update `CLAUDE.md` with new orchestration modes and architecture overview.
  - Update `README.md` with feature flags and quick start examples.
  - Add examples to `docs/examples/review_example.md` and `docs/examples/chunked_example.md`.
- Out of Scope:
  - Video tutorials or interactive demos.
  - API reference auto-generation.
- Allowed Touches: `forgekeeper/docs/features/*`, `forgekeeper/docs/examples/*`, `forgekeeper/CLAUDE.md`, `forgekeeper/README.md`.
- Done When:
  - All configuration flags documented with defaults and examples.
  - Use cases and examples included for both features.
  - Troubleshooting sections cover common issues.
  - `CLAUDE.md` reflects new architecture.
  - Documentation renders correctly via markdown viewer.
- Test Level: documentation.

### T212 — Testing suite and validation
- Goal: Comprehensive testing coverage for review and chunked features.
- Scope:
  - Unit tests: review score extraction, chunk assembly, template rendering.
  - Integration tests: end-to-end review cycle, end-to-end chunked generation.
  - Smoke tests: `scripts/test_review_basic.py` and `scripts/test_chunked_basic.py`.
  - Performance tests: measure latency increase and token usage.
  - Add CI validation for review/chunked tests.
- Out of Scope:
  - Load testing or production stress tests.
  - A/B testing infrastructure.
- Allowed Touches: `forgekeeper/tests/frontend/test_review.mjs`, `forgekeeper/tests/frontend/test_chunked.mjs`, `forgekeeper/tests/frontend/test_combined_mode.mjs`, `forgekeeper/scripts/test_review_basic.py`, `forgekeeper/scripts/test_chunked_basic.py`, `.github/workflows/*`.
- Done When:
  - All unit tests pass: `npm --prefix forgekeeper/frontend run test` and `pytest -q`.
  - Smoke tests successfully complete: `python forgekeeper/scripts/test_review_basic.py` and `python forgekeeper/scripts/test_chunked_basic.py`.
  - CI includes review/chunked test runs.
  - Test coverage report shows > 80% coverage for new modules.
- Test Level: unit + integration + smoke + performance.

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

- [x] T27 — Reorder roadmap phases around tool-ready chat (Docs) (Completed 2025-10-20)
