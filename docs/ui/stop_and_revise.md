# Stop & Revise (2025-10-20)

Goal
- Allow users to halt a stream mid-flight and relaunch with a short developer note to steer the next attempt.

Behavior
- Click “Stop & Revise…” (or press Stop while streaming) to open a small modal.
- Enter a developer note (1–3 sentences) and relaunch.
- The note is injected as a `developer` message before the last `user` turn; Harmony renderer treats this as `<|start|>developer`.
- Context is preserved; tool orchestration still runs if needed.

Notes
- Not persisted; strictly local to the current conversation.
- Non-Harmony upstreams may ignore the `developer` role; Harmony is enabled by default (`FRONTEND_USE_HARMONY=1`).
