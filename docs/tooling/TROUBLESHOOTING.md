# Tool Troubleshooting Guide

**Solutions for common tool execution errors and issues.**

---

## Table of Contents

1. [Overview](#overview)
2. [Common Errors](#common-errors)
   - [Tool Not in Allowlist](#tool-not-in-allowlist)
   - [Rate Limit Exceeded](#rate-limit-exceeded)
   - [Validation Error](#validation-error)
   - [Timeout](#timeout)
   - [Redacted Data Issues](#redacted-data-issues)
   - [Missing Telemetry](#missing-telemetry)
   - [Tool Execution Disabled](#tool-execution-disabled)
3. [Debugging Tools](#debugging-tools)
4. [Escalation](#escalation)

---

## Overview

This guide covers the most common tool execution errors and how to resolve them. Each error includes:

- **Cause**: Why the error occurred
- **Solution**: How to fix it
- **Example**: Real-world scenario and fix
- **Prevention**: How to avoid in the future

---

## Common Errors

### Tool Not in Allowlist

**Error Message:**
```json
{
  "error": "tool_not_in_allowlist",
  "message": "Tool 'my_tool' is not in the allowlist. Allowed tools: echo, get_time, read_file, ..."
}
```

#### Cause

The tool you're trying to call is not in the centralized allowlist defined in `frontend/config/tools.config.mjs`.

#### Solution

**Option 1: Use an Existing Tool**

Check if an existing tool can accomplish your goal:
```bash
curl http://localhost:3000/config.json | jq '.tools[].function.name'
```

**Option 2: Add Tool to Allowlist (Development)**

1. Edit `frontend/config/tools.config.mjs`:
```javascript
export const DEFAULT_ALLOWED_TOOLS = [
  // ... existing tools
  'my_tool',  // Add your tool here
];
```

2. Add argument schema (if needed):
```javascript
export const TOOL_ARGUMENT_SCHEMAS = {
  my_tool: {
    input: { type: 'string', required: true, maxLength: 1000 }
  }
};
```

3. Restart frontend:
```bash
cd forgekeeper/frontend
npm run dev
```

**Option 3: Override Allowlist (Environment)**

For temporary testing:
```bash
# Add to .env
TOOL_ALLOW=echo,get_time,read_file,my_tool
```

Then restart the stack.

#### Example

**Scenario:** AI tries to call `search_web` but it's not in the allowlist.

**Error:**
```json
{
  "error": "tool_not_in_allowlist",
  "message": "Tool 'search_web' is not in the allowlist..."
}
```

**Solution:** Use `http_fetch` instead:
```json
{
  "tool": "http_fetch",
  "arguments": {
    "url": "https://api.duckduckgo.com/?q=query&format=json",
    "method": "GET"
  }
}
```

#### Prevention

- **Review Allowlist**: Before implementing a new tool, check if it should be in the allowlist
- **Document Tools**: Keep tool documentation up-to-date
- **AI Awareness**: Include allowlist in system prompts (T28 ensures this)

---

### Rate Limit Exceeded

**Error Message:**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 5,
  "message": "Too many requests. Please wait 5 seconds."
}
```

**HTTP Status:** 429 Too Many Requests

**Headers:**
```
Retry-After: 5
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000000
```

#### Cause

The token bucket is empty. You've exceeded the configured rate limit:
- Default: 100 burst capacity, 10 tokens/second refill
- Each request costs 1 token (default)

**Common Scenarios:**
- Tool loop making 100+ requests in quick succession
- Multiple concurrent requests
- Sustained traffic > 10 req/sec

#### Solution

**Option 1: Wait and Retry (Immediate)**

Wait for the `Retry-After` duration (in seconds), then retry:

**Python:**
```python
import time
import requests

response = requests.post('http://localhost:3000/api/chat', json=payload)

if response.status_code == 429:
    retry_after = int(response.headers.get('Retry-After', 5))
    print(f"Rate limited. Waiting {retry_after} seconds...")
    time.sleep(retry_after)
    response = requests.post('http://localhost:3000/api/chat', json=payload)
```

**JavaScript:**
```javascript
async function callWithRetry(url, payload) {
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
    console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  return response;
}
```

**Option 2: Increase Rate Limit (Configuration)**

For sustained high traffic, increase capacity and/or refill rate:

```bash
# Add to .env
RATE_LIMIT_CAPACITY=500        # Increase burst size
RATE_LIMIT_REFILL_RATE=50      # Increase sustained rate
```

Restart frontend to apply changes.

**Option 3: Disable Rate Limiting (Development Only)**

**⚠️ WARNING:** Only for local development. Never disable in production.

```bash
# Add to .env
RATE_LIMIT_ENABLED=0
```

Restart frontend.

**Option 4: Optimize Tool Loops**

Reduce number of tool calls:
- Batch operations where possible
- Cache results
- Use more efficient tools
- Break into smaller tasks

#### Example

**Scenario:** Tool loop makes 150 HTTP requests in 5 seconds.

**Error:**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 5
}
```

**Analysis:**
- Capacity: 100
- First 100 requests succeed (0-2 seconds)
- Next 50 requests fail (2-5 seconds)
- Bucket refills 50 tokens in 5 seconds (10/sec * 5s = 50)
- Still 50 requests short

**Solution 1 (Immediate):** Wait 5 seconds, retry failed requests

**Solution 2 (Configuration):**
```bash
RATE_LIMIT_CAPACITY=200        # Allow larger burst
RATE_LIMIT_REFILL_RATE=30      # Faster refill (30/sec)
```

Now:
- First 200 requests succeed
- Refills 150 tokens in 5 seconds (30/sec * 5s = 150)
- No rate limit errors

**Solution 3 (Optimization):** Batch HTTP requests into fewer tool calls:
```javascript
// Instead of 150 individual calls
for (let i = 0; i < 150; i++) {
  await fetch(urls[i]);
}

// Use Promise.all with batching
const batchSize = 10;
for (let i = 0; i < urls.length; i += batchSize) {
  const batch = urls.slice(i, i + batchSize);
  await Promise.all(batch.map(url => fetch(url)));
  // Only 15 tool calls instead of 150
}
```

#### Prevention

- **Monitor Metrics**: Check rate limit hit rate regularly
- **Implement Backoff**: Always implement exponential backoff for retries
- **Batch Operations**: Design tools to support batching
- **Cache Results**: Avoid redundant tool calls
- **Test Under Load**: Load test before deploying to production

---

### Validation Error

**Error Message:**
```json
{
  "error": "validation_error",
  "errors": [
    "Missing required argument: url",
    "Argument 'method' must be one of: GET, POST, PUT, DELETE, PATCH"
  ]
}
```

#### Cause

Tool arguments don't match the schema defined in `frontend/config/tools.config.mjs`:
- Missing required arguments
- Wrong argument type (string vs number)
- Value exceeds length/range limits
- Enum value not in allowed list

#### Solution

**Step 1: Check the Schema**

```bash
# View tool schema
cat frontend/config/tools.config.mjs | grep -A 20 "http_fetch:"
```

**Output:**
```javascript
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
}
```

**Step 2: Fix Arguments**

Ensure your tool call matches the schema:

**Before (Invalid):**
```json
{
  "tool": "http_fetch",
  "arguments": {
    "method": "GET"
    // Missing required 'url'
  }
}
```

**After (Valid):**
```json
{
  "tool": "http_fetch",
  "arguments": {
    "url": "https://api.example.com/data",
    "method": "GET"
  }
}
```

**Step 3: Test Schema Validation**

```javascript
import { validateToolArguments } from './config/tools.config.mjs';

const result = validateToolArguments('http_fetch', {
  url: 'https://api.example.com',
  method: 'GET'
});

console.log(result);
// { valid: true, errors: [] }
```

#### Example Scenarios

**Scenario 1: Missing Required Argument**

**Error:**
```json
{
  "errors": ["Missing required argument: text"]
}
```

**Fix:**
```json
// Before
{ "tool": "echo", "arguments": {} }

// After
{ "tool": "echo", "arguments": { "text": "Hello" } }
```

**Scenario 2: Type Mismatch**

**Error:**
```json
{
  "errors": ["Argument 'pr_number' must be of type number, got string"]
}
```

**Fix:**
```json
// Before
{ "tool": "check_pr_status", "arguments": { "pr_number": "123" } }

// After
{ "tool": "check_pr_status", "arguments": { "pr_number": 123 } }
```

**Scenario 3: Length Exceeded**

**Error:**
```json
{
  "errors": ["Argument 'text' exceeds maximum length of 10000 characters"]
}
```

**Fix:**
```json
// Before
{ "tool": "echo", "arguments": { "text": "x".repeat(20000) } }

// After
{ "tool": "echo", "arguments": { "text": "x".repeat(9000) } }
```

**Scenario 4: Invalid Enum**

**Error:**
```json
{
  "errors": ["Argument 'method' must be one of: GET, POST, PUT, DELETE, PATCH"]
}
```

**Fix:**
```json
// Before
{ "tool": "http_fetch", "arguments": { "url": "...", "method": "OPTIONS" } }

// After
{ "tool": "http_fetch", "arguments": { "url": "...", "method": "GET" } }
```

#### Prevention

- **Include Schemas in Prompts**: Ensure system prompts include argument schemas (T28)
- **Type Checking**: Use TypeScript/Python type hints to catch errors early
- **Test Cases**: Write unit tests for all argument combinations
- **Documentation**: Keep tool documentation up-to-date with schemas

---

### Timeout

**Error Message:**
```json
{
  "error": "Tool execution timed out after 30000ms",
  "tool": "http_fetch",
  "timeout_ms": 30000
}
```

#### Cause

Tool execution exceeded the configured timeout (default: 30 seconds).

**Common Causes:**
- Slow network requests
- Large file operations
- Complex computations
- Blocking I/O operations
- Infinite loops (bug in tool implementation)

#### Solution

**Option 1: Increase Timeout (Configuration)**

For long-running operations:

```bash
# Add to .env
TOOL_TIMEOUT_MS=60000  # 60 seconds
```

Restart frontend to apply changes.

**Option 2: Optimize Tool Implementation**

**Before (Slow):**
```javascript
// Synchronous file read (blocks)
export async function run(args) {
  const content = fs.readFileSync(args.path, 'utf8');  // Blocks!
  return content;
}
```

**After (Fast):**
```javascript
// Asynchronous file read (non-blocking)
export async function run(args) {
  const content = await fs.promises.readFile(args.path, 'utf8');
  return content;
}
```

**Option 3: Break into Smaller Operations**

Instead of one large operation:
```javascript
// Before: Single 60-second operation
await processLargeDataset(allData);  // Timeout!
```

Break into chunks:
```javascript
// After: Multiple 10-second operations
for (const chunk of chunks) {
  await processChunk(chunk);  // Each completes in <30s
}
```

**Option 4: Use Streaming**

For large data transfers:
```javascript
// Before: Load entire file into memory
const data = await fetch(url).then(r => r.text());  // Timeout!

// After: Stream data
const response = await fetch(url);
const reader = response.body.getReader();
let result = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  result += new TextDecoder().decode(value);
}
```

#### Example

**Scenario:** HTTP request to slow API times out.

**Error:**
```json
{
  "error": "Tool execution timed out after 30000ms",
  "tool": "http_fetch"
}
```

**Analysis:**
- API response time: 45 seconds
- Tool timeout: 30 seconds
- Request aborted at 30 seconds

**Solution 1 (Immediate):** Increase timeout:
```bash
TOOL_TIMEOUT_MS=60000
```

**Solution 2 (Optimization):** Add timeout to HTTP client:
```javascript
export async function run(args) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);  // 25s timeout

  try {
    const response = await fetch(args.url, {
      signal: controller.signal,
      timeout: 25000
    });
    clearTimeout(timeoutId);
    return await response.text();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('HTTP request timed out after 25 seconds');
    }
    throw err;
  }
}
```

**Solution 3 (Best):** Use faster API or caching:
```javascript
// Cache slow API responses
const cache = new Map();

export async function run(args) {
  const cacheKey = args.url;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const response = await fetch(args.url);
  const data = await response.text();
  cache.set(cacheKey, data);
  return data;
}
```

#### Prevention

- **Profile Tools**: Measure execution time during development
- **Set Realistic Timeouts**: Based on expected operation duration
- **Use Async I/O**: Never block the event loop
- **Test Edge Cases**: Test with slow networks, large files
- **Monitor P95/P99**: Track tail latencies to catch regressions

---

### Redacted Data Issues

**Issue:** Important data is being redacted in logs, making debugging difficult.

#### Cause

Sensitive data redaction (T21) is automatically applied to all log previews. Redaction patterns match:
- API keys (Stripe, OpenAI, AWS, GitHub, Anthropic)
- JWT tokens
- SSH private keys
- Passwords
- Database connection strings
- Emails
- Credit cards
- SSNs

#### Solution

**Option 1: Check Raw ContextLog (Production)**

Redaction only applies to **log previews**. Full data is still logged:

```bash
# View full event data
jq 'select(.name=="my_tool")' .forgekeeper/context_log/*.jsonl
```

**Note:** This requires access to the server where logs are stored.

**Option 2: Temporarily Disable Redaction (Local Development Only)**

**⚠️ DANGER:** Only for local debugging. Never commit or deploy.

```javascript
// frontend/server.guardrails.mjs
export function redactForLogging(data, options = {}) {
  // TEMPORARY: Disable redaction for debugging
  return JSON.stringify(data, null, 2);  // REMOVE BEFORE COMMIT!
}
```

**Option 3: Add Specific Patterns to Bypass**

If a pattern is incorrectly flagged as sensitive:

```javascript
// frontend/server.guardrails.mjs
const REDACTION_PATTERNS = [
  // Comment out the pattern causing issues
  // { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '<redacted:email>' },
];
```

**Option 4: Use Non-Redacted Debugging**

Use alternative debugging methods:
- Console.log (before redaction)
- Debugger breakpoints
- Unit tests (no redaction)
- Mock data (non-sensitive)

#### Example

**Scenario:** Debugging API integration, but API response is redacted.

**Log Output:**
```json
{
  "result_preview": "{\"user\":\"<redacted:email>\",\"token\":\"<redacted:jwt-token>\"}"
}
```

**Solution 1:** Check full ContextLog event:
```bash
jq 'select(.id=="evt_abc123")' .forgekeeper/context_log/*.jsonl
```

**Solution 2:** Use non-sensitive test data:
```javascript
// Instead of real email
const testUser = { email: 'test@test.local', token: 'test-token-123' };
```

**Solution 3:** Add console.log before redaction:
```javascript
export async function run(args) {
  const response = await fetch(args.url);
  const data = await response.json();

  // Debug output (before redaction)
  console.log('[DEBUG] Raw response:', JSON.stringify(data));

  return data;  // Will be redacted in logs
}
```

#### Prevention

- **Use Test Data**: Use non-sensitive data during development
- **Document Patterns**: Document which patterns are redacted
- **Test Redaction**: Verify redaction works as expected
- **Avoid Sensitive Data**: Don't use production data in development

---

### Missing Telemetry

**Issue:** Tool executions are not appearing in ContextLog or DiagnosticsDrawer.

#### Cause

1. ContextLog is disabled or misconfigured
2. ContextLog directory doesn't exist or is not writable
3. Frontend is not emitting events
4. Log file rotation issues

#### Solution

**Step 1: Check ContextLog Configuration**

```bash
# Verify environment variables
grep CONTEXTLOG .env
```

**Expected:**
```bash
FGK_CONTEXTLOG_DIR=.forgekeeper/context_log
FGK_CONTEXTLOG_MAX_BYTES=10485760
```

**Step 2: Verify Directory Exists and is Writable**

```bash
# Check directory
ls -la .forgekeeper/context_log/

# Check permissions
ls -ld .forgekeeper/context_log/
```

**Expected:**
```
drwxrwxr-x 2 user user 4096 Nov 16 15:30 .forgekeeper/context_log/
```

**Step 3: Create Directory if Missing**

```bash
mkdir -p .forgekeeper/context_log
chmod 755 .forgekeeper/context_log
```

**Step 4: Check for Recent Events**

```bash
# List log files
ls -lh .forgekeeper/context_log/

# Tail recent events
tail -20 .forgekeeper/context_log/ctx-*.jsonl
```

**Step 5: Test Event Emission**

```javascript
// frontend/test-contextlog.mjs
import { appendEvent } from './server.contextlog.mjs';

const testEvent = {
  id: 'test_' + Date.now(),
  ts: new Date().toISOString(),
  actor: 'test',
  act: 'test_event',
  message: 'Testing ContextLog'
};

await appendEvent(testEvent);
console.log('Test event written');
```

Run:
```bash
node frontend/test-contextlog.mjs
tail -1 .forgekeeper/context_log/ctx-*.jsonl
```

**Step 6: Check Frontend Logs for Errors**

```bash
# If running in Docker
docker compose logs -f frontend | grep -i contextlog

# If running locally
npm --prefix frontend run dev
# Check console output for errors
```

**Step 7: Verify API Endpoint**

```bash
curl http://localhost:3000/api/tools/executions?limit=1
```

**Expected:**
```json
{
  "executions": [
    {
      "id": "evt_abc123",
      "timestamp": "2025-11-16T15:30:45.123Z",
      "tool": "get_time",
      "status": "ok"
    }
  ]
}
```

#### Example

**Scenario:** DiagnosticsDrawer shows "No recent tool executions" despite running tools.

**Diagnosis:**
```bash
# Check directory
ls .forgekeeper/context_log/
# Output: ls: cannot access '.forgekeeper/context_log/': No such file or directory
```

**Solution:**
```bash
# Create directory
mkdir -p .forgekeeper/context_log

# Restart frontend
cd frontend
npm run dev
```

**Verification:**
```bash
# Make a tool call via UI or API
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What time is it?"}],"tools":true}'

# Check log
tail -1 .forgekeeper/context_log/ctx-*.jsonl
# Output: {"id":"evt_abc123","ts":"2025-11-16T15:30:45.123Z","actor":"tool",...}
```

#### Prevention

- **Check Directory**: Ensure `.forgekeeper/context_log/` exists in `.gitignore`
- **Test Setup**: Test ContextLog during initial setup
- **Monitor Disk Space**: Ensure sufficient disk space for logs
- **Rotate Logs**: Configure log retention to prevent disk exhaustion

---

### Tool Execution Disabled

**Error Message:**
```json
{
  "error": "tool_execution_disabled",
  "message": "Tool execution is disabled via TOOLS_EXECUTION_ENABLED=0"
}
```

#### Cause

The global tool execution toggle is disabled:
```bash
TOOLS_EXECUTION_ENABLED=0
```

#### Solution

**Step 1: Check Environment**

```bash
grep TOOLS_EXECUTION_ENABLED .env
```

**Step 2: Enable Tool Execution**

```bash
# Edit .env
TOOLS_EXECUTION_ENABLED=1
```

**Step 3: Restart Frontend**

```bash
cd frontend
npm run dev
```

**Step 4: Verify**

```bash
curl http://localhost:3000/config.json | jq '.toolsEnabled'
# Should return: true
```

#### Example

**Scenario:** All tool calls fail with "tool_execution_disabled".

**Diagnosis:**
```bash
grep TOOLS_EXECUTION_ENABLED .env
# Output: TOOLS_EXECUTION_ENABLED=0
```

**Solution:**
```bash
# Edit .env
sed -i 's/TOOLS_EXECUTION_ENABLED=0/TOOLS_EXECUTION_ENABLED=1/' .env

# Restart
docker compose restart frontend
```

**Verification:**
```bash
# Make a test tool call
python -m forgekeeper chat -p "What time is it?"
# Should succeed with timestamp response
```

#### Prevention

- **Default Enabled**: Keep `TOOLS_EXECUTION_ENABLED=1` by default
- **Document Toggle**: Clearly document when/why to disable
- **Emergency Only**: Only disable during incidents or maintenance

---

## Debugging Tools

### ContextLog Analysis

**Tail Recent Events:**
```bash
tail -f .forgekeeper/context_log/ctx-*.jsonl | jq '.'
```

**Filter by Tool:**
```bash
jq 'select(.name=="http_fetch")' .forgekeeper/context_log/*.jsonl
```

**Filter by Status:**
```bash
jq 'select(.status=="error")' .forgekeeper/context_log/*.jsonl
```

**Filter by Time Range:**
```bash
jq 'select(.ts >= "2025-11-16T14:00:00Z" and .ts <= "2025-11-16T15:00:00Z")' \
  .forgekeeper/context_log/*.jsonl
```

**Count Events by Tool:**
```bash
jq -r '.name' .forgekeeper/context_log/*.jsonl | sort | uniq -c | sort -rn
```

**Average Execution Time:**
```bash
jq -r 'select(.elapsed_ms) | .elapsed_ms' .forgekeeper/context_log/*.jsonl | \
  awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
```

### DiagnosticsDrawer

**Access:** Click drawer icon (bottom-right of chat UI)

**Features:**
- Last 10 tool executions
- Status badges (✅ success, ❌ error, ⏳ in-progress)
- Execution timing
- Redacted argument/result previews
- Expandable details
- Copy-to-clipboard

### Metrics Endpoint

**Tool Executions:**
```bash
curl http://localhost:3000/api/tools/executions?limit=10 | jq '.'
```

**Rate Limit Metrics:**
```bash
curl http://localhost:3000/api/rate_limit/metrics | jq '.'
```

**Scout Metrics:**
```bash
curl http://localhost:3000/api/scout/metrics | jq '.'
```

### Log Levels

**Enable Debug Logging:**
```bash
# Add to .env
LOG_LEVEL=debug
```

**Restart frontend:**
```bash
docker compose restart frontend
```

**View Debug Logs:**
```bash
docker compose logs -f frontend | grep DEBUG
```

### Testing Tools Locally

**Test Tool Directly:**
```javascript
// frontend/test-tool.mjs
import { TOOL_DEFS, runTool } from './server.tools.mjs';

const result = await runTool('get_time', {}, {
  conv_id: 'test_conv',
  trace_id: 'test_trace'
});

console.log(result);
```

Run:
```bash
node frontend/test-tool.mjs
```

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "What time is it?"}],
    "tools": true
  }' | jq '.'
```

### Schema Validation Testing

```javascript
import { validateToolArguments } from './config/tools.config.mjs';

// Test valid args
console.log(validateToolArguments('echo', { text: 'Hello' }));
// { valid: true, errors: [] }

// Test invalid args
console.log(validateToolArguments('echo', {}));
// { valid: false, errors: ['Missing required argument: text'] }
```

---

## Escalation

### When to Escalate

**Escalate to maintainers if:**
1. **Data Loss**: ContextLog events are missing or corrupted
2. **Security Issue**: Sensitive data is not being redacted
3. **Performance Regression**: Tool execution time increased by >50%
4. **Persistent Errors**: Error rate >20% for >1 hour
5. **Bug in Tool Implementation**: Tool produces incorrect results
6. **Configuration Issues**: Cannot resolve with documentation

### How to Escalate

**Step 1: Gather Information**

```bash
# Collect diagnostics
cat .env | grep TOOL > /tmp/tool-config.txt
cat .env | grep RATE_LIMIT >> /tmp/tool-config.txt
cat .env | grep CONTEXTLOG >> /tmp/tool-config.txt

# Collect recent errors
jq 'select(.status=="error")' .forgekeeper/context_log/*.jsonl | tail -20 > /tmp/recent-errors.jsonl

# Collect metrics
curl http://localhost:3000/api/rate_limit/metrics > /tmp/rate-limit-metrics.json
curl http://localhost:3000/api/tools/executions?limit=50 > /tmp/tool-executions.json
```

**Step 2: Create Issue**

Open an issue at: https://github.com/gatewaybuddy/forgekeeper/issues

**Template:**
```markdown
### Issue Summary
Brief description of the problem

### Environment
- Forgekeeper version: [e.g., v1.0.0]
- OS: [e.g., Ubuntu 22.04]
- Node version: [e.g., 20.10.0]
- Docker version: [e.g., 24.0.7]

### Configuration
```bash
# Relevant .env settings (REDACT SENSITIVE DATA!)
TOOLS_EXECUTION_ENABLED=1
TOOL_TIMEOUT_MS=30000
...
```

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Logs
```json
{recent error events from ContextLog}
```

### Metrics
```json
{rate limit and tool execution metrics}
```

### Additional Context
Any other relevant information
```

**Step 3: Attach Diagnostics**

Attach the collected files:
- `/tmp/tool-config.txt`
- `/tmp/recent-errors.jsonl`
- `/tmp/rate-limit-metrics.json`
- `/tmp/tool-executions.json`

**⚠️ IMPORTANT:** Redact any sensitive data before attaching!

### Emergency Contacts

For **critical security issues** (e.g., sensitive data leak):
- **DO NOT** open a public issue
- Email: security@forgekeeper.dev (if available)
- Or follow [SECURITY.md](../../SECURITY.md) guidelines

---

**Last Updated:** 2025-11-16
**Milestone:** M1 - Tool Hardening Complete
**Tasks:** T11, T12, T21, T22, T28, T29, T30

**Related Docs:**
- [QUICKSTART.md](QUICKSTART.md) - Setup and configuration
- [GUARDRAILS.md](GUARDRAILS.md) - Detailed guardrail documentation
- [TOOLS_REFERENCE.md](TOOLS_REFERENCE.md) - Complete tool reference
