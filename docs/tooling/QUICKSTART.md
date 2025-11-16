# Tool System Quickstart

**Quick reference for getting started with Forgekeeper's hardened tool execution system.**

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Setup](#quick-setup)
3. [Configuration Reference](#configuration-reference)
4. [Basic Usage](#basic-usage)
5. [Feature Toggles](#feature-toggles)
6. [Next Steps](#next-steps)

---

## Overview

Forgekeeper provides a **hardened tool execution system** with comprehensive security guardrails implemented in Milestone 1 (M1). The system includes:

- **Allowlist Enforcement (T11)**: Only 19 pre-approved tools can execute
- **Argument Validation (T11)**: Schema-based validation for all tool inputs
- **Execution Limits (T11)**: Configurable timeouts, retries, and output size limits
- **Sensitive Data Redaction (T21)**: Automatic redaction of API keys, credentials, and PII from logs
- **Rate Limiting (T22)**: Token bucket algorithm prevents runaway tool loops
- **ContextLog Persistence (T12)**: Complete audit trail of all tool executions
- **System Prompts (T28)**: AI agents receive guardrail guidance
- **UI Feedback (T29)**: Real-time status badges and error actions

**Key Design Principles:**
- **Secure by Default**: All guardrails enabled out of the box
- **Zero Trust**: Every tool call is validated, limited, and logged
- **Fail Safe**: Clear error messages with actionable guidance
- **Observable**: Full telemetry and audit trail in ContextLog

---

## Quick Setup

### Prerequisites

- Node.js 20+ (for frontend server)
- Python 3.11+ (optional, for CLI)
- Docker (for inference backend)

### 1. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

**Minimal Configuration** (add to `.env`):

```bash
# Tool Execution (default: enabled)
TOOLS_EXECUTION_ENABLED=1

# Tool Limits (defaults shown)
TOOL_TIMEOUT_MS=30000           # 30 seconds
TOOL_MAX_RETRIES=0              # No retries
TOOL_MAX_OUTPUT_BYTES=1048576   # 1MB

# Rate Limiting (default: enabled)
RATE_LIMIT_ENABLED=1
RATE_LIMIT_CAPACITY=100         # Max burst tokens
RATE_LIMIT_REFILL_RATE=10       # Tokens per second
RATE_LIMIT_COST_PER_REQUEST=1   # Cost per request

# Redaction (default: enabled)
TOOLS_LOG_MAX_PREVIEW=4096      # Max preview size

# ContextLog
FGK_CONTEXTLOG_DIR=.forgekeeper/context_log
FGK_CONTEXTLOG_MAX_BYTES=10485760  # 10MB rotation

# Tool Sandbox
TOOLS_FS_ROOT=.forgekeeper/sandbox
```

### 2. Start the Stack

```bash
# Option A: Quick start
python -m forgekeeper ensure-stack --build

# Option B: Manual
bash forgekeeper/scripts/ensure_llama_core.sh
cd forgekeeper/frontend
npm install
npm run dev
```

### 3. Verify Tool System

Check tool availability:

```bash
curl http://localhost:3000/config.json | jq '.tools'
```

You should see 19 tools listed.

### 4. Test a Tool Call

**Via Web UI:**
1. Open http://localhost:5173
2. Enter: "What time is it?"
3. The AI will call `get_time` tool
4. Check DiagnosticsDrawer (bottom right) for tool execution details

**Via Python CLI:**

```bash
python -m forgekeeper chat -p "What time is it?"
```

**Expected Output:**
```json
{
  "role": "assistant",
  "content": "The current UTC time is 2025-11-16T15:30:45.123Z"
}
```

---

## Configuration Reference

### Core Tool Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TOOLS_EXECUTION_ENABLED` | `1` | Global tool execution toggle (0 = all tools disabled) |
| `TOOL_TIMEOUT_MS` | `30000` | Maximum execution time per tool (milliseconds) |
| `TOOL_MAX_RETRIES` | `0` | Number of retry attempts for failed tools |
| `TOOL_MAX_OUTPUT_BYTES` | `1048576` | Maximum output size (1MB default) |
| `TOOLS_FS_ROOT` | `.forgekeeper/sandbox` | Sandbox directory for file operations |

### Tool Allowlist

**Default Allowlist** (19 tools - see `frontend/config/tools.config.mjs`):

```javascript
const DEFAULT_ALLOWED_TOOLS = [
  'echo',                // Echo text
  'get_time',            // Get current time
  'read_dir',            // List directory contents
  'read_file',           // Read file contents
  'write_file',          // Write to file
  'write_repo_file',     // Write to repository file
  'http_fetch',          // Make HTTP requests
  'git_status',          // Git status
  'git_diff',            // Git diff
  'git_add',             // Git add files
  'git_commit',          // Git commit
  'git_push',            // Git push
  'git_pull',            // Git pull
  'run_bash',            // Execute bash commands
  'run_powershell',      // Execute PowerShell commands
  'refresh_tools',       // Reload tool definitions
  'restart_frontend',    // Restart frontend server
  'create_task_card',    // Create TGT task card
  'check_pr_status'      // Check PR status
];
```

**Override Allowlist** (via environment):

```bash
# Only allow read-only tools
TOOL_ALLOW=echo,get_time,read_file,read_dir,git_status,git_diff
```

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `1` | Enable rate limiting (0 = disabled) |
| `RATE_LIMIT_CAPACITY` | `100` | Maximum tokens (burst size) |
| `RATE_LIMIT_REFILL_RATE` | `10` | Tokens refilled per second |
| `RATE_LIMIT_COST_PER_REQUEST` | `1` | Tokens consumed per request |

**How It Works:**
- Token bucket algorithm allows burst traffic up to `capacity`
- Bucket refills at `refillRate` tokens/second
- Each request costs `costPerRequest` tokens
- Returns HTTP 429 when bucket is empty, with `Retry-After` header

**Example:**
- Capacity: 100, Refill: 10/sec, Cost: 1
- Can burst 100 requests immediately
- Then limited to 10 requests/second sustained

### Sensitive Data Redaction

| Variable | Default | Description |
|----------|---------|-------------|
| `TOOLS_LOG_MAX_PREVIEW` | `4096` | Maximum preview size (bytes) |

**Redacted Patterns** (see [GUARDRAILS.md](GUARDRAILS.md#sensitive-data-redaction-t21) for full list):
- API keys (Stripe, OpenAI, AWS, GitHub, Anthropic)
- JWT tokens
- SSH private keys
- Passwords
- Database connection strings
- Email addresses
- Credit card numbers
- Social Security Numbers

### ContextLog

| Variable | Default | Description |
|----------|---------|-------------|
| `FGK_CONTEXTLOG_DIR` | `.forgekeeper/context_log` | Log directory |
| `FGK_CONTEXTLOG_MAX_BYTES` | `10485760` | Max file size (10MB) before rotation |

**Log Format:**
```json
{
  "id": "evt_abc123",
  "ts": "2025-11-16T15:30:45.123Z",
  "actor": "tool",
  "act": "execute",
  "name": "get_time",
  "status": "ok",
  "elapsed_ms": 12,
  "trace_id": "trace_xyz",
  "conv_id": "conv_456",
  "args_preview": "{}",
  "result_preview": "2025-11-16T15:30:45.123Z",
  "bytes": 24
}
```

---

## Basic Usage

### Example 1: Read a File

**Prompt:**
```
Read the contents of README.md
```

**Tool Call:**
```json
{
  "tool": "read_file",
  "arguments": {
    "path": "README.md"
  }
}
```

**Guardrails Applied:**
1. ✅ Allowlist check: `read_file` is in allowlist
2. ✅ Argument validation: `path` is string, < 4096 chars
3. ✅ Rate limit: Token available, consume 1
4. ✅ Timeout: Execution completes in <30s
5. ✅ Output limit: Result < 1MB
6. ✅ Redaction: No sensitive data detected
7. ✅ ContextLog: Logged with correlation IDs

### Example 2: HTTP Fetch

**Prompt:**
```
Fetch the latest release info from https://api.github.com/repos/owner/repo/releases/latest
```

**Tool Call:**
```json
{
  "tool": "http_fetch",
  "arguments": {
    "url": "https://api.github.com/repos/owner/repo/releases/latest",
    "method": "GET"
  }
}
```

**Guardrails Applied:**
1. ✅ Allowlist check
2. ✅ Argument validation: URL < 2048 chars, method in enum
3. ✅ Rate limit check
4. ✅ Timeout enforcement
5. ✅ Output size limit
6. ✅ Redaction applied to response
7. ✅ ContextLog event

### Example 3: Git Operations

**Prompt:**
```
Show me the git status
```

**Tool Call:**
```json
{
  "tool": "git_status",
  "arguments": {}
}
```

**No arguments required** - schema validation passes automatically.

---

## Feature Toggles

### Emergency Shutdown

**Disable ALL tool execution:**

```bash
TOOLS_EXECUTION_ENABLED=0
```

All tool calls will return:
```json
{
  "error": "tool_execution_disabled",
  "message": "Tool execution is disabled via TOOLS_EXECUTION_ENABLED=0"
}
```

### Disable Rate Limiting (Development Only)

```bash
RATE_LIMIT_ENABLED=0
```

**⚠️ Warning:** Only disable for local development/testing. Always enable in production.

### Aggressive Redaction

Enable redaction of all 32+ character strings (useful for high-security environments):

```python
from forgekeeper.server.guardrails import redactForLogging

# Aggressive mode redacts long alphanumeric strings
redacted = redactForLogging(data, options={'aggressive': True})
```

### System Prompt Variants (T28)

**Tool-Enabled Mode** (default):
```bash
TOOL_PROMPT_INCLUDE_GUARDRAILS=1
TOOL_PROMPT_VARIANT=enabled
```
Includes comprehensive guardrail documentation in system prompts.

**Tool-Disabled Mode** (minimal):
```bash
TOOL_PROMPT_INCLUDE_GUARDRAILS=0
TOOL_PROMPT_VARIANT=disabled
```
Only tool signatures, no guardrail guidance.

---

## Next Steps

- **[GUARDRAILS.md](GUARDRAILS.md)** - Deep dive into all guardrail features
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common errors and solutions
- **[TOOLS_REFERENCE.md](TOOLS_REFERENCE.md)** - Complete tool documentation
- **[Tool Security Guide](../TOOL_SECURITY_GUIDE.md)** - Security best practices
- **[ContextLog ADR](../contextlog/adr-0001-contextlog.md)** - Event logging architecture

### Monitoring Tool Usage

**Check ContextLog:**
```bash
tail -f .forgekeeper/context_log/ctx-*.jsonl | grep tool_execution
```

**Query Tool Executions:**
```bash
curl http://localhost:3000/api/tools/executions?limit=10
```

**Check Rate Limit Metrics:**
```bash
curl http://localhost:3000/api/rate_limit/metrics
```

### Adding Custom Tools (Advanced)

See [TOOLS_REFERENCE.md - Adding Custom Tools](TOOLS_REFERENCE.md#adding-custom-tools-advanced)

---

**Last Updated:** 2025-11-16
**Milestone:** M1 - Tool Hardening Complete
**Tasks:** T11, T12, T21, T22, T28, T29, T30
