# Snapshot Retention Standard Operating Procedure

**Plan reference:** Task T8 deliverable "Snapshot retention SOP"

## Purpose
Ensure prompt snapshots, outputs, and metadata are captured, retained, and
purged in alignment with compliance obligations.

## Scope
Applies to all prompt snapshots stored via `storage/prompt_snapshots.py`
for evaluation, audit, and replay scenarios.

## Responsibilities
- **Primary owner:** Priya Desai (ML Scientist)
- **Backup owner:** Data Platform duty engineer
- **Review cadence:** Quarterly

## Procedure
1. **Capture**
   - Snapshot service writes `{prompt, response, metadata}` to object
     storage bucket `snapshots/` with deterministic IDs.
   - Metadata includes provider, model, role_id, workflow_id, and
     redaction flags.
2. **Retention**
   - Default retention: 30 days (configurable via plan defaults).
   - High-risk workflows flagged `retain_extended=true` retained for 180
     days pending safety sign-off.
3. **Redaction**
   - Apply automated PII redaction prior to persistence.
   - Manual review queue for flagged records (Safety Officer).
4. **Purge**
   - Daily job enumerates expired snapshots and deletes payload + metadata.
   - Purge logs stored for 12 months for audit.
5. **Validation**
   - Weekly audit job samples 5% of active snapshots ensuring metadata
     completeness and retention policy adherence.

## Compliance Controls
- All access logged via ContextLog with `actor`, `snapshot_id`, `action`.
- Encryption at rest enforced via storage provider KMS keys.
- Access limited to specific IAM roles (`snapshot-reader`, `snapshot-admin`).

## Incident Response
- If unauthorized access detected, notify Safety + Security, suspend
  snapshot access, and follow incident template.

## Documentation
- Update this SOP when retention window changes or new classifications are
  introduced.
