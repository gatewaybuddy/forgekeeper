# Legacy v1 → v2 Migration Plan

This document tracks the mapping from legacy v1 modules to v2 equivalents and the deprecation/removal plan.

## Goals
- Single CLI entry (`python -m forgekeeper`) with `--conversation` for multi-agent mode.
- Consolidate features into v2 orchestrator; remove legacy/v1 once feature parity is reached.
- Internal memory stack replaces ad-hoc external notes.

## Mappings (Initial Draft)
- CLI: `legacy/forgekeeper_v1/cli.py` → `forgekeeper-v2/forgekeeper_v2/cli.py` (done)
- Agents: `legacy/forgekeeper_v1/agents/*` → v2 `orchestrator` (LLM A/B + tools)
- Memory: `legacy/.../app/memory/*` → v2 `memory/` (facts_store, summarizer)
- Outbox/Workers: `legacy/.../outbox*` → superseded by v2 orchestrator loops (TBD)
- Roadmap/Sprint: `legacy/.../sprint_planner.py`, `roadmap_committer.py` → consolidate under docs and generator scripts

## Removal Plan
1. Confirm parity for single-agent flow in v2; add CLI subcommand if needed.
2. Remove `legacy/forgekeeper_v1/*` and associated tests.
3. Update README and scripts to reference v2 pathways only.

## Open Items
- v2 single-agent pipeline: route orchestration to single agent without duet.
- Any missing test coverage to port before removal.

