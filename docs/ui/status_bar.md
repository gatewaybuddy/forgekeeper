# Status Bar — Probe Plan (2025-10-20)

Goal
- Minimal up/down indicators for key services without introducing complex retries.

Sources
- Inference: `/health` or `/healthz` (proxied target).
- Agent/Server: `/metrics` (presence implies up; parse fails → down).
- GraphQL: GET to `FRONTEND_GRAPHQL_URL` (200/400 → up; 404/timeout → down) — stubbed for this track.
- Queue: N/A (render as disabled or “stub”).

Behavior
- Poll each source every 30s (shared timer).
- No exponential backoff; failures set status=down until next interval.

UI
- `StatusBar.tsx` shows 4 indicators: Inference, Agent, GraphQL, Queue.
- Tooltip or title attribute shows last probe time and endpoint.

Non-goals
- Auto-recovery, retries, or dashboards.
