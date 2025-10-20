# Lightweight Message Polling (2025-10-20)

Goal
- Surface new messages periodically for non-streaming paths.

Behavior
- Interval: default 5s; pause when window has focus and the user is typing.
- Backoff: on 429/5xx errors, backoff to 15s once; reset on success.
- Disable when SSE streaming is active.

Implementation Notes
- Add a small helper in `src/lib/chatClient.ts` with start/stop.
- `Chat.tsx` wires it based on current convo state.

Non-goals
- WebSocket push or server-side pagination.
