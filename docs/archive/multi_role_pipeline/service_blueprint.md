# Multi-Role Pipeline Service Blueprint

**Plan reference:** Task T2 in `docs/plans/multi_role_pipeline.yaml`

## Purpose
Outline the service boundaries, runtime components, and operational flows
for the orchestration backbone that coordinates Planning, Implementation,
Review, Deployment, and Safety roles.

## Core Components
- **Workflow API Gateway**: Receives authenticated requests from role
  agents and routes them to orchestrator services.
- **Orchestrator Core**: Maintains state machines per workflow instance,
  enforces dependency ordering, and emits events to the facts store.
- **Event Stream & Recorder**: JSONL (default) with optional Kafka
  publisher for downstream analytics. Guarantees at-least-once delivery.
- **Policy Engine Adapter**: Invokes policy evaluations and caches
  decisions with TTL to limit downstream load.
- **ContextLog Adapter**: Persists audit fields (tool outputs, SLAs,
  approvals) for governance and debugging.

## Request Flow
1. **Role Authentication** – Agents authenticate via signed JWT issued by
   the Role Identity Provider. Gateway validates signature and scopes.
2. **Intent Validation** – Orchestrator verifies the request against the
   role contract schema (see `role_contract_schema.yaml`).
3. **State Transition** – Work item transitions via explicit state graph:
   `Draft → InProgress → ReviewPending → Approved → Deployed`. Guardrails
   (policy, safety, approvals) are enforced before promotion.
4. **Event Emission** – Each transition writes `{event, actor, payload}`
   to the recorder. Downstream subscribers receive updates through the
   event bus.
5. **Notification Hooks** – Configured channels (Slack, email, webhooks)
   receive summary notifications according to communication plan cadence.

## Data Stores
| Store | Purpose | Retention |
|-------|---------|-----------|
| `workflow_state` (PostgreSQL) | Durable state + metadata per work item | 18 months |
| `contextlog.events` (JSONL/S3) | Telemetry and tool outputs | 24 months |
| `policy_cache` (Redis) | 5-minute TTL for policy decisions | 5 minutes |
| `artifacts` (Object Storage) | Bundles, reports, attachments | 24 months |

## Observability
- **Metrics**: Publish Prometheus metrics for throughput, SLA adherence,
  queue depth, and policy evaluation latency.
- **Tracing**: Propagate OpenTelemetry trace IDs from gateway to role
  services and sandbox runner.
- **Logging**: Structured JSON logs with `role_id`, `workflow_id`,
  `correlation_id`, `status`, `duration_ms`.

## Security & Compliance
- Mutual TLS between gateway and orchestrator.
- Role-scoped service accounts with least privilege (see contracts).
- Policy engine requires dual-approval for production rollout states.
- All configuration changes logged and tied to change management tickets.

## Open Questions
- Should workflow state transitions be fully event-sourced or maintain a
  relational snapshot? Pending decision in architecture review Q3.
- Confirm whether sandbox artifact storage requires encryption at rest
  beyond default provider guarantees.

## Review Cadence
- Architecture review with Engineering + Safety once per quarter.
- Update blueprint when any new role or workflow state is introduced.
