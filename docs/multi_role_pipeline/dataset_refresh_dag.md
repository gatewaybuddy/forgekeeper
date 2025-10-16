# Dataset Refresh DAG Specification

**Plan reference:** Task T3 deliverable "Dataset refresh DAG"

## Objectives
- Regenerate evaluation datasets nightly with drift detection.
- Notify evaluation leads when dataset quality drops below thresholds.
- Maintain lineage records and reproducibility metadata.

## Schedule
- Cron: `0 2 * * *` (aligned with config defaults in plan).
- Timezone: UTC.

## Tasks
1. **ingest_sources**
   - Pull canonical datasets from source registries.
   - Validate checksums and schema versions.
2. **generate_candidate**
   - Run sampling + augmentation jobs (Spark or Ray cluster).
   - Tag candidate with `dataset_version` and `source_hash`.
3. **quality_gate**
   - Compute metrics (coverage, diversity, toxicity) and compare against
     baselines stored in `baseline_eval_v1`.
   - Emits `quality_report.json`.
4. **publish_dataset** (conditional)
   - If `quality_gate` passes, publish to object storage and update
     metadata catalog.
   - If fails, skip publish and trigger alert path.
5. **notify_stakeholders**
   - Send Slack summary + email to evaluation distribution list.
   - Attach coverage gap highlights.
6. **archive_artifacts**
   - Persist logs, metrics, and candidate diffs to object storage with 90
     day retention.

## Dependencies
- `generate_candidate` depends on `ingest_sources` success.
- `quality_gate` depends on `generate_candidate`.
- `publish_dataset` depends on `quality_gate` success condition.
- `notify_stakeholders` depends on both `quality_gate` and
  `publish_dataset` (skip if gate fails).
- `archive_artifacts` runs regardless, triggered via `all_done` branch.

## Failure Handling
- Retries: 2 attempts with exponential backoff (2, 10 minutes).
- `quality_gate` failure triggers a PagerDuty alert to ML Scientist on
  call with incident priority P2.
- Partial publish failure results in automatic rollback by deleting the
  uploaded candidate and restoring previous manifest.

## Outputs
- `dataset_manifest.yaml`: location, checksum, generation timestamp.
- `quality_report.json`: metric deltas vs baseline.
- `coverage_gap_report.md`: summarised view (see template).

## Observability
- Emit DAG run metrics to Prometheus: `dag_duration_seconds`,
  `dag_status{status}`.
- Structured logs include `dag_run_id`, `task_id`, `dataset_version`.

## Ownership & Review
- Primary owner: Priya Desai (ML Scientist).
- Backup owner: ML Platform duty engineer.
- Review cadence: Monthly review of sampling strategy and thresholds.
