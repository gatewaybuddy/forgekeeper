# v2 Stabilization Kickoff – Work Session Transcript (2025‑09‑19)

This transcript summarizes the planning and implementation work performed to bootstrap the v2 stabilization track, wire Triton, and add smokes with timeouts.

## Highlights
- Roadmap and planning docs added under `forgekeeper/docs/` (ROADMAP, IMPLEMENTATION_PLAN, FILE_PATH_MAPPING, COMMANDS).
- Phase 0: appended FGK_* env flags to `.env.example`; added `doctor.sh` and `doctor.ps1`.
- Phase 1: Triton scaffold (compose, Dockerfile, Python backend model, CLI). Validated HTTP and gRPC.
- Phase 3: Queue smoke and GraphQL append smoke. Added MongoDB replica set bring‑up; backend dev start helper; health waiters with timeouts.
- E2E roundtrip smoke connects GraphQL ↔ Triton CLI for a minimal loop.
- Branch `v2-stabilization` created and PR opened; subsequent commits pushed.

## Key Files Added/Changed
- `forgekeeper/docs/ROADMAP.md`
- `forgekeeper/docs/IMPLEMENTATION_PLAN.md`
- `forgekeeper/docs/FILE_PATH_MAPPING.md`
- `forgekeeper/docs/COMMANDS.md`
- `forgekeeper/.env.example` (FGK_* flags)
- `forgekeeper/scripts/doctor.sh`, `forgekeeper/scripts/doctor.ps1`
- `forgekeeper/infra/docker/triton/docker-compose.yml`, `Dockerfile`
- `forgekeeper/infra/models/oss_gpt_20b/config.pbtxt`, `1/model.py`
- `forgekeeper/scripts/infer_cli.py`
- `forgekeeper/scripts/smoke_queue.sh`
- `forgekeeper/scripts/smoke_graphql_append.py`
- `forgekeeper/scripts/smoke_e2e_roundtrip.py`
- `forgekeeper/scripts/wait_for_url.py`, `wait_for_backend.ps1`
- `forgekeeper/scripts/start_backend_dev.ps1`

## Triton Bring‑up & Validation
- Compose: `docker compose -f forgekeeper/infra/docker/triton/docker-compose.yml up -d`
- Model repo mount: `infra/models/oss_gpt_20b` (name aligned to model `oss_gpt_20b`).
- Config: Python backend, TYPE_STRING I/O, `instance_group: KIND_CPU`.
- CLI (HTTP/gRPC) with explicit model load attempts, shape `[1,1]`, bytes/str handling:
  - `python forgekeeper/scripts/infer_cli.py --mode http --prompt "Say hello."` → `hello`
  - `python forgekeeper/scripts/infer_cli.py --mode grpc --prompt "Say hello."` → `hello`

Notes:
- Compose warns about `version:` being obsolete (harmless); CPU path used due to GPU mismatch warnings.

## Backend (GraphQL) Bring‑up
- MongoDB replica set required by Prisma for transactions.
- Bring‑up sequence:
  - `docker run -d --name forgekeeper-mongo -p 27017:27017 mongo:6 --replSet rs0 --bind_ip_all`
  - `docker exec forgekeeper-mongo mongosh --quiet --eval "rs.initiate()"`
  - Start backend: `npm --prefix forgekeeper/backend run dev` (or `pwsh forgekeeper/scripts/start_backend_dev.ps1 -Minimized`)
  - Health wait: `pwsh forgekeeper/scripts/wait_for_backend.ps1 -Url http://localhost:4000/health -MaxWait 45`

## Smokes
- Queue: `bash forgekeeper/scripts/smoke_queue.sh` → `APPEND_MESSAGE_OK`
- GraphQL append: `python forgekeeper/scripts/smoke_graphql_append.py` → `APPEND_MESSAGE_GRAPHQL_OK`
- E2E roundtrip: `python forgekeeper/scripts/smoke_e2e_roundtrip.py` → `E2E_ROUNDTRIP_OK`

## Known Issues & Fixes Encountered
- Triton model name mismatch: directory renamed to `oss_gpt_20b` to match model name.
- BYTES vs STRING types: switched config to TYPE_STRING; CLI still uses BYTES tensors for maximum compatibility.
- Batch dimension shape error: set input dims `[1,1]` and adjusted backend to accept [B] or [B,N].
- Prisma MongoDB transaction requirement: enforced replica set.
- Occasional timeouts after sleep: added `wait_for_url.py` and `wait_for_backend.ps1` with bounded retries/logging.
- Git CRLF warnings on Windows: benign; tracked files committed successfully.

## PR
- Branch: `v2-stabilization`
- PR: created and updated with subsequent commits.

