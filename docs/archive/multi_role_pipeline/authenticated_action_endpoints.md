# Authenticated Action Endpoint Specification

**Plan reference:** Task T2 deliverable "Authenticated action endpoints"

## Authentication
- JWT bearer tokens signed by the Role Identity Provider using ES256.
- Required claims: `sub` (service account), `role_id`, `scope`,
  `exp` (≤ 15 minutes), `aud` = `mrp-orchestrator`.
- Gateway validates certificate chain and revocation status before routing.

## Endpoints

### `POST /v1/work-items`
Creates a new work item sourced from a role brief.

| Aspect | Details |
|--------|---------|
| Request body | `role_id`, `brief_id`, `payload`, optional `priority` |
| Validation | `role_id` must exist in contract schema; payload validated against role-specific JSON schema. |
| Responses | `201 Created` with `workflow_id`; `400` on schema failure; `409` if duplicate `brief_id`. |
| Audit fields | `caller`, `role_id`, `brief_id`, `payload_hash`. |

### `POST /v1/work-items/{workflow_id}/actions`
Registers an action (e.g., tool execution, policy evaluation, approval) on
an existing workflow item.

| Aspect | Details |
|--------|---------|
| Request body | `action_type`, `role_id`, `artifacts`, `notes`, optional `tool_metadata`. |
| Preconditions | Caller must match allowed roles for the current workflow state. |
| Side effects | Emits `workflow.action.recorded` event; updates SLA trackers. |
| Errors | `403` on unauthorized role, `409` if action would violate guardrails, `422` for invalid artifacts. |

### `POST /v1/work-items/{workflow_id}/transition`
Promotes a workflow item to the next state when guardrails succeed.

| Aspect | Details |
|--------|---------|
| Request body | `target_state`, `role_id`, `evidence_refs`, `approvals`. |
| Guardrails | Policy engine approval, required HITL sign-offs when
  `target_state` ∈ {`Approved`, `Deployed`}. |
| Notifications | Publishes Slack + email notifications derived from
  communication plan. |
| Errors | `409` if prerequisites missing; `423` if workflow is locked by
  concurrent activity. |

### `GET /v1/work-items/{workflow_id}`
Returns current workflow state, pending guardrails, and SLA timers.

## Rate Limits
- Default: 120 requests per minute per service account.
- Burst: 240 rpm for Implementation executors during deployment windows.

## Telemetry Requirements
- Include `X-Correlation-ID` header on all requests.
- Response headers echo correlation ID and include `X-Request-Duration`.
- Every mutation endpoint records a JSONL entry with `request_id`,
  `role_id`, `workflow_id`, `action_type`, `status`, `duration_ms`.

## Error Handling
- Errors return JSON `{ "error": { "code": string, "message": string,
  "retryable": boolean } }`.
- Retryable errors follow exponential backoff hints: `Retry-After` header
  populated when appropriate.

## Change Control
- Breaking changes require 30-day notice and dual approval from product
  and safety. Version negotiation handled via `Accept: application/vnd.mrp
  .v{n}+json` header.
