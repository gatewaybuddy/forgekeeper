# Policy UX Content Guidelines

**Plan reference:** Task T11 deliverable "Policy UX content guidelines"

## Tone & Voice
- Clear, direct, and action-oriented.
- Avoid jargon; explain policy names with short tooltips.
- Use consistent severity labels (Info, Warning, Blocked).

## Layout Principles
- Primary panel summarises approval queue with filters by role and severity.
- Secondary panel shows detailed policy evaluation results.
- Sticky footer provides context-specific actions (approve, request changes,
  escalate).

## Messaging Patterns
- **Approval Success:** "Approval recorded. Deployment may proceed once
  remaining checks pass."
- **Blocking Failure:** "Deployment blocked: Safety approval missing.
  Provide justification or escalate to Safety officer."
- **Informational Banner:** "Policy pack updated on YYYY-MM-DD. Review
  change log before approving new requests."

## Accessibility
- Ensure color contrast meets WCAG AA (≥ 4.5:1).
- Provide keyboard shortcuts for common actions (approve, reject, escalate).
- Screen reader labels for policy statuses and action buttons.

## Localization
- Support English initially; strings externalised for translation.
- Date/time values displayed in ISO 8601 with local timezone tooltip.

## Governance Hooks
- All actions require confirmation modal summarising impact.
- Audit trail link displayed for every approval decision.
- Escalation modal pre-populates contacts defined in HITL matrix.

## Review Cadence
- Quarterly content review with Policy + UX teams.
- Update guidelines when new policy packs or approval flows launch.
