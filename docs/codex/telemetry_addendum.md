# Telemetry Addendum — Autonomous Session End & Progress (Codex)

Authored by: Codex
Date: 2025-11-03

Objective
- Make end‑of‑session telemetry trustworthy and actionable for diagnostics and meta‑tests.

Event: autonomous_session_end (additions)
- `termination_reason` (string enum): `task_complete | user_stop | max_iterations | too_many_errors | stuck_loop | repetitive_actions | no_progress | fatal_error | unknown`
- `iterations_completed` (int): count of iterations that executed reflect→(plan)→(execute) path; suggested source: `state.history.length`.
- `iterations_with_reflection` (int): number of reflections emitted.
- `first_meaningful_read_ms` (int, optional): ms from session start to first successful prioritized file read when task type is exploratory/repo.

Example
```json
{
  "type": "autonomous_session_end",
  "reason": "no_progress",
  "iterations_completed": 3,
  "iterations_with_reflection": 3,
  "final_progress": 10,
  "task_complete": false,
  "errors_encountered": 0,
  "tools_used_count": 1,
  "total_actions": 3,
  "first_meaningful_read_ms": 7421
}
```

Derived Metrics (for `/metrics` or analysis)
- `tool_bounce_rate`: fraction of iterations where the same tool repeats with no new artifact or progress.
- `time_to_first_meaningful_read_ms`: distribution; alert if >30s (local dev).
- `stall_events_total{reason}`: count by `stuck_loop`, `repetitive_actions`, `no_progress`.

Notes
- These fields extend the existing JSONL ContextLog schema; add non‑breaking writes in the `finally` block in `autonomous.mjs`.
- Keep preview fields (`args_preview`, `result_preview`) size‑capped and redacted per `docs/security/redaction_policy.md`.

