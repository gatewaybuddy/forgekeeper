# Observability Quick Reference (2025-10-20)

Counters
- `GET /metrics` → `{ totalRequests, streamRequests, totalToolCalls, rateLimited }`.

ContextLog
- JSONL files under `.forgekeeper/context_log/` (see `docs/contextlog/adr-0001-contextlog.md`).
- Rotate on 10 MB; keep last 7 days (local policy).

Tailing
- UNIX: `tail -n 50 -f .forgekeeper/context_log/*.jsonl`
- Python helper (future): `python forgekeeper/scripts/tail_logs.py --tail 50`.

Redaction & Caps
- See `docs/security/redaction_policy.md`.
