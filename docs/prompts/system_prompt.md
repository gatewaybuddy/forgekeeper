# Forgekeeper System Prompt - Tool-Capable Conversations

This document defines the system prompt for tool-capable conversations in Forgekeeper. The system has been hardened with comprehensive guardrails (T11, T12, T21, T22) to ensure safe, validated, and auditable tool execution.

## Overview

Forgekeeper provides AI agents with access to a curated set of tools for file operations, git commands, HTTP requests, and task management. All tool execution is subject to strict guardrails including allowlist enforcement, argument validation, timeout protection, output size limits, rate limiting, and sensitive data redaction.

## Tool System Guardrails

### 1. Allowlist Enforcement

Only **19 curated tools** are available for execution. Any attempt to call a tool not on this list will result in an error with the full list of allowed tools.

**Allowed Tools:**
- `echo` - Echo provided text
- `get_time` - Get current UTC time
- `read_dir` - List directory contents (sandboxed)
- `read_file` - Read file contents (sandboxed)
- `write_file` - Write file contents (sandboxed)
- `write_repo_file` - Write file to repository root
- `http_fetch` - Fetch HTTP/HTTPS URLs
- `git_status` - Get git repository status
- `git_diff` - Get git diff (staged or unstaged)
- `git_add` - Stage files for commit
- `git_commit` - Create git commit
- `git_push` - Push commits to remote
- `git_pull` - Pull changes from remote
- `run_bash` - Execute bash commands (gated by FRONTEND_ENABLE_BASH)
- `run_powershell` - Execute PowerShell commands (gated by FRONTEND_ENABLE_POWERSHELL)
- `refresh_tools` - Reload tool definitions
- `restart_frontend` - Restart frontend server
- `create_task_card` - Create a new task card (TGT integration)
- `check_pr_status` - Check GitHub PR status (SAPL integration)

### 2. Argument Validation

All tool arguments are validated against schemas before execution:

**Validation Rules:**
- **Required arguments** must be present
- **Type checking** enforced (string, number, boolean, array, object)
- **Length limits** enforced on strings and arrays
- **Enum validation** for restricted values (e.g., HTTP methods)
- **Range validation** for numbers (min/max)

**Example Schemas:**
```javascript
// read_file requires 'path' string (max 4096 chars)
read_file: {
  path: { type: 'string', required: true, maxLength: 4096 }
}

// http_fetch requires 'url', optional 'method' from enum
http_fetch: {
  url: { type: 'string', required: true, maxLength: 2048 },
  method: { type: 'string', required: false, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
}

// git_add requires 'files' array (max 100 items)
git_add: {
  files: { type: 'array', required: true, maxItems: 100 }
}
```

### 3. Execution Limits

**Timeout Protection:**
- Default: 30 seconds per tool call
- Configurable via `TOOL_TIMEOUT_MS` environment variable
- Timeout error returned after limit exceeded

**Output Size Limits:**
- Maximum: 1MB per tool result
- Configurable via `TOOL_MAX_OUTPUT_BYTES` environment variable
- Prevents memory exhaustion from large outputs

**Retry Policy:**
- Default: No automatic retries (`TOOL_MAX_RETRIES=0`)
- Configurable for specific use cases
- Failed tools must be retried explicitly by agent

### 4. Rate Limiting (T22)

Token bucket rate limiter prevents runaway tool loops:

**Rate Limit Parameters:**
- **Capacity**: 100 tokens (burst size)
- **Refill Rate**: 10 tokens per second
- **Cost per Request**: 1 token
- **Configurable**: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_CAPACITY`, `RATE_LIMIT_REFILL_RATE`

**Rate Limit Behavior:**
- Returns HTTP 429 when limit exceeded
- Includes `Retry-After` header with seconds to wait
- All responses include rate limit headers:
  - `X-RateLimit-Limit`: Maximum capacity
  - `X-RateLimit-Remaining`: Tokens remaining
  - `X-RateLimit-Reset`: Timestamp when bucket refills

### 5. Sensitive Data Redaction (T21)

Comprehensive pattern-based redaction prevents secrets from appearing in logs:

**Redacted Patterns:**
- API Keys (Stripe, OpenAI, AWS, GitHub, Anthropic, etc.)
- JWT tokens
- SSH private keys
- Passwords and credentials
- Email addresses
- Credit card numbers
- Database connection strings with credentials
- URLs with embedded credentials

**Redaction Behavior:**
- Applied at logging boundary only
- Tool execution receives unredacted arguments
- Logs show `<redacted:*>` placeholders (e.g., `<redacted:stripe-live-key>`)
- Recursive redaction for nested objects and arrays
- Key-based redaction for sensitive field names (password, secret, token, api_key, etc.)
- Configurable max preview size: `TOOLS_LOG_MAX_PREVIEW=4096`

**Example:**
```javascript
// Input arguments (tool receives this)
{ "api_key": "sk_live_1234567890abcd", "email": "alice@example.com" }

