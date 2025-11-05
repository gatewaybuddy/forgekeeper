# Human-in-the-Loop Escalation Matrix

**Plan reference:** Task T14 deliverable "HITL escalation matrix"

| Severity | Description | Primary Approver | Backup | Response SLA | Resolution SLA | Communication Channel |
|----------|-------------|------------------|--------|--------------|----------------|-----------------------|
| P0 | Production outage or safety violation with active harm. | Noah Iglesias (Safety) | Jordan Ramirez (Eng Lead) | 5 minutes | 60 minutes | PagerDuty + Phone bridge |
| P1 | High-risk deployment anomaly, rollback in progress. | Morgan Patel (QA) | Priya Desai (ML Scientist) | 15 minutes | 120 minutes | PagerDuty + Slack #mrp-hitl |
| P2 | Non-blocking issue requiring manual review before next stage. | Avery Chen (Product) | Morgan Patel (QA) | 30 minutes | 240 minutes | Slack #mrp-hitl |
| Advisory | Informational escalation for awareness only. | On-duty role lead | Backup per rotation | 60 minutes | 1 business day | Slack thread |

## Escalation Steps
1. Automated alert posts to `#mrp-hitl` with workflow context and severity.
2. Primary approver acknowledges in channel and assigns backup if needed.
3. Approver reviews evidence (policy results, minimal repro bundles,
   incident reports) and records decision in orchestrator UI.
4. Decision triggers workflow transition or rollback per policy.
5. After resolution, approver logs summary in incident report template and
   closes alert.

## Contact Directory
- Safety Officer Duty Phone: +1-555-0101
- Engineering Duty Phone: +1-555-0102
- QA Duty Phone: +1-555-0103
- Product Duty Phone: +1-555-0104

## Review Cadence
- Update matrix monthly with duty rotations.
- Store historical versions alongside `workflows/hitl_hooks.yaml` for audit.
