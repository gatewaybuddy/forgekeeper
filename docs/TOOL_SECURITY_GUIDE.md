# Tool Security Guide (T30)

**Date**: 2025-11-07
**Status**: Production-Ready
**Scope**: M1 Tool Integration & Guardrails

---

## Overview

Forgekeeper's tool execution system is hardened with **defense-in-depth security** across multiple layers:

1. **Allowlist Enforcement** - Only approved tools can execute
2. **Sensitive Data Redaction** - Comprehensive pattern matching for secrets
3. **Rate Limiting** - Per-tool and per-IP request throttling
4. **Error Tracking** - Automatic rollback after repeated failures
5. **Regression Detection** - Auto-revert on performance degradation
6. **Resource Quotas** - CPU, memory, and disk limits
7. **Audit Trail** - Complete ContextLog integration

---

## Security Layers

### Layer 1: Allowlist Enforcement

**Configuration**:
```bash
# In .env
TOOL_ALLOW=read_file,write_file,run_bash,get_time
```

**Behavior**:
- If `TOOL_ALLOW` is empty/unset: **All tools allowed**
- If set: **Only listed tools allowed**
- Unauthorized tool calls return: `Tool not allowed by policy: {name}`

**Example**:
```javascript
// User tries to call a tool not in allowlist
await runTool('delete_everything', { path: '/' });
// Error: Tool not allowed by policy: delete_everything
```

**Best Practices**:
- Use explicit allowlist in production
- Start with minimal set (read_file, run_bash)
- Add tools as needed
- Document why each tool is approved

---

### Layer 2: Sensitive Data Redaction (T21 - ENHANCED)

**File**: `frontend/server.guardrails.mjs`

**Comprehensive Pattern Matching**:

#### API Keys & Service Tokens
- **Stripe**: `sk_live_*`, `sk_test_*`, `pk_live_*`
- **OpenAI**: `sk-*` (20+ chars)
- **Anthropic**: `sk-ant-*` (95+ chars)
- **AWS**: `AKIA*` (access keys), `aws_secret_access_key=*`
- **Google**: `AIza*` (35+ chars), `ya29.*` (OAuth)
- **GitHub**: `ghp_*`, `gho_*`, `github_pat_*` (PATs)

#### Credentials
- **Passwords**: `password=*`, `pwd=*`, `passwd=*`
- **Bearer Tokens**: `Bearer *`
- **JWT Tokens**: Three base64 segments (e.g., `eyJ*.eyJ*.*`)
- **SSH Keys**: `-----BEGIN PRIVATE KEY-----` blocks
- **Database URLs**: `mongodb://user:pass@`, `postgres://user:pass@`
- **HTTP Basic Auth**: `https://user:pass@`

#### PII (Personally Identifiable Information)
- **Email Addresses**: `user@example.com`
- **Phone Numbers**: US formats `(123) 456-7890`, `123-456-7890`
- **Credit Cards**: Visa, MasterCard, Amex, Discover patterns
- **SSN**: `123-45-6789`

#### Environment Secrets
- **OpenAI API Key**: `OPENAI_API_KEY=*`
- **Anthropic API Key**: `ANTHROPIC_API_KEY=*`
- **Database URLs**: `DATABASE_URL=*`
- **Session Secrets**: `SESSION_SECRET=*`, `JWT_SECRET=*`

**Functions**:
```javascript
// Basic redaction (string or object)
redactPreview(input, aggressive = false)

// Deep object redaction (recursive)
redactObject(obj, sensitiveKeys = null)

// Check if input contains sensitive data
containsSensitiveData(input) // returns boolean
```

**Example**:
```javascript
const input = {
  apiKey: 'sk-abc123xyz789',
  email: 'user@example.com',
  password: 'secret123'
};

const redacted = redactPreview(input);
// Output: {"apiKey":"<redacted:openai-key>","email":"<redacted:email>","password":"<redacted:password>"}
```