// Logged arguments preview (appears in ContextLog)
{ "api_key": "<redacted:stripe-live-key>", "email": "<redacted:email>" }
```

### 6. ContextLog Persistence (T12)

All tool executions are logged to `.forgekeeper/context_log/*.jsonl` for audit and debugging:

**Logged Events:**
- **Start Phase**: Tool name, arguments preview (redacted), trace_id, conv_id, timestamp
- **Finish Phase**: Result preview (redacted), elapsed_ms, result_size_bytes, trace_id, conv_id
- **Error Phase**: Error message, error_type, stack trace, elapsed_ms, trace_id, conv_id

**Correlation IDs:**
- `conv_id`: Links all tool calls within a conversation
- `trace_id`: Links related operations across services
- Enables end-to-end tracing and debugging

**Log Rotation:**
- Hourly rotation (ctx-YYYYMMDD-HH.jsonl)
- 10MB max file size
- 7-day retention by default

## Error Handling

### Tool Not in Allowlist

**Error Response:**
```json
{
  "error": "tool_not_in_allowlist",
  "message": "Tool 'dangerous_tool' is not in the allowlist. Allowed tools: echo, get_time, read_dir, read_file, write_file, write_repo_file, http_fetch, git_status, git_diff, git_add, git_commit, git_push, git_pull, run_bash, run_powershell, refresh_tools, restart_frontend, create_task_card, check_pr_status"
}
```

**Recovery Strategy:**
1. Check the list of allowed tools
2. Choose an allowed tool that accomplishes the same goal
3. If no allowed tool exists, explain to user that operation is not possible

### Invalid Arguments

**Error Response:**
```json
{
  "error": "validation_error",
  "errors": [
    "Missing required argument: path",
    "Argument 'method' must be one of: GET, POST, PUT, DELETE, PATCH"
  ]
}
```

**Recovery Strategy:**
1. Read the validation errors carefully
2. Fix the arguments based on error messages
3. Consult argument schemas for correct types and constraints
4. Retry with corrected arguments

### Timeout

**Error Response:**
```json
{
  "error": "timeout",
  "message": "Tool execution exceeded timeout of 30000ms"
}
```

**Recovery Strategy:**
1. Try with smaller scope (e.g., read fewer files, shorter command)
2. Break operation into smaller steps
3. Consider if the operation is too expensive
4. Inform user if operation cannot be completed within timeout

### Rate Limit Exceeded

**Error Response:**
```
HTTP 429 Too Many Requests
Retry-After: 5
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000000
```

**Recovery Strategy:**
1. Wait for the number of seconds specified in `Retry-After` header
2. Check `X-RateLimit-Remaining` before making more calls
3. Batch operations when possible to reduce API calls
4. Inform user if rate limit prevents immediate operation

## Tool Usage Best Practices

### When to Use Tools

**Appropriate Use Cases:**
- Need real-time information (current time, file contents, git status)
- Need to perform actions (write files, run commands, create tasks/PRs)
- Need external data (HTTP requests to APIs or web pages)
- Need to interact with system (git operations, shell commands)

**Examples:**
```
✅ GOOD: read_file to check current implementation before suggesting changes
✅ GOOD: git_status to see uncommitted changes before creating commit
✅ GOOD: get_time to timestamp an operation
✅ GOOD: http_fetch to retrieve external documentation
```

### When NOT to Use Tools

**Inappropriate Use Cases:**
- Information already available in context (previous tool results, conversation history)
- Simple calculations or reasoning (can be done without tools)
- Repeatedly calling same tool with same arguments (result won't change)
- Speculative or exploratory calls without clear purpose

**Examples:**
```
❌ BAD: read_file to check a file you just wrote in previous step
❌ BAD: get_time multiple times in same conversation
❌ BAD: git_status repeatedly without making changes
❌ BAD: Calling tools just to "explore" without specific goal
```

### Efficient Tool Usage

**Batching:**
- Use `git_add` with multiple files instead of calling once per file
- Combine related operations when possible

**Caching:**
- Remember tool results within conversation
- Don't re-fetch data that hasn't changed

**Error Handling:**
- Always check tool results for errors
- Implement appropriate recovery strategies
- Inform user when operation fails and why

**Rate Limit Awareness:**
- Monitor `X-RateLimit-Remaining` header
- Space out non-urgent operations
- Prioritize critical operations when near limit

## Prompt Variants

### Tool-Enabled Mode (Default)

Include full guardrail guidance and tool definitions:

```python
from forgekeeper.llm.tool_usage import render_tool_developer_message

# With guardrails (default)
message = render_tool_developer_message(tools, include_guardrails=True)
```

This mode includes:
- Complete guardrail documentation
- Error handling guidance
- Best practices section
- Tool definitions with TypeScript signatures

### Tool-Disabled Mode

Minimal tool definitions without guardrail guidance:

```python
# Without guardrails (legacy mode)
message = render_tool_developer_message(tools, include_guardrails=False)
```

This mode includes:
- Only tool definitions
- No guardrail documentation
- Useful for testing or minimal prompts

### Switching Between Modes

Configure via Python code or environment:

```python
# Environment-based toggle
import os
include_guardrails = os.getenv('TOOL_PROMPT_INCLUDE_GUARDRAILS', '1') == '1'
message = render_tool_developer_message(tools, include_guardrails=include_guardrails)
```

## Testing

### Unit Tests

Test prompt rendering with and without guardrails:

```bash
pytest -q forgekeeper/tests/test_tool_usage.py
```

### Integration Tests

Test full tool execution with guardrails:

```bash
# Start mock server
node forgekeeper/scripts/mock_openai_server.mjs &

# Run integration tests
FK_CORE_API_BASE=http://localhost:8001 python forgekeeper/scripts/test_harmony_basic.py
```

## Configuration Reference

**Tool Execution:**
```bash
TOOLS_EXECUTION_ENABLED=1              # Global execution toggle
TOOL_TIMEOUT_MS=30000                  # Execution timeout (default: 30s)
TOOL_MAX_RETRIES=0                     # Max retries (default: 0)
TOOL_MAX_OUTPUT_BYTES=1048576          # Max output size (default: 1MB)
TOOL_ALLOW=echo,get_time,read_file    # Custom allowlist (comma-separated)
```

**Rate Limiting (T22):**
```bash
RATE_LIMIT_ENABLED=1                   # Enable rate limiting
RATE_LIMIT_CAPACITY=100                # Max tokens (burst size)
RATE_LIMIT_REFILL_RATE=10              # Tokens per second
RATE_LIMIT_COST_PER_REQUEST=1          # Tokens per request
```

**Redaction (T21):**
```bash
TOOLS_LOG_MAX_PREVIEW=4096             # Max preview size in bytes
```

**ContextLog (T12):**
```bash
FGK_CONTEXTLOG_DIR=.forgekeeper/context_log
FGK_CONTEXTLOG_MAX_BYTES=10485760      # 10MB rotation
```

## Related Documentation

- [Tool Configuration (tools.config.mjs)](../../frontend/config/tools.config.mjs) - Allowlist, schemas, validation
- [ContextLog ADR](../contextlog/adr-0001-contextlog.md) - Event logging schema
- [Tools API](../api/tools_api.md) - REST API for tool management
- [CLAUDE.md](../../CLAUDE.md) - Architecture guide

## Change History

- **T28 (2025-11-16)**: Refreshed system prompt with guardrail documentation
- **T22**: Added rate limiting with token bucket algorithm
- **T21**: Added sensitive data redaction
- **T12**: Added ContextLog persistence for tool executions
- **T11**: Added execution hardening with allowlist and validation
