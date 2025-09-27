# Roadmap (Moved)

The canonical roadmap now lives at `../Roadmap.md` and serves as the single source of truth. It includes stabilization items (inference path, queue/GraphQL callback, acts protocol, UI wiring), long‑term goals, and task checklists that generate `tasks.md` and `roadmap.yaml`.

Run from the `forgekeeper/` directory to regenerate derived artifacts:

```
python scripts/generate_tasks_from_roadmap.py
python scripts/generate_roadmap_yaml.py
```

Rationale: consolidating roadmap content prevents drift between documentation and the actionable task list used by the agent and developer tooling.