**Automatic Application**:
- ✅ Tool arguments → ContextLog
- ✅ Tool results → ContextLog
- ✅ Error messages → Logs
- ✅ Audit trail → JSONL files

---

### Layer 3: Rate Limiting (T22)

**Configuration**:
```bash
# Global API rate limit (per IP)
API_RATE_PER_MIN=60

# Per-tool rate limit
TOOL_RATE_LIMIT_PER_MIN=30
```

**Behavior**:
- **Per-IP limiting**: 60 requests/min across all endpoints
- **Per-tool limiting**: 30 requests/min per tool
- **Token bucket algorithm**: Refills at fixed rate
- **Graceful degradation**: Returns `429 Too Many Requests` with `Retry-After` header

**Error Response**:
```json
{
  "error": "Rate limit exceeded for tool read_file: 31/30 requests in last minute. Reset in 23s"
}
```

**Bypass** (for local dev):
```bash
API_RATE_PER_MIN=0  # Disables rate limiting
```

---

### Layer 4: Error Tracking & Auto-Rollback

**Configuration**:
```bash
TOOL_ERROR_THRESHOLD=3          # Errors before rollback
TOOL_ERROR_WINDOW_MS=300000     # 5-minute window
```

**Behavior**:
- Tracks errors per tool
- After 3 errors in 5 minutes → **Automatic rollback**
- Restores tool from git history
- Notifies user: `Tool {name} has been automatically reverted due to repeated failures`

**Example Flow**:
```
1. Tool fails with error → Count: 1
2. Tool fails again → Count: 2
3. Tool fails third time → Count: 3 → ROLLBACK TRIGGERED
4. Tool reverted to previous working version
5. Error count reset
```

---

### Layer 5: Regression Detection

**Configuration**:
```bash
REGRESSION_CHECK_ENABLED=1
REGRESSION_LATENCY_MS=50           # Latency increase threshold (+50ms)
REGRESSION_ERROR_RATE=0.05         # Error rate increase (+5%)
REGRESSION_WINDOW_SIZE=10          # Recent executions to track
REGRESSION_BASELINE_SIZE=20        # Baseline size
```

**Metrics Tracked**:
- **Latency**: Average execution time
- **Error Rate**: Percentage of failed executions
- **Baseline**: First 20 executions establish normal behavior
- **Recent Window**: Last 10 executions compared to baseline

**Automatic Actions**:
- Latency increase > 50ms → Warn + auto-revert
- Error rate increase > 5% → Warn + auto-revert
- Logs violation details to ContextLog

**Example**:
```
Baseline: avg latency 100ms, error rate 2%
Recent:   avg latency 180ms, error rate 8%

→ Latency increased by 80ms (threshold: 50ms) ✗
→ Error rate increased by 6% (threshold: 5%) ✗
→ REGRESSION DETECTED → AUTO-REVERT
```

---

### Layer 6: Resource Quotas

**Configuration**:
```bash
RESOURCE_QUOTAS_ENABLED=1
TOOL_DISK_QUOTA_BYTES=10485760     # 10 MB per tool
TOOL_MEMORY_LIMIT_MB=512            # 512 MB per tool
TOOL_CPU_TIMEOUT_MS=30000           # 30 second timeout
```

**Limits Enforced**:
- **Disk**: Max bytes written per tool
- **Memory**: Max memory usage (process-level)
- **CPU**: Max execution time (kills process after timeout)
- **Requests**: Max requests per minute (see rate limiting)

**Exceeded Quota Response**:
```json
{
  "error": "Disk quota exceeded for tool write_file: 10.5 MB / 10 MB"
}
```

---

### Layer 7: Audit Trail (ContextLog)

**Events Logged**:
```jsonl
{"id":"...","ts":"...","actor":"assistant","act":"tool_call","tool":"read_file","args_preview":"<redacted>","status":"ok"}
{"id":"...","ts":"...","actor":"tool","act":"tool_result","tool":"read_file","result_preview":"[TRUNCATED] (4521 bytes)","elapsed_ms":42}
```

