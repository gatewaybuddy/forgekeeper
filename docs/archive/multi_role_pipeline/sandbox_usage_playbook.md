# Sandbox Usage Playbook

**Plan reference:** Task T10 deliverable "Sandbox usage playbook"

## Purpose
Guide engineers and agents on how to launch, use, and tear down sandbox
runner environments safely.

## Pre-requisites
- Access to `sandbox/runner.py` service and `svc-implement-builder`
  credentials.
- Tools configured with allowlist entries for sandbox operations.

## Launch Procedure
1. Submit sandbox creation request via `/sandbox/create` with workload
   manifest (tool arguments, resource estimates).
2. Runner schedules ephemeral container with quotas (2 CPU, 8 GB RAM by
   default).
3. Receive sandbox ID and connection details.

## Execution Guidelines
- Only execute commands defined in workload manifest; dynamic shell access
  is blocked.
- All files written stored under sandbox working directory and uploaded as
  artifacts on completion.
- Use tool wrappers for network calls; direct outbound internet is denied.

## Teardown
1. Signal completion via `/sandbox/complete` including summary + exit code.
2. Runner captures logs, results, and attaches to workflow bundle.
3. Sandbox destroyed automatically; manual teardown available via
   `/sandbox/destroy` if needed.

## Audit & Telemetry
- Each sandbox execution logs `sandbox_id`, `caller`, `duration`, resource
  usage, and file manifest.
- Logs stored in `contextlog.sandbox` with 12-month retention.

## Incident Handling
- If sandbox detects policy violation, execution halted and HITL alerted.
- Re-run requires explicit approval noted in `workflows/hitl_hooks.yaml`.

## Maintenance
- Weekly image refresh to include patched dependencies.
- Quarterly review of resource quotas and usage metrics.
