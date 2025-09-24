# Legacy v1 (Deprecated)

The contents of `legacy/forgekeeper_v1/` are deprecated. The v2 orchestrator (`forgekeeper-v2`) is now the primary runtime.

Removal plan:
- Phase 1: Mark deprecated, update tests to skip legacy-only paths (done).
- Phase 2: Port any missing single-agent behaviors into v2; add CLI subcommands.
- Phase 3: Remove `legacy/forgekeeper_v1` and associated tests.

See `docs/dev/LEGACY_MIGRATION.md` for mappings and action items.