**Event Fields**:
- `id`: Unique event ID (ULID)
- `ts`: ISO 8601 timestamp
- `actor`: `assistant`, `tool`, `system`
- `act`: `tool_call`, `tool_result`, `error`
- `tool`: Tool name
- `args_preview`: **Redacted** arguments
- `result_preview`: **Truncated** result
- `status`: `ok`, `error`
- `elapsed_ms`: Execution time
- `conv_id`: Conversation ID
- `trace_id`: Trace ID

**Access Logs**:
```bash
# Tail recent events
curl http://localhost:3000/api/ctx/tail?n=50

# Filter by conversation
curl http://localhost:3000/api/ctx/tail?n=50&conv_id=abc123

# View on disk
tail -f .forgekeeper/context_log/ctx-*.jsonl
```

---

## Configuration Examples

### Production (Maximum Security)
```bash
# Strict allowlist
TOOL_ALLOW=read_file,read_dir,get_time

# Rate limiting enabled
API_RATE_PER_MIN=30
TOOL_RATE_LIMIT_PER_MIN=10

# Error tracking enabled
TOOL_ERROR_THRESHOLD=3
TOOL_ERROR_WINDOW_MS=300000

# Regression detection enabled
REGRESSION_CHECK_ENABLED=1

# Resource quotas enabled
RESOURCE_QUOTAS_ENABLED=1
TOOL_DISK_QUOTA_BYTES=5242880  # 5 MB
TOOL_CPU_TIMEOUT_MS=15000      # 15 seconds
```

### Development (Balanced)
```bash
# Allow common tools
TOOL_ALLOW=read_file,write_file,read_dir,run_bash,get_time

# Moderate rate limiting
API_RATE_PER_MIN=60
TOOL_RATE_LIMIT_PER_MIN=30

# Error tracking enabled
TOOL_ERROR_THRESHOLD=5

# Regression detection enabled (relaxed)
REGRESSION_CHECK_ENABLED=1
REGRESSION_LATENCY_MS=100

# Standard quotas
RESOURCE_QUOTAS_ENABLED=1
```

### Local Sandbox (Permissive)
```bash
# All tools allowed
# TOOL_ALLOW= (unset)

# No rate limiting
API_RATE_PER_MIN=0

# Error tracking enabled (for observability)
TOOL_ERROR_THRESHOLD=10

# Regression detection disabled
REGRESSION_CHECK_ENABLED=0

# Quotas disabled
RESOURCE_QUOTAS_ENABLED=0
```

---

## Tool Usage Patterns

### Safe Tools (Always Allow)
- `get_time` - Read-only, no side effects
- `read_dir` - List directory contents
- `read_file` - Read file contents (with size limits)
- `echo` - Simple echo for testing

### Moderate Risk (Allow with Caution)
- `write_file` - Can modify files (use with sandbox root)
- `run_bash` - Shell command execution (restrict to safe commands)
- `http_fetch` - HTTP requests (can expose internal services)

### High Risk (Production: Disallow)
- `git_commit` - Modifies repository
- `git_push` - External network access
- `self_update` - Modifies tool code
- Any tool with `sudo` or elevated privileges

---

## Troubleshooting

### Tool Call Fails with "Not Allowed"
```
Error: Tool not allowed by policy: some_tool
```
**Solution**: Add tool to `TOOL_ALLOW` in `.env`:
```bash
TOOL_ALLOW=existing_tools,some_tool
```

### Rate Limit Exceeded
```
Error: Rate limit exceeded for tool read_file: 31/30 requests
```
**Solutions**:
1. Wait for reset (shown in error message)
2. Increase limit: `TOOL_RATE_LIMIT_PER_MIN=60`
3. Disable (local dev): `API_RATE_PER_MIN=0`

