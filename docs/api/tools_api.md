# Tool Management API Reference

**Base Path**: `/api/tools`
**Status**: Implemented (codex.plan Phases 1-2)

---

## Overview

The Tool Management API provides comprehensive tool discovery, approval, monitoring, and diagnostics.

**Features**:
- Tool discovery and metadata
- AI-generated tool approval system
- Error tracking and statistics
- Regression monitoring
- Resource usage tracking
- Dynamic tool reloading

---

## Tool Discovery

### GET /api/tools

Get list of all registered tools.

**Response**:
```json
{
  "ok": true,
  "enabled": true,
  "count": 12,
  "names": ["get_time", "echo", "read_file", "write_file", ...],
  "defs": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a text file from the sandbox",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "File path relative to sandbox root"
            }
          },
          "required": ["path"]
        }
      }
    }
  ]
}
```

---

### GET /api/tools/config

Get tool configuration.

**Response**:
```json
{
  "ok": true,
  "config": {
    "enabled": true,
    "allowlist": ["get_time", "echo", "read_file"],
    "sandboxRoot": "/workspace/sandbox",
    "maxReadBytes": 65536,
    "maxWriteBytes": 65536,
    "powershellEnabled": false,
    "bashEnabled": true,
    "httpFetchEnabled": false
  }
}
```

---

### POST /api/tools/config

Update tool configuration.

**Request**:
```json
{
  "allowlist": ["get_time", "echo"],
  "maxReadBytes": 131072
}
```

**Response**:
```json
{
  "ok": true,
  "config": {...}
}
```

---

## Dynamic Loading

### POST /api/tools/reload

Reload all tool definitions from disk.

**Response**:
```json
{
  "ok": true,
  "reloaded": 12,
  "timestamp": "2025-11-04T..."
}
```

---

### POST /api/tools/write

Write a new tool file to disk.

**Request**:
```json
{
  "name": "my_tool",
  "code": "export const name = 'my_tool';\n..."
}
```

**Response**:
```json
{
  "ok": true,
  "path": "/workspace/frontend/tools/my_tool.mjs",
  "bytes": 1234
}
```

---

## Tool Approval System

### POST /api/tools/propose

Propose an AI-generated tool for approval (codex.plan Phase 1, T203).

**Request**:
```json
{
  "name": "analyze_logs",
  "description": "Analyze log files for patterns",
  "code": "export const name = 'analyze_logs';\nexport const description = '...';\n...",
  "reasoning": "Generated to help with log analysis tasks"
}
```

**Response**:
```json
{
  "ok": true,
  "proposal": {
    "id": "prop_abc123",
    "toolName": "analyze_logs",
    "status": "pending",
    "createdAt": "2025-11-04T...",
    "expiresAt": "2025-11-05T..."
  },
  "message": "Tool proposal submitted. Awaiting approval."
}
```

---

### GET /api/tools/pending

List all pending tool approvals.

**Response**:
```json
{
  "ok": true,
  "pending": [
    {
      "id": "prop_abc123",
      "toolName": "analyze_logs",
      "description": "Analyze log files for patterns",
      "codePreview": "export const name = 'analyze_logs';...",
      "status": "pending",
      "createdAt": "2025-11-04T...",
      "expiresAt": "2025-11-05T..."
    }
  ],
  "count": 1
}
```

---

### POST /api/tools/approve/:tool_name

Approve a pending tool proposal.

**Response**:
```json
{
  "ok": true,
  "tool": {
    "name": "analyze_logs",
    "status": "approved",
    "approvedAt": "2025-11-04T...",
    "path": "/workspace/frontend/tools/analyze_logs.mjs"
  },
  "message": "Tool approved and written to disk"
}
```

---

## Error Statistics

Track and monitor tool execution errors (codex.plan Phase 1, T205).

### GET /api/tools/errors

Get error statistics for all tools.

**Response**:
```json
{
  "ok": true,
  "stats": [
    {
      "toolName": "read_file",
      "totalCalls": 1234,
      "errors": 23,
      "errorRate": 0.0186,
      "lastError": {
        "timestamp": "2025-11-04T...",
        "message": "ENOENT: file not found",
        "code": "ENOENT"
      },
      "errorTypes": {
        "ENOENT": 15,
        "EACCES": 5,
        "EISDIR": 3
      }
    }
  ],
  "summary": {
    "totalTools": 12,
    "toolsWithErrors": 3,
    "totalErrors": 45,
    "avgErrorRate": 0.012
  }
}
```

