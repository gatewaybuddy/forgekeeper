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

## Inline Function Call Syntax

Some language models may not support structured `function_call` fields. For
those models, Forgekeeper recognizes a simplified textual convention:

```
call: function_name(arg=value, ...)
```

Arguments follow Python keyword syntax and are converted into a dictionary
before being dispatched through the functions registry. Prompt templates should
describe this pattern so models know how to invoke tools.
