# Tool Guardrails

**Comprehensive guide to Forgekeeper's tool execution guardrails and security features.**

---

## Table of Contents

1. [Overview](#overview)
2. [Allowlist Enforcement (T11)](#allowlist-enforcement-t11)
3. [Argument Validation (T11)](#argument-validation-t11)
4. [Execution Limits (T11)](#execution-limits-t11)
5. [Rate Limiting (T22)](#rate-limiting-t22)
6. [Sensitive Data Redaction (T21)](#sensitive-data-redaction-t21)
7. [ContextLog Persistence (T12)](#contextlog-persistence-t12)
8. [System Prompts (T28)](#system-prompts-t28)
9. [UI Feedback (T29)](#ui-feedback-t29)
10. [Configuration Summary](#configuration-summary)
11. [Monitoring & Metrics](#monitoring--metrics)
12. [Best Practices](#best-practices)

---

## Overview

Forgekeeper implements **defense-in-depth** for tool execution with multiple layers of protection:

```
┌─────────────────────────────────────────────────┐
│  Request                                        │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 1: Rate Limiting (T22)                   │
│  - Token bucket algorithm                       │
│  - HTTP 429 on limit exceeded                   │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 2: Allowlist Check (T11)                 │
│  - Only 19 approved tools                       │
│  - Fail fast if not allowed                     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 3: Argument Validation (T11)             │
│  - Schema-based type checking                   │
│  - Length, range, enum constraints              │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 4: Execution (T11)                       │
│  - Timeout protection (30s default)             │
│  - Output size limit (1MB default)              │
│  - Retry budget (0 default)                     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 5: Redaction (T21)                       │
│  - Redact sensitive data from logs              │
│  - 20+ pattern types                            │
│  - Preserve structure for debugging             │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Layer 6: ContextLog (T12)                      │
│  - Persist to JSONL                             │
│  - Correlation IDs (conv_id, trace_id)          │
│  - Complete audit trail                         │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Response                                       │
└─────────────────────────────────────────────────┘
```

**Key Principle:** Each layer is independent and provides value even if others fail.

---

## Allowlist Enforcement (T11)

### Purpose

Prevent execution of untrusted or malicious tools by maintaining a **curated allowlist** of 19 approved tools.

### Implementation

**File:** `frontend/config/tools.config.mjs`

**Default Allowlist:**
```javascript
export const DEFAULT_ALLOWED_TOOLS = [
  // Read-only tools
  'echo',
  'get_time',
  'read_dir',
  'read_file',
  'git_status',
  'git_diff',

  // Write tools
  'write_file',
  'write_repo_file',

  // Network tools
  'http_fetch',

  // Git operations
  'git_add',
  'git_commit',
  'git_push',
  'git_pull',

  // Shell execution (gated by additional flags)
  'run_bash',
  'run_powershell',

  // System tools
  'refresh_tools',
  'restart_frontend',

  // Integration tools
  'create_task_card',
  'check_pr_status'
];
```

### Configuration

**Override via Environment:**
```bash
# Only allow read-only tools
TOOL_ALLOW=echo,get_time,read_file,read_dir,git_status,git_diff
```

**Programmatic Check:**
```javascript
import { checkToolAllowed } from './config/tools.config.mjs';

const result = checkToolAllowed('get_time');
// { allowed: true }

const result2 = checkToolAllowed('dangerous_tool');
// {
//   allowed: false,
//   reason: 'tool_not_in_allowlist',
//   message: 'Tool "dangerous_tool" is not in the allowlist...'
// }
```

### Behavior

**Allowed Tool:**
- Proceeds to argument validation
- Logged to ContextLog with `status: "ok"`

**Disallowed Tool:**
- Immediately rejected before execution
- Returns error with list of allowed tools
- Logged to ContextLog with `status: "error"`, `error_type: "tool_not_in_allowlist"`

### Security Considerations

1. **Minimal Surface Area**: Only 19 tools reduces attack surface
2. **Explicit Allow**: New tools must be explicitly added to allowlist
3. **No Dynamic Loading**: Cannot execute arbitrary code via tool names
4. **Shell Gating**: `run_bash` and `run_powershell` require additional env flags:
   ```bash
   FRONTEND_ENABLE_BASH=1
   FRONTEND_ENABLE_POWERSHELL=1
   ```

### Adding Tools to Allowlist

**Step 1:** Create tool implementation in `frontend/tools/`
```javascript
// frontend/tools/my_tool.mjs
export const def = {
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'Does something useful',
    parameters: { /* schema */ }
  }
};

export async function run(args) {
  // implementation
}
```

**Step 2:** Add to allowlist in `frontend/config/tools.config.mjs`
```javascript
export const DEFAULT_ALLOWED_TOOLS = [
  // ... existing tools
  'my_tool',  // Add here
];
```

**Step 3:** Add argument schema (if needed)
```javascript
export const TOOL_ARGUMENT_SCHEMAS = {
  my_tool: {
    input: { type: 'string', required: true, maxLength: 1000 }
  }
};
```

**Step 4:** Test
```bash
npm --prefix forgekeeper/frontend run test
```

---

## Argument Validation (T11)

### Purpose

Ensure tool arguments conform to expected **types, constraints, and formats** before execution.

### Implementation

**File:** `frontend/config/tools.config.mjs`

**Schema Definition:**
```javascript
export const TOOL_ARGUMENT_SCHEMAS = {
  echo: {
    text: {
      type: 'string',
      required: true,
      maxLength: 10000
    }
  },

  http_fetch: {
    url: {
      type: 'string',
      required: true,
      maxLength: 2048
    },
    method: {
      type: 'string',
      required: false,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    headers: {
      type: 'object',
      required: false
    },
    body: {
      type: 'string',
      required: false,
      maxLength: 1048576  // 1MB
    }
  },

  git_add: {
    files: {
      type: 'array',
      required: true,
      maxItems: 100
    }
  }
};
```

### Validation Rules

**Supported Types:**
- `string`: Text values
- `number`: Numeric values
- `boolean`: True/false
- `object`: JSON objects
- `array`: JSON arrays

**String Constraints:**
- `required`: Must be present
- `maxLength`: Maximum character count
- `enum`: Must match one of allowed values

**Number Constraints:**
- `required`: Must be present
- `min`: Minimum value (inclusive)
- `max`: Maximum value (inclusive)

**Array Constraints:**
- `required`: Must be present
- `maxItems`: Maximum array length

**Object Constraints:**
- `required`: Must be present
- (No additional constraints currently)

### Validation Function

```javascript
import { validateToolArguments } from './config/tools.config.mjs';

const result = validateToolArguments('echo', { text: 'Hello' });
// { valid: true, errors: [] }

const result2 = validateToolArguments('echo', {});
// {
//   valid: false,
//   errors: ['Missing required argument: text']
// }

const result3 = validateToolArguments('echo', { text: 'x'.repeat(20000) });
// {
//   valid: false,
//   errors: ['Argument "text" exceeds maximum length of 10000 characters']
// }
```

### Error Messages

**Missing Required Argument:**
```
Missing required argument: {field_name}
```

**Type Mismatch:**
```
Argument '{field_name}' must be of type {expected}, got {actual}
```

**Length Exceeded:**
```
Argument '{field_name}' exceeds maximum length of {max} characters
```

**Enum Violation:**
```
Argument '{field_name}' must be one of: {allowed_values}
```

**Range Violation:**
```
Argument '{field_name}' must be >= {min}
Argument '{field_name}' must be <= {max}
```

### Best Practices

1. **Always Define Schemas**: Even if tool accepts any input, define expected types
2. **Conservative Limits**: Use smaller maxLength values, increase if needed
3. **Explicit Enums**: List all allowed values for string enums
4. **Required Fields**: Mark fields as required if tool cannot function without them
5. **Test Edge Cases**: Test with missing, null, oversized, and invalid-type arguments

---

## Execution Limits (T11)

### Purpose

Prevent **runaway executions, resource exhaustion, and denial-of-service** attacks.

### Timeout Protection

**Configuration:**
```bash
TOOL_TIMEOUT_MS=30000  # 30 seconds default
```

**Behavior:**
- Tool execution is wrapped in Promise.race with timeout
- If timeout is reached, execution is aborted
- Error logged to ContextLog with `error_type: "timeout"`
- Partial output (if any) is discarded

**Example:**
```javascript
// Internal implementation (simplified)
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Timeout')), TOOL_TIMEOUT_MS);
});

const result = await Promise.race([
  executeTool(name, args),
  timeoutPromise
]);
```

**Timeout Error Response:**
```json
{
  "error": "Tool execution timed out after 30000ms",
  "tool": "http_fetch",
  "timeout_ms": 30000
}
```

### Output Size Limits

**Configuration:**
```bash
TOOL_MAX_OUTPUT_BYTES=1048576  # 1MB default
```

**Behavior:**
- Tool output is checked after execution
- If output exceeds limit, it is truncated with `[TRUNCATED]` marker
- Warning logged to ContextLog
- Truncated output is still returned (first N bytes)

**Truncation Format:**
```
{first 1MB of output} [TRUNCATED] ({total_bytes} bytes)
```

**Example:**
```javascript
import { truncatePreview } from './server.guardrails.mjs';

const output = 'x'.repeat(2000000);  // 2MB
const truncated = truncatePreview(output, 1048576);
// Returns first 1MB + "[TRUNCATED] (2000000 bytes)"
```

### Retry Budget

**Configuration:**
```bash
TOOL_MAX_RETRIES=0  # No retries by default
```

**Behavior:**
- Tools can be configured to retry on failure
- Default is 0 (no retries) for safety
- If > 0, failed tools are retried up to N times
- Each retry is logged separately in ContextLog
- Exponential backoff can be applied (implementation-specific)

**Example (if enabled):**
```
Attempt 1: Error
Attempt 2: Error
Attempt 3: Success
Total retries: 2
```

**Retry Error Response:**
```json
{
  "error": "Tool failed after 3 attempts",
  "tool": "http_fetch",
  "attempts": 3,
  "last_error": "Network timeout"
}
```

### Emergency Shutdown

**Configuration:**
```bash
TOOLS_EXECUTION_ENABLED=0  # Disable ALL tools
```

**Behavior:**
- All tool execution requests are rejected immediately
- No allowlist check, no validation, no execution
- Returns clear error message
- Useful for emergency situations or maintenance

**Shutdown Error Response:**
```json
{
  "error": "tool_execution_disabled",
  "message": "Tool execution is disabled via TOOLS_EXECUTION_ENABLED=0"
}
```

---

## Rate Limiting (T22)

### Purpose

Prevent **runaway tool loops** and **resource exhaustion** by throttling requests at the API boundary.

### Algorithm

**Token Bucket:**
- Bucket holds up to `capacity` tokens
- Refills at `refillRate` tokens/second
- Each request costs `costPerRequest` tokens
- Allows burst traffic up to capacity, then enforces steady rate

### Configuration

```bash
RATE_LIMIT_ENABLED=1              # Enable (default)
RATE_LIMIT_CAPACITY=100           # Max tokens (burst size)
RATE_LIMIT_REFILL_RATE=10         # Tokens per second
RATE_LIMIT_COST_PER_REQUEST=1     # Cost per request
```

### Behavior

**Request Allowed:**
1. Refill bucket based on elapsed time
2. Check if `tokens >= costPerRequest`
3. Consume tokens
4. Add rate limit headers to response:
   ```
   X-RateLimit-Limit: 100
   X-RateLimit-Remaining: 87
   ```
5. Process request normally

**Request Denied:**
1. Refill bucket
2. Check if `tokens < costPerRequest`
3. Calculate `retryAfter = (tokensNeeded - currentTokens) / refillRate`
4. Return HTTP 429 with headers:
   ```
   Retry-After: 5
   X-RateLimit-Limit: 100
   X-RateLimit-Remaining: 0
   X-RateLimit-Reset: 1700000000
   ```
5. Log rate limit hit to metrics

**Error Response:**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 5,
  "message": "Too many requests. Please wait 5 seconds."
}
```

### Examples

**Example 1: Burst Traffic**
- Capacity: 100, Refill: 10/sec
- Send 100 requests → All succeed (bucket emptied)
- Send 101st request → HTTP 429 (bucket empty)
- Wait 10 seconds → Bucket refills to 100
- Send 100 more → All succeed

**Example 2: Sustained Traffic**
- Capacity: 100, Refill: 10/sec
- Send 10 requests/sec → All succeed indefinitely
- Send 15 requests/sec → First 100 succeed, then 10/sec succeeds, 5/sec fails

**Example 3: Bursty Workload**
- Send 50 requests → All succeed (50 tokens left)
- Wait 5 seconds → Bucket refills to 100 (capped at capacity)
- Send 100 requests → All succeed (burst allowed)

### Metrics

**Check Metrics:**
```bash
curl http://localhost:3000/api/rate_limit/metrics
```

**Response:**
```json
{
  "enabled": true,
  "hits": 12,                    // Number of 429 responses
  "totalRequests": 1543,         // Total requests processed
  "totalTokensConsumed": 1531,   // Total tokens consumed
  "currentTokens": 87,           // Current tokens available
  "capacity": 100,
  "refillRate": 10,
  "costPerRequest": 1
}
```

### Tuning

**High-Volume Use Case:**
```bash
RATE_LIMIT_CAPACITY=500        # Allow larger bursts
RATE_LIMIT_REFILL_RATE=50      # Higher sustained rate
```

**Low-Volume/High-Security:**
```bash
RATE_LIMIT_CAPACITY=20         # Small bursts
RATE_LIMIT_REFILL_RATE=2       # Strict sustained rate
```

**Development:**
```bash
RATE_LIMIT_ENABLED=0           # Disable (not recommended)
```

---

## Sensitive Data Redaction (T21)

### Purpose

Prevent **API keys, credentials, PII, and secrets** from appearing in logs and diagnostics.

### Implementation

**File:** `frontend/server.guardrails.mjs`

### Redaction Patterns

**API Keys & Tokens (20+ patterns):**

| Pattern | Example | Redacted |
|---------|---------|----------|
| Stripe Live Key | `sk_live_1234567890abcd` | `<redacted:stripe-live-key>` |
| Stripe Test Key | `sk_test_abcdef123456` | `<redacted:stripe-test-key>` |
| OpenAI Key | `sk-abc123def456` | `<redacted:openai-key>` |
| Anthropic Key | `sk-ant-xyz789` | `<redacted:anthropic-key>` |
| AWS Access Key | `AKIAIOSFODNN7EXAMPLE` | `<redacted:aws-access-key>` |
| AWS Secret Key | `aws_secret_access_key=wJalrXUtnFEMI/...` | `<redacted:aws-secret-key>` |
| Google API Key | `AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI` | `<redacted:google-api-key>` |
| GitHub PAT | `ghp_1234567890abcdef` | `<redacted:github-pat>` |
| GitHub PAT v2 | `github_pat_abc123...` | `<redacted:github-pat-v2>` |
| JWT Token | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c` | `<redacted:jwt-token>` |

**SSH Keys:**
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
```
→ `<redacted:ssh-private-key>`

**Passwords:**
```
password=secret123
```
→ `password=<redacted:password>`

**Database Connections:**
```
postgresql://user:pass@localhost/db
```
→ `postgresql://<redacted:db-creds>@localhost/db`

**URLs with Credentials:**
```
https://user:pass@example.com/api
```
→ `https://<redacted:url-creds>@example.com/api`

**Credit Cards:**
```
4111111111111111
```
→ `<redacted:credit-card>`

**Emails:**
```
alice@example.com
```
→ `<redacted:email>`

**Phone Numbers:**
```
(555) 123-4567
```
→ `<redacted:phone>`

**SSN:**
```
123-45-6789
```
→ `<redacted:ssn>`

**Environment Variables:**
```
OPENAI_API_KEY=sk-abc123
```
→ `OPENAI_API_KEY=<redacted:env-secret>`

### Recursive Redaction

**Handles nested objects and arrays:**

**Input:**
```json
{
  "user": {
    "email": "alice@example.com",
    "password": "secret123",
    "api_keys": [
      "sk-live-abc123",
      "ghp_xyz789"
    ]
  },
  "config": {
    "db_url": "postgresql://user:pass@localhost/db"
  }
}
```

**Output:**
```json
{
  "user": {
    "email": "<redacted:email>",
    "password": "<redacted>",
    "api_keys": [
      "<redacted:stripe-live-key>",
      "<redacted:github-pat>"
    ]
  },
  "config": {
    "db_url": "postgresql://<redacted:db-creds>@localhost/db"
  }
}
```

### Key-Based Redaction

**Automatically redacts values for sensitive field names:**

**Sensitive Keys:**
```javascript
const sensitiveKeys = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'auth_token', 'bearer', 'authorization',
  'private_key', 'secret_key', 'encryption_key', 'ssn', 'credit_card',
  'cvv', 'pin', 'otp', 'session_id', 'cookie', 'jwt', 'credentials'
];
```

**Example:**
```json
{
  "api_key": "any_value_here",
  "password": "any_password"
}
```
→
```json
{
  "api_key": "<redacted>",
  "password": "<redacted>"
}
```

### Configuration

**Max Preview Size:**
```bash
TOOLS_LOG_MAX_PREVIEW=4096  # Max bytes before truncation
```

**Aggressive Mode (optional):**
```javascript
// Redact any 32+ character alphanumeric strings
import { redactForLogging } from './server.guardrails.mjs';

const redacted = redactForLogging(data, { aggressive: true });
// Redacts: "abc123def456ghi789jkl012mno345pqr678" → "<redacted:long-string>"
```

### Usage

**Basic Redaction:**
```javascript
import { redactForLogging } from './server.guardrails.mjs';

const data = {
  user: 'alice',
  api_key: 'sk-live-abc123'
};

const safe = redactForLogging(data);
// {
//   user: 'alice',
//   api_key: '<redacted:stripe-live-key>'
// }
```

**With Truncation:**
```javascript
const largeData = 'x'.repeat(10000);
const safe = redactForLogging(largeData, { maxBytes: 1000 });
// Returns first 1000 bytes + " [TRUNCATED] (10000 bytes)"
```

**Check for Sensitive Data:**
```javascript
import { containsSensitiveData } from './server.guardrails.mjs';

if (containsSensitiveData(input)) {
  console.warn('Sensitive data detected!');
}
```

### Best Practices

1. **Redact at Logging Boundary**: Execution receives unredacted data, only logs are redacted
2. **Preserve Structure**: Redaction maintains object/array structure for debuggability
3. **Never Log Raw**: Always use `redactForLogging()` before logging user input or tool output
4. **Test Patterns**: Add test cases for new sensitive patterns
5. **Monitor Logs**: Periodically audit logs to ensure no leakage

---

## ContextLog Persistence (T12)

### Purpose

Provide **complete audit trail** of all tool executions with correlation IDs for end-to-end tracing.

### Implementation

**Files:**
- `frontend/server.contextlog.mjs` - Event logging
- `frontend/server.tools.mjs` - Tool execution integration

### Event Schema

**Tool Execution Event:**
```json
{
  "id": "evt_abc123",
  "ts": "2025-11-16T15:30:45.123Z",
  "actor": "tool",
  "act": "execute",
  "conv_id": "conv_456",
  "trace_id": "trace_xyz",
  "iter": 1,
  "name": "get_time",
  "status": "ok",
  "elapsed_ms": 12,
  "args_preview": "{}",
  "result_preview": "2025-11-16T15:30:45.123Z",
  "bytes": 24
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID (`evt_` prefix) |
| `ts` | ISO 8601 | Event timestamp (UTC) |
| `actor` | string | Event source (`tool`, `user`, `agent`) |
| `act` | string | Action type (`execute`, `error`, `timeout`) |
| `conv_id` | string | Conversation ID for grouping related events |
| `trace_id` | string | Trace ID for distributed tracing |
| `iter` | number | Iteration number in tool loop |
| `name` | string | Tool name |
| `status` | string | Status (`ok`, `error`, `timeout`) |
| `elapsed_ms` | number | Execution duration (milliseconds) |
| `args_preview` | string | Redacted argument preview (truncated) |
| `result_preview` | string | Redacted result preview (truncated) |
| `bytes` | number | Total output size (bytes) |

### Event Phases

**1. Start Phase:**
```json
{
  "id": "evt_start_123",
  "ts": "2025-11-16T15:30:45.000Z",
  "actor": "tool",
  "act": "execute_start",
  "name": "http_fetch",
  "args_preview": "{\"url\":\"https://api.example.com\"}"
}
```

**2. Finish Phase (Success):**
```json
{
  "id": "evt_finish_123",
  "ts": "2025-11-16T15:30:45.123Z",
  "actor": "tool",
  "act": "execute",
  "name": "http_fetch",
  "status": "ok",
  "elapsed_ms": 123,
  "result_preview": "{\"status\":200,\"data\":...}",
  "bytes": 4567
}
```

**3. Error Phase:**
```json
{
  "id": "evt_error_123",
  "ts": "2025-11-16T15:30:50.000Z",
  "actor": "tool",
  "act": "error",
  "name": "http_fetch",
  "status": "error",
  "error_type": "timeout",
  "error": "Tool execution timed out after 30000ms",
  "elapsed_ms": 30000
}
```

### Storage

**Directory:**
```
.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl
```

**Rotation:**
- Hourly rotation based on filename
- Max file size: 10MB (configurable via `FGK_CONTEXTLOG_MAX_BYTES`)
- Retention: 7 days default (configurable)

**Example Files:**
```
.forgekeeper/context_log/
  ctx-20251116-14.jsonl  (10:00-10:59 AM events)
  ctx-20251116-15.jsonl  (11:00-11:59 AM events)
  ctx-20251116-16.jsonl  (12:00-12:59 PM events)
```

### Querying

**Tail Recent Events:**
```bash
tail -f .forgekeeper/context_log/ctx-*.jsonl | grep tool
```

**Filter by Tool:**
```bash
grep '"name":"http_fetch"' .forgekeeper/context_log/*.jsonl
```

**API Query:**
```bash
curl http://localhost:3000/api/tools/executions?limit=10
```

**Response:**
```json
{
  "executions": [
    {
      "id": "evt_abc123",
      "timestamp": "2025-11-16T15:30:45.123Z",
      "tool": "get_time",
      "status": "ok",
      "elapsed_ms": 12
    }
  ],
  "total": 10
}
```

**Filter by Conversation:**
```bash
curl http://localhost:3000/api/tools/executions?conv_id=conv_456
```

**Filter by Trace:**
```bash
curl http://localhost:3000/api/tools/executions?trace_id=trace_xyz
```

### Correlation IDs

**Conversation ID (`conv_id`):**
- Groups all events in a single conversation
- Persists across multiple requests/responses
- Generated when conversation starts
- Useful for debugging multi-turn interactions

**Trace ID (`trace_id`):**
- Unique per request
- Links request → tool calls → response
- Useful for distributed tracing
- Follows OpenTelemetry conventions

**Example Flow:**
```
Request (trace_xyz) → conv_456
  ├─ Tool Call 1: get_time (trace_xyz, conv_456, iter=1)
  ├─ Tool Call 2: read_file (trace_xyz, conv_456, iter=2)
  └─ Response (trace_xyz, conv_456)

Next Request (trace_abc) → conv_456
  ├─ Tool Call 3: http_fetch (trace_abc, conv_456, iter=1)
  └─ Response (trace_abc, conv_456)
```

**Query All Events for Conversation:**
```bash
jq 'select(.conv_id=="conv_456")' .forgekeeper/context_log/*.jsonl
```

### Integration with UI

**DiagnosticsDrawer** (bottom-right of chat):
- Shows recent tool executions
- Status badges (success/error/timeout)
- Timing information
- Redacted argument/result previews
- Click to expand full details

**Screenshot:**
```
┌─────────────────────────────────────┐
│ Diagnostics                         │
├─────────────────────────────────────┤
│ ✅ get_time               12ms      │
│ ✅ read_file             45ms      │
│ ❌ http_fetch          30000ms     │
│    Error: Timeout                   │
└─────────────────────────────────────┘
```

---

## System Prompts (T28)

### Purpose

Provide AI agents with **clear guidance on tool eligibility, guardrails, and failure-handling expectations**.

### Implementation

**Files:**
- `docs/prompts/system_prompt.md` - Prompt templates
- `forgekeeper/llm/tool_usage.py` - Python implementation

### Prompt Modes

**Tool-Enabled Mode (Default):**
```bash
TOOL_PROMPT_INCLUDE_GUARDRAILS=1
TOOL_PROMPT_VARIANT=enabled
```

Includes:
- List of all 19 allowed tools
- Argument schemas and validation rules
- Timeout limits (30s default)
- Output size limits (1MB default)
- Rate limiting behavior (429 responses)
- Redaction notice
- Error recovery strategies
- Best practices

**Tool-Disabled Mode:**
```bash
TOOL_PROMPT_INCLUDE_GUARDRAILS=0
TOOL_PROMPT_VARIANT=disabled
```

Includes:
- Only tool signatures (name, description, parameters)
- No guardrail documentation
- Minimal prompt footprint

### Example Prompt Content

**Tool-Enabled Mode:**
```markdown
# Available Tools

You have access to the following 19 tools. All tool calls are subject to guardrails:

## Guardrails

1. **Allowlist**: Only these 19 tools are allowed. Attempting to call other tools will fail.

2. **Validation**: All arguments are validated against schemas. Ensure you provide:
   - Correct types (string, number, boolean, object, array)
   - Required arguments
   - Values within length/range limits

3. **Timeouts**: Tool execution is limited to 30 seconds. Long-running operations will timeout.

4. **Rate Limiting**: Requests are rate-limited (100 burst, 10/sec sustained). If you receive HTTP 429, wait for the Retry-After duration before retrying.

5. **Output Limits**: Tool output is limited to 1MB. Larger outputs will be truncated.

6. **Redaction**: Sensitive data (API keys, passwords, etc.) is automatically redacted from logs.

## Error Recovery

- **Tool Not Allowed**: Check the allowlist and use a different approach.
- **Validation Error**: Review the error message and correct argument types/values.
- **Timeout**: Optimize the operation or break into smaller steps.
- **Rate Limit**: Wait for the specified duration, then retry.

## Tools

### echo
**Description:** Echo back the provided text
**Arguments:**
- `text` (string, required, max 10000 chars)
**Returns:** string

[... 18 more tools ...]
```

### Usage in Python

```python
from forgekeeper.llm.tool_usage import render_tool_developer_message
from forgekeeper.config import TOOL_PROMPT_INCLUDE_GUARDRAILS

# Use config-driven mode
message = render_tool_developer_message(
    tools=tool_definitions,
    include_guardrails=TOOL_PROMPT_INCLUDE_GUARDRAILS
)

# Explicit override
message = render_tool_developer_message(
    tools=tool_definitions,
    include_guardrails=True  # Force guardrails
)
```

### Benefits

1. **Agent Awareness**: AI knows about limits before calling tools
2. **Better Error Handling**: AI can anticipate and recover from errors
3. **Reduced Retries**: AI provides correct arguments on first try
4. **Improved UX**: Fewer frustrating error loops

---

## UI Feedback (T29)

### Purpose

Provide **real-time visual feedback** for tool execution status, errors, and actions.

### Implementation

**Files:**
- `frontend/src/components/DiagnosticsDrawer.tsx` - UI component
- `frontend/src/components/Chat.tsx` - Integration

### Status Badges

**Success:**
```
✅ get_time (12ms)
```

**Error:**
```
❌ http_fetch (30000ms)
   Error: Timeout
```

**In Progress:**
```
⏳ read_file (...)
```

**Warning:**
```
⚠️ git_push (2500ms)
   Warning: Rate limit approaching
```

### Error Actions

**Actionable Errors:**

| Error | Action Button | Behavior |
|-------|---------------|----------|
| Rate Limit Exceeded | "Wait {n}s" | Countdown timer, auto-retry |
| Tool Not Allowed | "View Allowlist" | Opens modal with allowed tools |
| Validation Error | "Fix Arguments" | Shows schema and error details |
| Timeout | "Optimize" | Provides optimization tips |

**Example:**
```
┌─────────────────────────────────────┐
│ ❌ http_fetch                       │
│    Error: Rate limit exceeded       │
│    [Wait 5s] [View Metrics]         │
└─────────────────────────────────────┘
```

### Integration Points

**DiagnosticsDrawer:**
- Real-time updates from ContextLog
- Displays last 10 tool executions
- Expandable details
- Copy-to-clipboard for debugging

**Chat Transcript:**
- Inline status badges for tool calls
- Error messages with context
- Success confirmations

**Notification System:**
- Toast notifications for errors
- Persistent for critical errors
- Dismissible for warnings

---

## Configuration Summary

**Quick Reference Table:**

| Variable | Default | Purpose | Layer |
|----------|---------|---------|-------|
| `TOOLS_EXECUTION_ENABLED` | `1` | Global tool toggle | T11 |
| `TOOL_TIMEOUT_MS` | `30000` | Execution timeout | T11 |
| `TOOL_MAX_RETRIES` | `0` | Retry budget | T11 |
| `TOOL_MAX_OUTPUT_BYTES` | `1048576` | Output size limit | T11 |
| `TOOL_ALLOW` | (19 tools) | Allowlist override | T11 |
| `RATE_LIMIT_ENABLED` | `1` | Rate limiting toggle | T22 |
| `RATE_LIMIT_CAPACITY` | `100` | Burst size | T22 |
| `RATE_LIMIT_REFILL_RATE` | `10` | Tokens/second | T22 |
| `RATE_LIMIT_COST_PER_REQUEST` | `1` | Cost per request | T22 |
| `TOOLS_LOG_MAX_PREVIEW` | `4096` | Max preview size | T21 |
| `FGK_CONTEXTLOG_DIR` | `.forgekeeper/context_log` | Log directory | T12 |
| `FGK_CONTEXTLOG_MAX_BYTES` | `10485760` | Max file size | T12 |
| `TOOL_PROMPT_INCLUDE_GUARDRAILS` | `1` | System prompt mode | T28 |
| `TOOLS_FS_ROOT` | `.forgekeeper/sandbox` | Sandbox root | T11 |
| `FRONTEND_ENABLE_BASH` | `0` | Enable bash tool | T11 |
| `FRONTEND_ENABLE_POWERSHELL` | `0` | Enable PowerShell tool | T11 |

---

## Monitoring & Metrics

### ContextLog Analysis

**Count Tool Calls:**
```bash
grep '"actor":"tool"' .forgekeeper/context_log/*.jsonl | wc -l
```

**Count Errors:**
```bash
grep '"status":"error"' .forgekeeper/context_log/*.jsonl | wc -l
```

**Average Execution Time:**
```bash
jq -r 'select(.actor=="tool") | .elapsed_ms' .forgekeeper/context_log/*.jsonl | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

**Top 5 Tools:**
```bash
jq -r 'select(.actor=="tool") | .name' .forgekeeper/context_log/*.jsonl | \
  sort | uniq -c | sort -rn | head -5
```

### Rate Limit Metrics

**API Endpoint:**
```bash
curl http://localhost:3000/api/rate_limit/metrics
```

**Response:**
```json
{
  "enabled": true,
  "hits": 12,
  "totalRequests": 1543,
  "totalTokensConsumed": 1531,
  "currentTokens": 87,
  "capacity": 100,
  "refillRate": 10,
  "costPerRequest": 1
}
```

**Metrics Dashboard:**
- Hit rate: `hits / totalRequests`
- Utilization: `(capacity - currentTokens) / capacity`
- Refill pressure: `totalRequests / (time_elapsed * refillRate)`

### Scout Metrics

**API Endpoint:**
```bash
curl http://localhost:3000/api/scout/metrics
```

**Response:**
```json
{
  "tools": {
    "get_time": {
      "count": 123,
      "avg_ms": 12,
      "p50_ms": 10,
      "p95_ms": 18,
      "p99_ms": 25,
      "errors": 2
    }
  }
}
```

### Alerting Thresholds

**Recommended Alerts:**

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Error rate | > 5% | Warning | Investigate logs |
| Error rate | > 20% | Critical | Disable tools |
| Rate limit hit rate | > 10% | Warning | Increase capacity |
| Avg execution time | > 5000ms | Warning | Optimize tools |
| Timeout rate | > 1% | Warning | Increase timeout or optimize |

---

## Best Practices

### Development

1. **Test Locally First**: Always test tools in local environment before deploying
2. **Use Read-Only Tools**: Prefer read-only tools during development (echo, get_time, read_file)
3. **Disable Rate Limiting**: Set `RATE_LIMIT_ENABLED=0` for local testing (re-enable for staging/prod)
4. **Monitor ContextLog**: Tail logs during development to catch issues early
5. **Test Edge Cases**: Test with missing args, invalid types, oversized inputs

### Production

1. **Enable All Guardrails**: Never disable execution limits, rate limiting, or redaction in production
2. **Conservative Limits**: Start with smaller timeouts/capacities, increase if needed
3. **Monitor Metrics**: Set up alerting for error rates and rate limit hits
4. **Regular Audits**: Review ContextLog weekly for anomalies
5. **Rotate Logs**: Configure log retention to prevent disk exhaustion

### Security

1. **Minimal Allowlist**: Only include tools you actually need
2. **Gate Shell Tools**: Keep `FRONTEND_ENABLE_BASH=0` unless absolutely necessary
3. **Audit Log Access**: Restrict access to ContextLog files
4. **Test Redaction**: Verify sensitive data is redacted before deploying new patterns
5. **Review Tool Code**: Audit tool implementations for security vulnerabilities

### Performance

1. **Optimize Tools**: Keep tool execution < 1 second when possible
2. **Batch Operations**: Prefer batch operations over many individual tool calls
3. **Cache Results**: Cache expensive tool results when appropriate
4. **Async Tools**: Use async/await for I/O-bound operations
5. **Monitor P95/P99**: Track tail latencies to catch performance regressions

### Debugging

1. **Check ContextLog First**: Start with ContextLog when debugging tool issues
2. **Use Correlation IDs**: Filter by `conv_id` or `trace_id` to trace specific flows
3. **Enable Debug Logging**: Set `LOG_LEVEL=debug` for verbose output
4. **Test in Isolation**: Use curl/Postman to test individual tool endpoints
5. **Review Redaction**: If debugging redaction issues, temporarily disable to see raw data (local only!)

---

**Last Updated:** 2025-11-16
**Milestone:** M1 - Tool Hardening Complete
**Tasks:** T11, T12, T21, T22, T28, T29, T30

**Next:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common errors and solutions
