# Feedback Summary Dashboard Specification

**Plan reference:** Task T4 deliverable "Feedback summary dashboard"

## Objectives
- Provide a consolidated view of evaluation outcomes, workflow status, and
  agent feedback loops.
- Surface actionable insights for role leads within one glance (<2 minutes
  to triage).

## Audience
- Product Owner (Avery Chen)
- ML Scientist (Priya Desai)
- QA Lead (Morgan Patel)
- Safety Officer (Noah Iglesias)

## Layout Overview
1. **Header** – Sprint context, dataset version, time of last refresh.
2. **Key Metrics Row** – Cards for `pass_rate`, `regression_alerts`,
   `open_incidents`, `average_review_cycle_time`.
3. **Feedback Stream** – Timeline listing role-submitted feedback items with
   severity badges and links to work items.
4. **Tool Usage Heatmap** – Visualises frequency and failure rate of tools
   invoked during the sprint.
5. **SLA Compliance Table** – Per-role SLA status with drill-down links to
   workflow SLA report entries.
6. **Alerts & Actions** – Highlighted tasks requiring human action.

## Data Sources
- `contextlog.events` – event stream for tool usage and approvals.
- `workflow_state` – current status, SLA timers.
- `feedback_entries` – structured feedback captured via orchestrator.
- `incident_reports` – resolved/pending incidents (links to template output).

## Refresh Cadence
- Near real-time (≤ 5 minutes) via incremental event subscription.
- Full refresh nightly to rebuild derived aggregates.

## Access & Permissions
- Read-only via role-based access control.
- Audit log records user interactions for compliance.

## Non-Functional Requirements
- Responsive layout (desktop + tablet).
- Export capability (CSV/PDF) for regulatory review.
- Error banner with fallback instructions when data sources unreachable.

## Implementation Notes
- Built with existing analytics stack (React + GraphQL gateway).
- Metrics stored in pre-aggregated tables to avoid heavy queries.
- Integrate with Workflow SLA report to hyperlink drill-down sections.

## Review Cadence
- Monthly UX review with stakeholders.
- Update spec when new roles or metrics introduced.
