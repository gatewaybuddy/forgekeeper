# Developer Notes

## Tool Action Outbox

Forgekeeper now persists pending tool actions to guarantee delivery. Every call
made through `execute_tool_call` is first written as a JSON file in
`forgekeeper/outbox/` before being executed. After the tool completes, the file
is removed.

On startup the outbox is scanned and any leftover actions are replayed. This
ensures that actions queued before an unexpected shutdown are not lost.

To manually work with the outbox:

- Use `forgekeeper.outbox.write_action(call)` to persist a call.
- Call `forgekeeper.outbox.replay_pending(handler)` with a function that accepts
a call dictionary to process any outstanding actions.

The outbox directory is ignored by Git and may be safely deleted between runs.
