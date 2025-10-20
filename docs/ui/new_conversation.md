# New Conversation — Design Note (2025-10-20)

Goal
- Provide a clear affordance to start a fresh conversation, reset local UI state, and tag subsequent events with a new `conv_id`.

Behavior
- Clicking “New Conversation”:
  - Clears in-memory transcript and ephemeral UI state.
  - Generates a new `conv_id` (ULID/string) and stores it in state.
  - First user message under the new thread emits a `message` event with the new `conv_id`.

ContextLog integration
- Server and orchestrator include `conv_id` in tool/message events.
- The diagnostics drawer filters by current `conv_id`.

Non-goals
- Server-side persistence of threads.
- Migration of history across conversations.

Open Questions
- Should we persist the last N `conv_id`s in localStorage for quick switching? (out of scope for now)
