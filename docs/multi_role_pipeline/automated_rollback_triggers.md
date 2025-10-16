# Automated Rollback Triggers

**Plan reference:** Task T5 deliverable "Automated rollback triggers"

## Goal
Define automatic rollback conditions and execution flow for deployments
managed by the multi-role pipeline.

## Trigger Types
1. **Metric Regression**
   - Condition: Any monitored metric exceeds configured threshold (see
     `config_defaults.deployment.approval_matrix`).
   - Detection: Metrics ingested into Prometheus and evaluated via Alertmanager.
2. **Incident Escalation**
   - Condition: P1/P0 incident created or safety escalation triggered.
   - Detection: Incident management integration (PagerDuty webhook).
3. **Policy Breach**
   - Condition: Policy engine detects post-deployment violation (e.g.,
     missing approval due to race condition).
   - Detection: Policy engine emits `policy.breach` event.

## Rollback Workflow
1. Alert triggers `rollback_dispatcher` job with payload `{workflow_id,
   trigger_type, details}`.
2. Dispatcher checks if rollback already in progress to avoid duplication.
3. Orchestrator transitions workflow to `RollbackPending` and notifies HITL
   approvers.
4. Sandbox runner executes predefined rollback playbook (per service).
5. Success or failure recorded in `contextlog.events` and surfaced in SLA
   dashboard.

## Controls
- Requires at least one human acknowledgement within 15 minutes (HITL
  matrix). If not acknowledged, automatic rollback proceeds but raises a P0.
- Rollback jobs run with dedicated service account `svc-rollback` with
  limited permissions.
- All rollback actions produce artifact bundle `rollback_evidence.zip`.

## Testing & Simulation
- Monthly chaos test to validate rollback path for each critical service.
- Simulation environment mirrors production config but uses synthetic
  workloads.

## Notifications
- Slack channel `#mrp-rollback` with high-priority alerts.
- Email summary to stakeholders after rollback completes.

## Review Cadence
- Safety + SRE review after each rollback event.
- Quarterly tabletop exercises to refine triggers and communication steps.