---

### GET /api/tools/errors/:tool_name

Get error statistics for a specific tool.

**Response**:
```json
{
  "ok": true,
  "tool": "read_file",
  "stats": {
    "totalCalls": 1234,
    "errors": 23,
    "errorRate": 0.0186,
    "firstError": "2025-10-15T...",
    "lastError": {
      "timestamp": "2025-11-04T...",
      "message": "ENOENT: file not found",
      "code": "ENOENT",
      "args": {
        "path": "/nonexistent/file.txt"
      }
    },
    "errorTypes": {
      "ENOENT": 15,
      "EACCES": 5,
      "EISDIR": 3
    },
    "topErrors": [
      {
        "message": "ENOENT: file not found",
        "count": 15,
        "percentage": 65.2
      }
    ]
  }
}
```

---

### POST /api/tools/errors/:tool_name/clear

Clear error statistics for a tool.

**Response**:
```json
{
  "ok": true,
  "tool": "read_file",
  "cleared": {
    "errors": 23,
    "timestamp": "2025-11-04T..."
  }
}
```

---

## Regression Monitoring

Track performance degradation over time (codex.plan Phase 2, T211).

### GET /api/tools/regression

Get regression statistics for all tools.

**Response**:
```json
{
  "ok": true,
  "regressions": [
    {
      "toolName": "read_file",
      "baseline": {
        "avgExecutionMs": 45,
        "p95ExecutionMs": 120,
        "errorRate": 0.005,
        "periodStart": "2025-10-01T...",
        "periodEnd": "2025-10-31T...",
        "sampleSize": 5000
      },
      "current": {
        "avgExecutionMs": 78,
        "p95ExecutionMs": 250,
        "errorRate": 0.018,
        "periodStart": "2025-11-01T...",
        "periodEnd": "2025-11-04T...",
        "sampleSize": 1200
      },
      "regression": {
        "avgExecutionDelta": +33,
        "avgExecutionDeltaPct": +73.3,
        "p95ExecutionDelta": +130,
        "errorRateDelta": +0.013,
        "severity": "high",
        "detected": true
      }
    }
  ],
  "summary": {
    "totalTools": 12,
    "toolsWithRegressions": 2,
    "highSeverity": 1,
    "mediumSeverity": 1
  }
}
```

---

### GET /api/tools/regression/:tool_name

Get regression statistics for a specific tool.

---

### POST /api/tools/regression/:tool_name/clear

Clear regression baseline for a tool (resets to current as new baseline).

**Response**:
```json
{
  "ok": true,
  "tool": "read_file",
  "action": "baseline_reset",
  "newBaseline": {
    "avgExecutionMs": 78,
    "p95ExecutionMs": 250,
    "errorRate": 0.018,
    "timestamp": "2025-11-04T..."
  }
}
```

---

## Resource Monitoring

Track CPU, memory, and disk usage per tool (codex.plan Phase 2, T212).

### GET /api/tools/resources

Get resource usage for all tools.

**Response**:
```json
{
  "ok": true,
  "resources": [
    {
      "toolName": "read_file",
      "totalCalls": 1234,
      "resources": {
        "cpu": {
          "totalMs": 12340,
          "avgMs": 10,
          "maxMs": 450,
          "p95Ms": 45
        },
        "memory": {
          "totalBytes": 52428800,
          "avgBytes": 42496,
          "maxBytes": 1048576,
          "p95Bytes": 131072
        },
        "disk": {
          "totalReadBytes": 104857600,
          "totalWriteBytes": 0,
          "avgReadBytes": 85000,
          "avgWriteBytes": 0
        }
      },
      "limits": {
        "maxReadBytes": 65536,
        "maxWriteBytes": 65536,
        "timeoutMs": 30000
      },
      "violations": {
        "sizeExceeded": 5,
        "timeoutExceeded": 0
      }
    }
  ],
  "summary": {
    "totalCpuMs": 45678,
    "totalMemoryBytes": 134217728,
    "totalDiskReadBytes": 524288000,
    "totalDiskWriteBytes": 104857600
  }
}
```

---

### GET /api/tools/resources/:tool_name

Get resource usage for a specific tool.

---

### POST /api/tools/resources/:tool_name/clear

Clear resource usage statistics for a tool.

---

## Configuration

### Environment Variables

