# Telemetry Ingestion Adapters Specification

**Plan reference:** Task T6 deliverable "Telemetry ingestion adapters"

## Scope
Document adapter requirements for streaming telemetry from deployment
systems into the multi-role pipeline diagnostics surface.

## Adapter Responsibilities
- Normalize incoming metrics/events to canonical schema (`telemetry_event`).
- Handle batching and retry with idempotent writes.
- Enrich events with role identifiers and workflow correlation IDs.
- Support both push (webhook) and pull (polling) providers.

## Canonical Schema (`telemetry_event`)
```json
{
  "event_id": "uuid",
  "source": "string",          // e.g., prometheus, datadog
  "type": "metric|log|incident",
  "role_id": "string",
  "workflow_id": "string",
  "timestamp": "RFC3339",
  "body": {},
  "severity": "info|warning|critical"
}
```

## Adapter Matrix
| Provider | Mode | Authentication | Notes |
|----------|------|----------------|-------|
| Prometheus | Pull | Basic auth / mTLS | Scrape metrics endpoint, convert to canonical metrics. |
| Datadog | Push | API key | Webhook integration posting JSON payloads. |
| PagerDuty | Push | OAuth token | Incident triggers map to `incident` events. |

## Error Handling
- Retry policy: exponential backoff capped at 5 minutes; after 3 failures
  escalate to on-call (Morgan Patel).
- Dead-letter queue: store failed payloads for 7 days for replay.

## Deployment
- Run as containerised workers (Kubernetes CronJobs for pull, Deployments
  for streaming push).
- Use configuration secrets for API keys stored in Vault.

## Observability
- Metrics: `adapter_events_processed_total`, `adapter_failures_total`.
- Logs: structured with `provider`, `event_id`, `status`.

## Review Cadence
- Quarterly adapter audit to ensure providers up to date.
- Update spec when new telemetry providers onboarded.