### Tool Auto-Reverted
```
Tool has been automatically reverted due to repeated failures
```
**Investigate**:
1. Check logs: `.forgekeeper/context_log/`
2. Review error patterns
3. Fix underlying issue
4. Test manually before re-enabling

### Redacted Data Needed for Debug
```
args_preview: <redacted:api-credential>
```
**Options**:
1. Check original logs (pre-redaction) on secure system
2. Temporarily disable redaction (local dev only)
3. Use structured logging with separate secure storage

---

## API Reference

### Redaction Functions

#### `redactPreview(input, aggressive)`
Redacts sensitive data from input.

**Parameters**:
- `input` (string | object): Data to redact
- `aggressive` (boolean): Enable aggressive mode (redacts 32+ char strings)

**Returns**: Redacted string (truncated to 4KB)

**Example**:
```javascript
import { redactPreview } from './server.guardrails.mjs';

const args = { apiKey: 'sk-abc123', email: 'user@test.com' };
const safe = redactPreview(args);
// {"apiKey":"<redacted:openai-key>","email":"<redacted:email>"}
```

#### `redactObject(obj, sensitiveKeys)`
Deep redaction for nested objects.

**Parameters**:
- `obj` (object): Object to redact
- `sensitiveKeys` (string[]): Additional keys to redact

**Returns**: New object with redacted values

**Example**:
```javascript
import { redactObject } from './server.guardrails.mjs';

const data = {
  user: { name: 'Alice', password: 'secret' },
  config: { apiKey: 'key123' }
};
const safe = redactObject(data);
// { user: { name: 'Alice', password: '<redacted>' }, config: { apiKey: '<redacted>' } }
```

#### `containsSensitiveData(input)`
Check if input contains sensitive patterns.

**Parameters**:
- `input` (string | object): Data to check

**Returns**: boolean

**Example**:
```javascript
import { containsSensitiveData } from './server.guardrails.mjs';

if (containsSensitiveData(userInput)) {
  console.warn('Sensitive data detected - applying extra scrutiny');
}
```

---

## Best Practices

### For Developers

1. **Use Redaction Everywhere**
   ```javascript
   // ✅ Good
   console.log('Args:', redactPreview(args));

   // ❌ Bad
   console.log('Args:', args);  // May leak secrets
   ```

2. **Test with Real Patterns**
   ```javascript
   // Test your redaction logic
   const testData = {
     apiKey: 'sk-test_4eC39HqLyjWDarjtT1zdp7dc',
     email: 'test@example.com'
   };
   assert(containsSensitiveData(testData));
   assert(!redactPreview(testData).includes('sk-test'));
   ```

3. **Monitor Error Rates**
   - Check `.forgekeeper/context_log/` regularly
   - Set up alerts for error spikes
   - Review rollback events

4. **Start Strict, Loosen Gradually**
   - Begin with minimal `TOOL_ALLOW`
   - Add tools as needed
   - Document each addition

### For Operations

1. **Production Checklist**
   - [ ] `TOOL_ALLOW` set explicitly
   - [ ] `REGRESSION_CHECK_ENABLED=1`
   - [ ] `RESOURCE_QUOTAS_ENABLED=1`
   - [ ] Rate limiting configured
   - [ ] Logs monitored

2. **Incident Response**
   - Rollback triggered → Investigate logs
   - Rate limit hit → Check for abuse/loops
   - Sensitive data exposed → Rotate credentials

3. **Regular Reviews**
   - Weekly: Review error rates
   - Monthly: Audit tool usage patterns
   - Quarterly: Update allowlists

---

## References

- **Task Cards**: T11, T21, T22 in `tasks.md`
- **Implementation**: `frontend/server.tools.mjs`, `frontend/server.guardrails.mjs`
- **Architecture**: `CLAUDE.md` (Tool Integration section)
- **ContextLog**: `docs/contextlog/adr-0001-contextlog.md`

---

**Status**: Production-ready security implementation
**Last Updated**: 2025-11-07
**Next Review**: 2025-12-07
