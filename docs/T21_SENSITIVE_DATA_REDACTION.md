# T21: Sensitive Data Redaction

**Status**: ✅ Complete
**Task ID**: T21
**Implementation Date**: 2025-11-16

---

## Overview

T21 implements comprehensive sensitive data redaction for tool arguments and results before logging. This ensures that API keys, credentials, PII, and other sensitive information never appear in plain text in logs, telemetry, or the ContextLog.

**Key Principle**: Tool execution receives unredacted arguments (necessary for functionality), but all log previews are redacted at the logging boundary.

---

## Features

### 1. Comprehensive Pattern Matching

The redaction system includes patterns for:

- **API Keys & Service Tokens**:
  - Stripe: `sk_live_*`, `sk_test_*`, `pk_live_*`
  - OpenAI: `sk-*` (20+ chars)
  - Anthropic: `sk-ant-*`
  - AWS: `AKIA*` access keys, secret access keys
  - Google: `AIza*` API keys, `ya29.*` OAuth tokens
  - GitHub: `ghp_*`, `gho_*`, `github_pat_*`
  - Generic: `api_key=*`, `auth_token=*`, `Bearer *`

- **Authentication & Secrets**:
  - JWT tokens (3-segment base64)
  - SSH private keys (BEGIN/END markers)
  - Passwords in various formats (`password=*`, `passwd:*`, `pwd=*`)
  - Database connection strings with credentials
  - URLs with embedded credentials (`https://user:pass@host`)

- **Personal Information**:
  - Email addresses
  - Credit card numbers (Visa, MasterCard, Amex, Discover)
  - Phone numbers (US format)
  - Social Security Numbers

- **Environment Variables**:
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`
  - `DATABASE_URL`, `DB_PASSWORD`, `REDIS_PASSWORD`
  - `SESSION_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`

### 2. Recursive Object/Array Handling

The `redactSensitiveData()` function recursively processes:
- **Strings**: Pattern-based redaction using regex
- **Objects**: Recursively redact all values, with special handling for sensitive key names
- **Arrays**: Recursively redact all elements
- **Primitives**: Pass through unchanged (numbers, booleans, null, undefined)

**Max Depth Protection**: Configurable maximum recursion depth (default: 10) prevents infinite loops.

### 3. Key-Based Redaction

Automatically redacts values for fields with sensitive names:
```javascript
const sensitiveKeys = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'auth_token', 'bearer', 'authorization',
  'private_key', 'secret_key', 'encryption_key', 'ssn', 'credit_card',
  'cvv', 'pin', 'otp', 'session_id', 'cookie', 'jwt', 'credentials'
];
```

### 4. Structure Preservation

Redaction maintains the original structure of objects and arrays, making logs still useful for debugging:

**Before**:
```json
{
  "user": "alice",
  "email": "alice@example.com",
  "api_key": "sk_test_EXAMPLE",
  "config": {
    "database_url": "postgresql://admin:secret@db.example.com/prod"
  }
}
```

**After**:
```json
{
  "user": "alice",
  "email": "<redacted:email>",
  "api_key": "<redacted>",
  "config": {
    "database_url": "postgresql://<redacted:db-creds>@db.example.com/prod"
  }
}
```

### 5. Aggressive Mode (Optional)

When `aggressive: true` is passed, the system also redacts:
- Any alphanumeric string 32+ characters long (likely hashes, keys, or tokens)

This is disabled by default to avoid over-redaction.

---

## Implementation

### Core Functions

#### `redactSensitiveData(data, options)`
Main redaction function that handles any data type recursively.

**Parameters**:
- `data`: Any value (string, object, array, primitive)
- `options.aggressive`: Apply aggressive redaction (default: false)
- `options.maxDepth`: Maximum recursion depth (default: 10)
- `options.preserveStructure`: Keep object/array structure (default: true)

**Returns**: Redacted data with same structure

**Example**:
```javascript
import { redactSensitiveData } from './server.guardrails.mjs';

const input = {
  operation: 'deploy',
  api_key: 'sk_live_EXAMPLE',
  email: 'admin@example.com'
};

const redacted = redactSensitiveData(input);
// {
//   operation: 'deploy',
//   api_key: '<redacted>',
//   email: '<redacted:email>'
// }
```

#### `redactForLogging(data, options)`
Combines redaction with truncation for log-safe output.

**Parameters**:
- `data`: Any value to redact and prepare for logging
- `options.aggressive`: Apply aggressive redaction (default: false)
- `options.maxBytes`: Maximum bytes for truncation (default: 4096)

**Returns**: Redacted and truncated string

**Example**:
```javascript
import { redactForLogging } from './server.guardrails.mjs';

const toolArgs = {
  password: 'secret123',
  long_data: 'x'.repeat(10000)
};

