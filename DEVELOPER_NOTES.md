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

## Episodic Memory Emotion Tags

Each call to `forgekeeper.memory.episodic.append_entry` may include an
``emotion`` string in addition to ``sentiment``. The emotion tag captures the
assistant's reported feeling about the task and is stored in
``.forgekeeper/memory/episodic.jsonl``. The browsing utilities display both
sentiment and emotion for recent entries to aid debugging and reflection.
## Startup Flags and Debugging

Use the root wrappers to start the stack and enable verbose diagnostics:

- PowerShell: `pwsh ./start.ps1 -Verbose [-RequireVLLM] [-VLLMWaitSeconds 120]`
- Bash: `./start.sh --debug [--require-vllm] [--vllm-wait-seconds 120]`

These set `DEBUG_MODE=true` and print additional logs. With the strict flags, startup waits for the local vLLM server (`/healthz`) before launching other services; without them, startup proceeds after a brief wait.

## File Summary Maintenance

`FILE_SUMMARY.md` lists the first line of every tracked file for quick reference. Run `python scripts/update_file_summary.py` whenever files are added, removed, or renamed so the summary stays current.
