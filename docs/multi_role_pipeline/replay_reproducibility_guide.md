# Replay Reproducibility Guide

**Plan reference:** Task T13 deliverable "Replay reproducibility guide"

## Goals
- Enable deterministic replays of stochastic agent runs for audits and
  regression investigations.

## Seed Management
- Seeds stored in `storage/replay_seeds.json` with structure:
```json
{
  "workflow_id": "uuid",
  "phase": "planning|implementation|review",
  "seed": 123456789,
  "timestamp": "2024-07-06T00:00:00Z",
  "owner": "role_id"
}
```
- Generate seeds using cryptographically secure RNG.
- Rotate seeds quarterly; archive historical entries (max 5 versions).

## Replay Procedure
1. Retrieve latest seed entry for workflow + phase.
2. Set environment variables `REPLAY_SEED` and `REPLAY_MODE=deterministic`.
3. Execute agent pipeline with `--replay-workflow <id>` flag.
4. Compare outputs against stored prompt snapshots to confirm alignment.

## Validation
- Replay harness verifies tool invocations and diff outputs match original.
- Differences > tolerance (token_count delta > 5%) flagged for manual
  review.

## Storage & Security
- Seeds stored encrypted at rest; access limited to QA + Safety groups.
- Access events logged with reason codes.

## Reporting
- Replay runs emit summary JSON: `seed_used`, `match_status`,
  `differences`, `duration`.
- Attach summary to workflow timeline and SLA report when used for incident
  analysis.

## Review Cadence
- Monthly audit ensures seeds exist for all workflows entering production.
- Post-incident review to confirm replay executed and documented.