const safe = redactForLogging(toolArgs, { maxBytes: 500 });
// Returns redacted JSON string, truncated to ~500 bytes with [TRUNCATED] marker
```

#### `containsSensitiveData(input)`
Detects if input contains sensitive patterns (for warnings).

**Parameters**:
- `input`: String or object to check

**Returns**: Boolean

**Example**:
```javascript
import { containsSensitiveData } from './server.guardrails.mjs';

containsSensitiveData('sk_live_EXAMPLE'); // true
containsSensitiveData('normal text'); // false
containsSensitiveData({ api_key: 'sk_test_EXAMPLE' }); // true
```

### Integration Points

#### 1. server.tools.mjs
Redaction is applied in `runTool()` before logging:

```javascript
// T21: Redact sensitive data from arguments before logging
const redactedArgs = redactForLogging(args, { maxBytes: 200 });

// T11: Emit structured start log
const startLog = createToolLogEvent('start', name, { args: redactedArgs, trace_id, conv_id });
emitToolLog(startLog);

// T12: Persist to ContextLog with redacted preview
const ctxStartEvent = createToolExecutionEvent({
  phase: 'start',
  tool: name,
  conv_id,
  trace_id,
  args_preview: redactedArgs,
});
appendEvent(ctxStartEvent);
```

Similarly applied to results before logging finish/error events.

#### 2. server.contextlog.mjs
The `createToolExecutionEvent()` function receives already-redacted previews from `server.tools.mjs`. It applies truncation but does not need additional redaction.

#### 3. Tool Execution Flow
1. Tool is called with original (unredacted) arguments
2. Arguments are redacted using `redactForLogging()` before creating log events
3. Tool executes with original arguments (needs real values)
4. Result is redacted before logging
5. Original result is returned to caller
6. All log entries (telemetry, ContextLog) contain only redacted data

---

## Configuration

### Environment Variables

```bash
# Maximum preview size in bytes (default: 4096)
TOOLS_LOG_MAX_PREVIEW=4096
```

This controls the maximum size of previews before truncation. Redaction is applied first, then truncation.

### Disabling IP Redaction

IP address redaction is disabled by default (can be useful for debugging). To enable:

Edit `server.guardrails.mjs`:
```javascript
{ pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, replacement: '<redacted:ip>', enabled: true }
```

---

## Testing

### Test Coverage

The test suite (`frontend/test/tool_guardrails.test.mjs`) includes 33 tests covering:

- ✅ Pattern-based redaction (13 tests)
  - Stripe, OpenAI, Anthropic, AWS, GitHub API keys
  - JWT tokens, SSH keys, passwords
  - Emails, URLs with credentials, credit cards
  - Environment variables

- ✅ Recursive redaction (11 tests)
  - Objects with nested sensitive values
  - Arrays with sensitive elements
  - Deeply nested structures
  - Max depth protection
  - Null/undefined handling

- ✅ Helper functions (5 tests)
  - `redactForLogging()` with truncation
  - `containsSensitiveData()` detection
  - `redactObject()` key-based redaction

- ✅ Integration tests (2 tests)
  - Complex tool arguments
  - Mixed content results

- ✅ Edge cases (2 tests)
  - Truncation behavior
  - Error handling

### Running Tests

```bash
cd forgekeeper/frontend
npm test -- tool_guardrails.test.mjs  # Run redaction tests only
npm test                               # Run all tests
```

### Integration Verification

Test with a real tool call:
```javascript
const { runTool } = await import('./frontend/server.tools.mjs');
const { tailEvents } = await import('./frontend/server.contextlog.mjs');

// Run tool with sensitive data
await runTool('echo', {
  text: 'My API key is sk_test_EXAMPLE123NOTREAL and email is admin@example.com'
}, { conv_id: 'test-redaction' });

