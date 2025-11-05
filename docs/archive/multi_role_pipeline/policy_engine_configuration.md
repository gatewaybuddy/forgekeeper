# Policy Engine Configuration

**Plan reference:** Task T5 deliverable "Policy engine configuration"

## Overview
Defines policy packs, evaluation contexts, and approval rules required to
gate deployments across rollout stages (Shadow → Canary → GA).

## Policy Packs
1. **Baseline Security**
   - Checks: dependency vulnerability scan, secrets detection.
   - Applies to all workflow items.
2. **Safety Review**
   - Checks: risk_profile alignment, tool usage compliance.
   - Required for high-risk tags (`risk_level >= 3`).
3. **Deployment Controls**
   - Checks: hitl approval status, rollback readiness, incident backlog
     threshold (< 2 open P1 incidents).

## Configuration File Structure (`policy_engine.yaml`)
```yaml
version: 1
policies:
  - id: security-baseline
    when: true
    actions:
      - type: run_check
        check: deps_vuln_scan
      - type: run_check
        check: secrets_scan
  - id: safety-review
    when: "workflow.tags.contains('high_risk')"
    actions:
      - type: run_check
        check: risk_profile_alignment
      - type: require_approval
        approver_group: Safety
  - id: deployment-controls
    when: "workflow.target_state in ['Canary', 'General Availability']"
    actions:
      - type: require_approval
        approver_group: QA
      - type: require_approval
        approver_group: Product
      - type: ensure_metric
        metric: rollback_ready
        operator: eq
        value: true
```

## Environment Overrides
- **Staging**: Skip `require_approval` actions, keep checks for smoke.
- **Production**: All actions enforced; approvals recorded via policy
  engine audit trail.

## Telemetry
- Policy evaluation emits metrics: `policy_eval_duration_ms`,
  `policy_eval_outcome{policy_id,status}`.
- Logs include `workflow_id`, `policy_id`, `decision`, `approver`.

## Change Management
- Changes must pass review by QA + Safety.
- Versioned in Git with changelog entry referencing task ID.
- Rollback path: reapply previous config version and invalidate cache.

## Review Cadence
- Bi-weekly joint review (QA, Product, Safety).
- Annual penetration test to validate guard effectiveness.
