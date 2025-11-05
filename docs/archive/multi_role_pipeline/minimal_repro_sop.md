# Minimal Reproduction Capture SOP

**Plan reference:** Task T12 deliverable "Minimal repro SOP"

## Purpose
Standardise how agents capture minimal reproduction bundles for failing
runs so reviewers can reproduce issues quickly.

## Trigger Conditions
- Automated validations fail and cannot be resolved automatically.
- Reviewer requests additional evidence during HITL evaluation.

## Procedure
1. **Initiate Capture**
   - Invoke `diagnostics/minimal_repro.py` with workflow ID and failing
     step metadata.
2. **Environment Snapshot**
   - Script records OS, container image digest, dependency versions.
3. **Input & Output Capture**
   - Store trimmed prompt/response pairs, tool arguments, and outputs.
   - Redact sensitive data per policy before packaging.
4. **Reproduction Script**
   - Generate `repro.sh` or `repro.ps1` with deterministic commands.
5. **Bundle & Upload**
   - Tar bundle as `minimal_repro_<workflow_id>.tar.gz` and upload to
     object storage with retention 30 days.
6. **Notification**
   - Post link to workflow timeline and assign owner for follow-up.

## Quality Checks
- Ensure bundle size < 25 MB; otherwise flag for manual review.
- Validate commands run successfully in sandbox dry run.

## Ownership
- Primary: Implementation Executor on duty.
- Backup: QA lead when Implementation unavailable.

## Review Cadence
- Monthly audit of random samples to confirm completeness.

## Incident Handling
- If sensitive data detected post-upload, follow incident process and
  purge bundle immediately.