// Check ContextLog entries
const events = tailEvents(10, 'test-redaction');
// Should show <redacted:stripe-test-key> and <redacted:email>
```

---

## Examples

### Example 1: API Key in Tool Arguments

**Input**:
```javascript
{
  operation: 'deploy',
  api_key: 'sk' + '_live_' + '1234567890abcdefghijklmnop'  // Example only - not a real key
}
```

**Logged Preview**:
```json
{
  "operation": "deploy",
  "api_key": "<redacted>"
}
```

### Example 2: Database Connection String

**Input**:
```javascript
{
  database_url: 'postgresql://admin:MyP@ssw0rd@db.example.com:5432/prod'
}
```

**Logged Preview**:
```json
{
  "database_url": "postgresql://<redacted:db-creds>@db.example.com:5432/prod"
}
```

### Example 3: Mixed Sensitive Data

**Input**:
```javascript
{
  user: 'alice',
  email: 'alice@example.com',
  config: {
    stripe_key: 'sk_test_EXAMPLE',
    github_token: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    password: 'secret123'
  },
  logs: [
    'Starting deployment...',
    'Connected to postgresql://user:pass@localhost/db',
    'Deployment successful'
  ]
}
```

**Logged Preview**:
```json
{
  "user": "alice",
  "email": "<redacted:email>",
  "config": {
    "stripe_key": "<redacted>",
    "github_token": "<redacted>",
    "password": "<redacted>"
  },
  "logs": [
    "Starting deployment...",
    "Connected to postgresql://<redacted:db-creds>@localhost/db",
    "Deployment successful"
  ]
}
```

### Example 4: JWT Token

**Input**:
```javascript
{
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
}
```

**Logged Preview**:
```json
{
  "token": "<redacted>"
}
```

---

## Security Considerations

### What is Redacted

- ✅ All log previews (args_preview, result_preview)
- ✅ Telemetry events (TOOL_TELEMETRY logs)
- ✅ ContextLog entries (.forgekeeper/context_log/*.jsonl)
- ✅ Error messages containing sensitive data

### What is NOT Redacted

- ❌ Actual tool execution arguments (tools need real values to function)
- ❌ Return values to caller (application logic needs real data)
- ❌ Memory (only affects what is written to disk/logs)

### Limitations

1. **Pattern-based**: Only redacts known patterns. Novel secret formats may not be caught.
2. **No DLP Integration**: Does not use third-party secret scanners or ML-based detection.
3. **Performance**: Recursive redaction has overhead (mitigated by max depth limit).
4. **Already Logged Data**: Does not retroactively redact existing log files.

### Best Practices

1. **Don't Log Secrets**: Best practice is to never pass secrets to tools in the first place.
2. **Use Environment Variables**: Store secrets in environment variables, not in tool arguments.
3. **Review Logs**: Periodically audit `.forgekeeper/context_log/` for any leaks.
4. **Rotate Secrets**: If a secret appears in logs, rotate it immediately.
5. **Secure Log Storage**: Ensure log files have appropriate file permissions (600 or 640).

---

## Performance

### Benchmarks

Redaction performance (measured on sample data):

| Operation | Time | Notes |
|-----------|------|-------|
| String redaction (100 chars) | <1ms | Pattern matching |
| Object redaction (10 keys, depth 3) | <5ms | Recursive processing |
| Array redaction (100 elements) | <10ms | Map operation |
| Large object (1000 keys, depth 5) | <50ms | Still acceptable |

### Optimization

- Patterns are compiled once at module load time
- Max depth limit prevents runaway recursion
- Truncation applied after redaction (don't process more than needed)
- No external dependencies (pure JavaScript)

---

## Migration Guide

### Existing Code

If you have existing code that logs tool data, update it to use redaction:

**Before**:
```javascript
const preview = JSON.stringify(args).slice(0, 200);
appendEvent({ args_preview: preview });
```

**After**:
```javascript
import { redactForLogging } from './server.guardrails.mjs';

const preview = redactForLogging(args, { maxBytes: 200 });
appendEvent({ args_preview: preview });
```

### Existing Logs

Existing log files are NOT retroactively redacted. To clean up:

1. Stop the application
2. Archive or delete old logs: `rm .forgekeeper/context_log/*.jsonl`
3. Restart the application (new logs will be redacted)

---

## Troubleshooting

### Pattern Not Matching

If a secret format is not being redacted:

1. Check if it matches existing patterns in `server.guardrails.mjs`
2. Add a new pattern to `REDACTION_PATTERNS` array:
   ```javascript
   { pattern: /your-pattern-here/gi, replacement: '<redacted:your-type>' }
   ```
3. Add test case to `test/tool_guardrails.test.mjs`

### Over-Redaction

If legitimate data is being redacted:

1. Review patterns in `REDACTION_PATTERNS`
2. Make pattern more specific (e.g., require certain prefix/suffix)
3. Disable aggressive mode if enabled

### Performance Issues

If redaction is too slow:

1. Reduce `maxDepth` option (default: 10)
2. Reduce `TOOLS_LOG_MAX_PREVIEW` (default: 4096)
3. Disable aggressive mode
4. Optimize patterns (use non-capturing groups, avoid backtracking)

---

## Future Enhancements

Potential improvements for future versions:

- **ML-Based Detection**: Integrate ML models for detecting unknown secret formats
- **Custom Patterns**: Allow users to configure custom redaction patterns via config file
- **Retroactive Redaction**: Tool to scan and redact existing log files
- **Real-Time Alerts**: Warn if unredacted secrets are detected (before logging)
- **External DLP**: Integration with enterprise DLP/SIEM systems
- **Compliance Reports**: Generate compliance reports showing redaction coverage

---

## References

- **Task Card**: `tasks.md` line 470 (T21)
- **Source Files**:
  - `frontend/server.guardrails.mjs` - Redaction logic
  - `frontend/server.tools.mjs` - Integration point
  - `frontend/server.contextlog.mjs` - Event creation
  - `frontend/test/tool_guardrails.test.mjs` - Test suite
- **Related Tasks**:
  - T11: Hardened execution sandbox
  - T12: Tool output persistence
- **Documentation**:
  - `README.md` - User-facing documentation
  - `CLAUDE.md` - Architecture guide

---

**Last Updated**: 2025-11-16
**Contributors**: Claude Code Agent
**Status**: Production Ready ✅
