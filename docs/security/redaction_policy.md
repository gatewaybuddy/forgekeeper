# Redaction Policy for Tool Logs (2025-10-20)

Principles
- Minimize sensitive data at rest in local dev logs.
- Prefer previews over full payloads; cap size and redact patterns.

Patterns to Redact (default set)
- API keys/tokens: `(?i)\b(sk|api|token|secret)[-_]?[a-z0-9]{12,}\b`
- Emails: `\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b` (case-insensitive)
- File paths: absolute paths outside `TOOLS_FS_ROOT` → replace with `<path:outside-root>`.
- URLs with credentials: `https?://[^\s]*@` → redact credentials.

Mechanics
- Redact before writing to `.forgekeeper/context_log/*.jsonl` and `.forgekeeper/tools_audit.jsonl`.
- Truncate previews beyond `TOOLS_LOG_MAX_PREVIEW` bytes: append ` [TRUNCATED] (N bytes)`.
- Include a `redacted: true` flag when any field is scrubbed.

Testing
- Unit tests for helper functions cover edge cases and confirm no regressions.
