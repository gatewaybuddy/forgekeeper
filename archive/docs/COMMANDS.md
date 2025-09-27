# Command Reference (Single Source of Truth)

This page is the canonical list of commands for development, validation, and operations during the stabilization track. Update this file when commands change; link to it rather than duplicating commands elsewhere.

## Environment & Doctor
- Bash doctor: `bash scripts/doctor.sh`
- PowerShell doctor: `pwsh scripts/doctor.ps1`
- Wait for backend health (with timeout): `pwsh scripts/wait_for_backend.ps1 -Url http://localhost:4000/health -MaxWait 30`

## Inference: Triton (Planning Scaffold)
- Start Triton (dev, compose): `docker compose -f forgekeeper/infra/docker/triton/docker-compose.yml up -d`
- Check Triton (HTTP): `python scripts/infer_cli.py --mode http`
- Check Triton (gRPC): `python scripts/infer_cli.py --mode grpc`
- Dry-run echo: `python scripts/infer_cli.py --dry-run --prompt "Say hello."`

## Frontend / Backend (existing)
- Frontend dev: `npm --prefix forgekeeper/frontend run dev`
- Backend dev: `npm --prefix forgekeeper/backend run dev`
- Backend dev (PowerShell helper): `pwsh scripts/start_backend_dev.ps1 -Minimized`

## Python Agent / Tests
- Run agent: `python -m forgekeeper` (from `forgekeeper/`)
- Tests (Python): `pytest -q` (from `forgekeeper/`)

## Branch & PR Flow
- Create/switch stabilization branch: `git checkout -B v2-stabilization`
- Stage+commit (example): `git add -A && git commit -m "stabilization: <message>"`
- Push branch: `git push -u origin HEAD`
- Create PR (gh): `gh pr create --fill --base main`

## Smokes
- Queue smoke: `bash scripts/smoke_queue.sh`
- GraphQL append smoke: `python scripts/smoke_graphql_append.py`
- E2E roundtrip smoke: `python scripts/smoke_e2e_roundtrip.py`

Notes:
- Triton model config is a placeholder; actual model wiring comes later in Phase 1.
- Prefer updating this file over repeating commands in READMEs.
