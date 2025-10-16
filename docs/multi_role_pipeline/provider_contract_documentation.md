# Provider Contract Documentation

**Plan reference:** Task T7 deliverable "Provider contract documentation"

## Purpose
Document the provider abstraction layer that allows the pipeline to target
multiple inference providers with consistent throttling and telemetry.

## Provider Contract Interface
```yaml
ProviderConfig:
  id: string
  display_name: string
  api_base: string
  model_name: string
  auth:
    type: api_key|oauth|sigv4
    secret_ref: string
  rate_limits:
    requests_per_minute: integer
    tokens_per_minute: integer
  capabilities:
    streaming: bool
    tool_calls: bool
    reasoning_budget: integer
  observability:
    metrics_namespace: string
    audit_channel: string
```

## Required Endpoints
- **`POST /chat`** – Accepts Harmony-style payloads with optional tool
  calls. Must support reasoning/final channels.
- **`GET /health`** – Returns provider readiness (latency, queue depth).
- **`POST /tokens/estimate`** – Optional helper to estimate token usage for
  budgeting.

## Error Semantics
- Standard error codes: `429` (rate limited), `500` (provider failure),
  `503` (maintenance). Body should include `provider_error_code`.
- Retries: exponential with jitter; fallback provider engaged when
  threshold reached.

## Onboarding Checklist
1. Provision credentials in Vault (`providers/<id>` path).
2. Configure rate limits matching provider agreement.
3. Register provider in `providers/registry.py` (code deliverable) and add
   entry to `providers.yaml`.
4. Update monitoring dashboards to include provider metrics.
5. Run smoke tests across core prompts and tool scenarios.

## Telemetry Expectations
- Emit metrics per provider: latency, success rate, token usage.
- Log provider response metadata for audit.

## Review Cadence
- Quarterly provider scorecard with availability & latency data.
- Annual contract renewal review with procurement and legal.
