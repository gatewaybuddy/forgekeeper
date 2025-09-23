# File Path Mapping (Plan -> Repo)

This table maps historical references in `codex.json` / `codex.plan` to the
canonical locations inside the consolidated runtime repository.

- scripts/* -> `scripts/*`
- core/orchestrator/* -> `forgekeeper-v2/forgekeeper_v2/orchestrator/*`
- core/memory/* -> `forgekeeper-v2/forgekeeper_v2/memory/*`
- core/ui/* -> `forgekeeper-v2/forgekeeper_v2/ui/*`
- automation/tasks.yaml -> `automation/tasks.yaml`
- docs/* -> `docs/*`
- backend/* -> `backend/*`
- frontend/* -> `frontend/*`
- legacy/* -> `legacy/forgekeeper_v1/*` (reference only; not part of the default runtime)

Use the public import surface `forgekeeper.core.*` when writing new Python
code; it re-exports the orchestrator, memory, and UI modules from
`forgekeeper_v2` while keeping runtime paths stable.
