# Diagnostics Drawer (ContextLog)

The Diagnostics Drawer surfaces recent ContextLog events for the current conversation to help debug tool orchestration and model behavior.

Open it from the Chat footer by enabling “ContextLog drawer”. Events are tailed from `.forgekeeper/context_log/*.jsonl` and include `actor`, `act`, `trace_id`, `iter`, and previews.

## Continuations Summary

When the server detects an incomplete final response and auto‑continues, it logs continuation attempts as ContextLog events:

- `act`: `auto_continue`
- `attempt`: 1‑based index
- `reason`: `short` | `punct` | `fence`
- `elapsed_ms`: continuation round trip time

The drawer summarizes these at the top under “Continuations”, e.g.:

```
Attempts: attempt 1: punct (312 ms)
          attempt 2: fence (287 ms)
```

## Controls and Defaults

- UI control “Continue attempts” defaults to `2` and persists to `localStorage`.
- Server env `FRONTEND_CONT_ATTEMPTS` defaults to `2` (set `0` to disable).
- Server env `FRONTEND_CONT_TOKENS` controls the size of each continuation.

See also: Finishers & Continuations in README for high‑level behavior and tuning.

