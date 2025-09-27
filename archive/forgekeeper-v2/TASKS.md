# Forgekeeper v2 – Tasks

1. Scaffold v2 package & pyproject; add dependencies. (done)
2. Implement events & recorder; unit tests. (done)
3. Implement buffers + summarizer + facts store; unit tests. (done)
4. Implement TriggerPolicy & FloorPolicy; unit tests. (done)
5. Implement LLMBase + LLMMock; stub LLMOpenAI. (done)
6. Implement ToolBase + ToolShell (PTY) + ToolPowerShell (win/pwsh fallback), with streaming; tests. (done)
7. Implement Orchestrator loop with prompt frames, gates, floor control, preemption; tests. (done)
8. Implement UI server (FastAPI + WS) and minimal React client; npm scripts; dev server proxy. (done)
9. Demo script; README with quickstart; GitHub Actions workflow. (done)
10. Follow-up (not now): semantic delta via embeddings; memory compaction via LLM; richer tool registry; feature flags for v1→v2 migration.

