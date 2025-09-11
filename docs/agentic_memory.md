# Agentic Memory

The memory plane hosts small, focused agents that inspect text and offer
suggestions.  Each agent declares when it should run and returns structured
`Suggestion` objects.  The
[`MemoryOrchestrator`](../forgekeeper/memory/agentic/orchestrator.py)
loads the agents, filters them by mode, and ranks their suggestions.
Non‑overlapping patch suggestions are merged and, in interactive mode,
reviewed by a lightweight reflector before application. Deepthink mode runs
all qualified agents with extended reasoning before patches are applied.

## Built-in agents

The default registry includes several helpful agents:

- **mem.heuristic.docstring-style** – nudges docstrings toward concise,
  active voice style within 80 columns.
- **mem.legacy.regex** – warns when TODO comments appear.
- **mem.reflex.prompt-length** – suggests summarising prompts longer than
  6,000 characters.
- **mem.scaffold.schema-checklist** – reminds about timestamps, soft‑delete
  flags and migration notes when schema files change.
- **mem.reflex.teh-typo** – token‑safe replacement of `teh` with `the`.

## `fk-memory` CLI

The `fk-memory` command exposes the memory plane for experimentation.

```bash
# run agents and apply patches
echo "This is teh best." | fk-memory run

# preview suggestions without applying patches
echo "This is teh best." | fk-memory shadow

# list or inspect available agents
fk-memory list
fk-memory dump mem.reflex.teh-typo
```

`run` and `shadow` accept `--mode interactive|deepthink` to select the
orchestrator mode.