**Tool Execution**:
- `TOOLS_FS_ROOT` - Sandbox root directory (default: cwd)
- `TOOLS_MAX_READ_BYTES=65536` - Max file read size
- `TOOLS_MAX_WRITE_BYTES=65536` - Max file write size
- `TOOL_ALLOW=get_time,echo` - Comma-separated allowlist (default: all)

**Tool Features**:
- `FRONTEND_ENABLE_POWERSHELL=1` - Enable PowerShell tool
- `FRONTEND_ENABLE_BASH=1` - Enable Bash tool
- `FRONTEND_ENABLE_HTTP_FETCH=1` - Enable HTTP fetch tool
- `FRONTEND_ENABLE_SELF_UPDATE=1` - Enable self-update tool

**Monitoring**:
- `TOOLS_MAX_OUTPUT_BYTES=10240` - Max tool output size
- `TOOLS_MAX_OUTPUT_LINES=256` - Max output lines
- `TOOLS_TIMEOUT_MS=30000` - Tool execution timeout

**Approval System**:
- `TOOLS_APPROVAL_REQUIRED=1` - Require approval for new tools
- `TOOLS_APPROVAL_EXPIRES_MS=86400000` - Proposal expiry (24h default)

---

## Built-in Tools

### Core Tools
- `get_time` - Get current UTC timestamp
- `echo` - Echo text back
- `read_file` - Read file from sandbox
- `read_dir` - List directory contents
- `write_file` - Write file to sandbox

### Optional Tools (Gated)
- `run_powershell` - Execute PowerShell command (FRONTEND_ENABLE_POWERSHELL=1)
- `run_bash` - Execute Bash command (FRONTEND_ENABLE_BASH=1)
- `http_fetch` - Fetch HTTP resource (FRONTEND_ENABLE_HTTP_FETCH=1)

### Advanced Tools
- `create_task_card` - Generate TGT task card
- `check_pr_status` - Check GitHub PR status (requires gh CLI)

---

## Error Responses

### 403 Forbidden
Tool not in allowlist.

```json
{
  "ok": false,
  "error": "tool_not_allowed",
  "message": "Tool 'read_file' not in allowlist"
}
```

### 404 Not Found
Tool does not exist.

```json
{
  "ok": false,
  "error": "tool_not_found",
  "message": "Tool 'nonexistent' not found"
}
```

### 413 Payload Too Large
Tool output exceeds limits.

```json
{
  "ok": false,
  "error": "output_too_large",
  "message": "Tool output exceeded 10240 bytes",
  "actualBytes": 52428
}
```

### 408 Request Timeout
Tool execution timeout.

```json
{
  "ok": false,
  "error": "timeout",
  "message": "Tool execution exceeded 30000ms"
}
```

---

## Auditing

Tool executions are logged to:
- **ContextLog**: `.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl`
- **Audit Log**: `.forgekeeper/tools_audit.jsonl` (legacy)

**ContextLog Event**:
```json
{
  "id": "01HQXYZ...",
  "ts": "2025-11-04T12:34:56.789Z",
  "actor": "tool",
  "act": "tool_call",
  "conv_id": "conv_abc123",
  "trace_id": "trace_xyz789",
  "iter": 2,
  "name": "read_file",
  "status": "ok",
  "elapsed_ms": 45,
  "args_preview": "{\"path\":\"README.md\"}",
  "result_preview": "# Forgekeeper...",
  "bytes": 1234
}
```

---

## Implementation Files

**Main Router**: `frontend/server.mjs` (lines 742-1084)
**Tool Registry**: `frontend/server.tools.mjs`
**Tool Definitions**: `frontend/tools/*.mjs`
**Tool Aggregator**: `frontend/tools/index.mjs`

**Key Functions**:
- `getToolDefs()` - Get tool definitions
- `reloadTools()` - Reload from disk
- `writeToolFile(name, code)` - Write tool file
- `getToolErrorStats(name)` - Get error stats
- `getToolRegressionStats(name)` - Get regression stats
- `getToolResourceUsage(name)` - Get resource usage

---

## See Also

- [Tool Development Guide](../dev/tool_development.md) (TBD)
- [Sandbox Security](../security/sandbox.md) (TBD)
- [ContextLog Specification](../contextlog/adr-0001-contextlog.md)
- [codex.plan Task References](../../tasks.md) (T203, T205, T211, T212)

---

**Last Updated**: 2025-11-04
**Features**: codex.plan Phases 1-2 (Complete)
