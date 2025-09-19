# Command Reference (Single Source of Truth)

This page is the canonical list of commands for development, validation, and operations during the v2 stabilization track. Update this file when commands change; link to it rather than duplicating commands elsewhere.

## Environment & Doctor
- Bash doctor: `bash forgekeeper/scripts/doctor.sh`
- PowerShell doctor: `pwsh forgekeeper/scripts/doctor.ps1`

## Inference: Triton (Planning Scaffold)
- Start Triton (dev, compose): `docker compose -f forgekeeper/infra/docker/triton/docker-compose.yml up -d`
- Check Triton (HTTP): `python forgekeeper/scripts/infer_cli.py --mode http`
- Check Triton (gRPC): `python forgekeeper/scripts/infer_cli.py --mode grpc`
- Dry-run echo: `python forgekeeper/scripts/infer_cli.py --dry-run --prompt "Say hello."`

## Frontend / Backend (existing)
- Frontend dev: `npm --prefix forgekeeper/frontend run dev`
- Backend dev: `npm --prefix forgekeeper/backend run dev`

## Python Agent / Tests
- Run agent: `python -m forgekeeper` (from `forgekeeper/`)
- Tests (Python): `pytest -q` (from `forgekeeper/`)

## Branch & PR Flow
- Create/switch stabilization branch: `git checkout -B v2-stabilization`
- Stage+commit (example): `git add -A && git commit -m "v2: <message>"`
- Push branch: `git push -u origin HEAD`
- Create PR (gh): `gh pr create --fill --base main`

## Smokes
- Queue smoke: `bash forgekeeper/scripts/smoke_queue.sh`
- GraphQL append smoke: `python forgekeeper/scripts/smoke_graphql_append.py`
- E2E roundtrip smoke: `python forgekeeper/scripts/smoke_e2e_roundtrip.py`

Notes:
- Triton model config is a placeholder; actual model wiring comes later in Phase 1.
- Prefer updating this file over repeating commands in READMEs.
