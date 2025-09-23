# Forgekeeper Stabilization Roadmap

## Why this track
We will stabilize a single, observable inference path and wire the minimal end-to-end loop (prompt → agent → inference → persist → UI). We prefer custom, inspectable scripts over opaque harnesses.

## Current Status
- **Done**: Single-agent orchestrator is the default runtime; memory + event logging write to `.forgekeeper/`.
- **Done**: `forgekeeper.core` alias maps imports to the consolidated modules and backs the CLI.
- **Up next**: event-file smoke coverage, queue/GraphQL callback loop, then UI wiring per the phases below.

## Phases (sequential, tight feedback)
1. **Phase 0 - Repo sanity & kill switches**
   - Pin deps; add env flags:
     - `FGK_INFERENCE_BACKEND=(triton|llamacpp|transformers)`
     - `FGK_USE_GATEWAY=(0|1)`
     - `FGK_MEMORY_BACKEND=(kv|vector)`
   - Add `scripts/doctor.sh` to verify CUDA/GPU, Triton ports, GraphQL, MQTT, model files.

2. **Phase 2 - Shared state & memory (MVP)** *(core JSON store + feedback log landed)*
   - ContextLog service (SQLite or Mongo) for events: `role, act, payload, tool_out, ts`.
   - Memory adapter interface; MVP `kv`, later `vector` drop-in.

3. **Phase 3 - Queue & GraphQL callback**
   - Ensure outbox → agent → `appendMessage` works with retries & idempotency.

4. **Phase 4 - Acts protocol + ToolShell**
   - Acts: THINK, PLAN, EXEC, OBSERVE, REPORT, REQUEST-APPROVAL.
   - Route EXEC → sandboxed ToolShell with allowlist; write outputs back to ContextLog.

5. **Phase 5 - UI wiring & missing elements**
   - Add New Conversation button.
   - Add Status Bar (GraphQL, Agent, Inference, Queue).
   - Add lightweight message polling (streaming later).

6. **Phase 6 - Self-improvement loop**
   - `automation/tasks.yaml` → Planner/Implementer/Reviewer.
   - Git flow: temp branch → diff preview → PR. Require approval for risky paths.

7. **Phase 7 - Observability & guardrails**
   - JSONL logs (`logs/forgekeeper.jsonl`), `scripts/tail_logs.py`, UI LogPanel.

8. **Phase 8 - Docs**
   - `docs/inference.md` (gateway decision tree), `docs/acts.md`, runbooks.

## Backlog
- **Inference Path A: Triton + OSS-GPT on 5090** – Triton model repo + compose, `scripts/infer_cli.py` (HTTP/gRPC) with clear errors, retries, latency print.
- **Fallback Path B: llama.cpp** – `scripts/llamacpp_infer_cli.py` following the same CLI shape for easy swapping.

## Quick-win execution order
Phase 3  4  5  2  6-8.

## Branching
Work on the stabilization branch now; reserve a future branch when tool-exec + self-improvement are stable by default.

