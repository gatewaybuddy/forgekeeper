# Agentic Memory

The unified Forgekeeper runtime ships with a lightweight agentic memory plane that persists
under `.forgekeeper/agentic_memory.json`. The implementation lives in
`forgekeeper.core.memory.agentic` and is automatically wired into the
single-agent orchestrator.

## Components
- **AgenticStore** (`persistence.py`) – JSON-backed store for `facts` and
  feedback entries. The store ensures the file exists and keeps data in a
  friendly format for inspection or manual edits.
- **FeedbackLog** (`feedback.py`) – helper for recording structured
  feedback items. The single orchestrator uses `feedback.note(...)` to track
  turn completions, token counts, and other loop metadata.
- **Retriever** (`retrieval.py`) – turns the latest compacted bullet summary
  into a short context string and writes it back to the store via the
  `last_context` fact. This keeps prompts grounded without depending on an
  external vector service.

## Files written by the single agent
- `.forgekeeper/events.jsonl` – chronological event log for the UI and
  offline replay.
- `.forgekeeper/agentic_memory.json` – agentic memory store described above.
- `.forgekeeper/facts.json` – fact store managed by `forgekeeper.core.memory.FactsStore`.

## Inspecting state
```bash
# tail recent feedback items that were logged during a run
python - <<'PY'
from forgekeeper.core.memory.agentic import AgenticStore
store = AgenticStore()
for item in store.recent_feedback():
    print(item)
PY

# read back the last context string written by the retriever
python - <<'PY'
from forgekeeper.core.memory.agentic import Retriever
print(Retriever().last_context())
PY
```

Delete the `.forgekeeper/` directory to reset state between experiments. The
runtime will recreate the necessary files on the next launch.
