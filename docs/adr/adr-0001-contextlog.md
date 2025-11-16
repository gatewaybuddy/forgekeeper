---
title: ADR-0001 ContextLog — JSONL MVP with Correlated Events
status: Proposed
date: 2025-10-20
owners: planning
---

# Context
We need a minimal, reliable event log for local development to audit tool calls and message flow, power a UI diagnostics drawer, and provide inputs for future analytics. We want low operational burden now, with a path to a DB later.

# Decision
- Adopt a JSON Lines (JSONL) file adapter as the MVP for ContextLog.
- Write events to `.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl` and rotate on size (10 MB) with an hourly index.
- Include correlation fields so UI and scripts can stitch events: `conv_id`, `trace_id`, and `iter` (tool iteration).
- Keep the existing `.forgekeeper/tools_audit.jsonl` as a compatibility fallback during the transition.

# Event Schema (MVP)
Required fields
- `id` (string, ULID), `ts` (ISO-8601), `actor` (`user|assistant|tool|system`), `act` (`message|tool_call|tool_result|error|metric`)
- `conv_id` (string), `trace_id` (string), `iter` (int)

Common optional fields
- `name` (tool or metric name), `status` (`ok|error`), `elapsed_ms` (int)
- `args_preview` (string, redacted; capped), `result_preview` (string, redacted; capped), `bytes` (int), `tags` (array)

Example (tool call)
```json
{"id":"01J9YH..","ts":"2025-10-20T16:35:12.345Z","actor":"assistant","act":"tool_call","conv_id":"c_7e..","trace_id":"t_c4..","iter":2,"name":"run_bash","status":"ok","elapsed_ms":412,"args_preview":"git status","result_preview":"On branch main...","bytes":1280}
```

# Rotation & Retention
- Rotate when current file exceeds 10 MB; new files inherit the same hourly prefix.
- Keep the last 7 days by default. Retention is a local-dev policy; production retention TBD.

# Redaction & Size Caps
- Enforce redaction before writes (see `docs/security/redaction_policy.md`).
- Truncate `args_preview`/`result_preview` beyond `TOOLS_LOG_MAX_PREVIEW` bytes with a marker: `[TRUNCATED] (N bytes)`.

# Backends (Future)
- SQLite: single-writer, simple tails; thin DAO mirrors JSONL schema.
- Mongo/Postgres: optional for multi-instance services; migrate via writer that fans out to both JSONL and DB during transition.

# Alternatives Considered
- Logfmt: compact, but loses JSON structure for nested previews.
- Full DB now: more overhead for local dev; JSONL serves current needs with minimal dependencies.

# Implications
- Update orchestrator/server to carry `trace_id`/`iter` into diagnostics and ContextLog writes.
- UI Diagnostics Drawer reads the tail endpoint and shows sanitized previews.

