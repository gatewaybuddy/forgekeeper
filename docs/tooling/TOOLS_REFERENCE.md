# Tool Reference

**Complete documentation for all 19 tools in Forgekeeper's hardened execution system.**

---

## Table of Contents

1. [Overview](#overview)
2. [Tool Categories](#tool-categories)
3. [Available Tools](#available-tools)
   - [Utility Tools](#utility-tools)
   - [File System Tools](#file-system-tools)
   - [Network Tools](#network-tools)
   - [Git Tools](#git-tools)
   - [Shell Tools](#shell-tools)
   - [System Tools](#system-tools)
   - [Integration Tools](#integration-tools)
4. [Adding Custom Tools (Advanced)](#adding-custom-tools-advanced)
5. [Tool Development Best Practices](#tool-development-best-practices)

---

## Overview

Forgekeeper provides **19 pre-approved tools** that enable AI agents to interact with files, networks, git repositories, and system resources in a **secure, sandboxed environment**.

**Key Features:**
- **Allowlist-Enforced**: Only these 19 tools can execute (T11)
- **Schema-Validated**: All arguments validated before execution (T11)
- **Time-Limited**: Execution timeouts prevent runaway operations (T11)
- **Size-Limited**: Output size limits prevent memory exhaustion (T11)
- **Rate-Limited**: Token bucket prevents excessive API calls (T22)
- **Redacted Logs**: Sensitive data automatically removed from logs (T21)
- **Full Audit**: Complete execution trail in ContextLog (T12)

---

## Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Utility** | `echo`, `get_time` | Basic operations, testing |
| **File System** | `read_file`, `read_dir`, `write_file`, `write_repo_file` | File operations |
| **Network** | `http_fetch` | HTTP requests |
| **Git** | `git_status`, `git_diff`, `git_add`, `git_commit`, `git_push`, `git_pull` | Version control |
| **Shell** | `run_bash`, `run_powershell` | Command execution |
| **System** | `refresh_tools`, `restart_frontend` | System management |
| **Integration** | `create_task_card`, `check_pr_status` | External integrations |

---

## Available Tools

### Utility Tools

#### echo

**Description:** Echo back the provided text. Useful for confirming arguments and testing.

**Arguments:**
- `text` (string, required, max 10000 chars) - Text to echo back

**Returns:** string - The echoed text

**Example:**
```json
{
  "tool": "echo",
  "arguments": {
    "text": "Hello, World!"
  }
}
```

**Response:**
```json
"Hello, World!"
```

**Common Errors:**
- `Missing required argument: text` - Forgot to provide text
- `Argument 'text' exceeds maximum length` - Text > 10000 chars

**Use Cases:**
- Testing tool execution
- Confirming argument parsing
- Debugging AI agent responses

---

#### get_time

**Description:** Get the current time in ISO 8601 format (UTC).

**Arguments:** None

**Returns:** string - ISO 8601 timestamp (UTC)

**Example:**
```json
{
  "tool": "get_time",
  "arguments": {}
}
```

**Response:**
```json
"2025-11-16T15:30:45.123Z"
```

**Common Errors:** None (no arguments to validate)

**Use Cases:**
- Timestamping events
- Scheduling tasks
- Time-based logic
- Log correlation

---

### File System Tools

All file system tools operate within a **sandboxed directory** defined by `TOOLS_FS_ROOT` (default: `.forgekeeper/sandbox`). Paths are relative to this root and cannot escape it.

#### read_file

**Description:** Read a text file under the sandbox root. Returns up to `MAX_READ_BYTES` unless a smaller `maxBytes` is provided.

**Arguments:**
- `file` (string, required, max 4096 chars) - File path relative to sandbox root
- `encoding` (string, optional, default: 'utf8') - Text encoding
- `maxBytes` (integer, optional) - Maximum bytes to read (default from config)

**Returns:** object
```json
{
  "path": "relative/path/to/file.txt",
  "bytes": 12345,
  "readBytes": 4096,
  "truncated": true,
  "encoding": "utf8",
  "content": "file contents..."
}
```

**Example:**
```json
{
  "tool": "read_file",
  "arguments": {
    "file": "notes.txt",
    "maxBytes": 1024
  }
}
```

**Response:**
```json
{
  "path": "notes.txt",
  "bytes": 2048,
  "readBytes": 1024,
  "truncated": true,
  "encoding": "utf8",
  "content": "First 1024 bytes of content..."
}
```

**Common Errors:**
- `file is required` - Missing file argument
- `ENOENT: no such file or directory` - File doesn't exist
- `Path traversal detected` - Attempting to escape sandbox

**Security:**
- **Sandboxed**: Cannot read files outside `TOOLS_FS_ROOT`
- **Size-Limited**: Prevents reading huge files into memory
- **Redacted**: Sensitive data removed from log previews

**Use Cases:**
- Reading configuration files
- Analyzing code
- Loading test data
- Checking file contents

---

#### read_dir

**Description:** List contents of a directory under the sandbox root.

**Arguments:**
- `path` (string, optional, default: '.', max 4096 chars) - Directory path relative to sandbox root

**Returns:** object
```json
{
  "path": "relative/path",
  "entries": [
    { "name": "file1.txt", "isFile": true, "isDirectory": false },
    { "name": "subdir", "isFile": false, "isDirectory": true }
  ]
}
```

**Example:**
```json
{
  "tool": "read_dir",
  "arguments": {
    "path": "data"
  }
}
```

**Response:**
```json
{
  "path": "data",
  "entries": [
    { "name": "users.json", "isFile": true, "isDirectory": false },
    { "name": "logs", "isFile": false, "isDirectory": true }
  ]
}
```

**Common Errors:**
- `ENOENT: no such file or directory` - Directory doesn't exist
- `Path traversal detected` - Attempting to escape sandbox

**Use Cases:**
- Exploring directory structure
- Finding files
- Listing available data
- Directory validation

---

#### write_file

**Description:** Write a file under the sandbox root. Limited to `MAX_WRITE_BYTES` and path must stay within `TOOLS_FS_ROOT`.

**Arguments:**
- `file` (string, required, max 4096 chars) - File path relative to sandbox root
- `content` (string, required, max 10485760 bytes) - File content
- `overwrite` (boolean, optional, default: false) - Allow overwrite if file exists
- `encoding` (string, optional, default: 'utf8') - Text encoding

**Returns:** object
```json
{
  "ok": true,
  "path": "relative/path/to/file.txt",
  "bytes": 1234
}
```

**Example:**
```json
{
  "tool": "write_file",
  "arguments": {
    "file": "output.txt",
    "content": "Hello, World!",
    "overwrite": true
  }
}
```

**Response:**
```json
{
  "ok": true,
  "path": "output.txt",
  "bytes": 13
}
```

**Common Errors:**
- `file and content are required` - Missing arguments
- `content too large (> N bytes)` - Content exceeds limit
- `file exists (set overwrite=true to replace)` - File exists and overwrite=false
- `Path traversal detected` - Attempting to escape sandbox

**Security:**
- **Sandboxed**: Cannot write outside `TOOLS_FS_ROOT`
- **Size-Limited**: Prevents writing huge files
- **Overwrite Protection**: Default prevents accidental overwrites

**Use Cases:**
- Saving generated content
- Creating test files
- Writing logs
- Storing intermediate results

---

#### write_repo_file

**Description:** Write a file to the repository root (outside sandbox). Requires `FRONTEND_ENABLE_SELF_UPDATE=1`. More restricted than `write_file`.

**Arguments:**
- `path` (string, required, max 4096 chars) - File path relative to repository root
- `content` (string, required, max 65536 bytes) - File content (64KB limit)

**Returns:** object
```json
{
  "ok": true,
  "path": "relative/path/to/file.txt",
  "bytes": 1234
}
```

**Example:**
```json
{
  "tool": "write_repo_file",
  "arguments": {
    "path": "config/settings.json",
    "content": "{\"setting\": \"value\"}"
  }
}
```

**Common Errors:**
- `Self-update disabled` - `FRONTEND_ENABLE_SELF_UPDATE=1` not set
- `content too large (> 65536 bytes)` - Content exceeds 64KB limit
- `Path not allowed` - Path is not in allowed list

**Security:**
- **Feature-Gated**: Disabled by default
- **Strict Size Limit**: 64KB maximum
- **Allowlist**: Only specific paths allowed (configure separately)

**Use Cases:**
- Updating configuration files
- Self-modifying code (advanced)
- Automated documentation updates

---

### Network Tools

#### http_fetch

**Description:** Fetch a URL with GET and return up to a byte limit. Gated by `FRONTEND_ENABLE_HTTP_FETCH=1`.

**Arguments:**
- `url` (string, required, max 2048 chars) - HTTP or HTTPS URL to fetch (GET only)
- `maxBytes` (integer, optional, default from env) - Maximum bytes to read
- `timeout_ms` (integer, optional, default from env) - Timeout in milliseconds
- `headers` (object, optional) - Optional request headers (safe subset only: accept, user-agent, accept-language)

**Returns:** object
```json
{
  "url": "https://api.example.com/data",
  "finalUrl": "https://api.example.com/data",
  "ok": true,
  "status": 200,
  "contentType": "application/json",
  "bytes": 1234,
  "truncated": false,
  "text": "response body..."
}
```

**Example:**
```json
{
  "tool": "http_fetch",
  "arguments": {
    "url": "https://api.github.com/repos/gatewaybuddy/forgekeeper",
    "maxBytes": 10240,
    "timeout_ms": 5000,
    "headers": {
      "accept": "application/json"
    }
  }
}
```

**Response:**
```json
{
  "url": "https://api.github.com/repos/gatewaybuddy/forgekeeper",
  "finalUrl": "https://api.github.com/repos/gatewaybuddy/forgekeeper",
  "ok": true,
  "status": 200,
  "contentType": "application/json; charset=utf-8",
  "bytes": 3456,
  "truncated": false,
  "text": "{\"name\":\"forgekeeper\",\"description\":\"...\"}"
}
```

**Common Errors:**
- `HTTP fetch disabled (set FRONTEND_ENABLE_HTTP_FETCH=1)` - Feature disabled
- `url must be an absolute http(s) URL` - Invalid URL
- `timeout` - Request exceeded timeout
- `Network error` - Connection failed

**Security:**
- **Feature-Gated**: Disabled by default
- **Size-Limited**: Prevents downloading huge files
- **Time-Limited**: Timeout prevents hanging requests
- **Safe Headers**: Only allowlisted headers accepted
- **GET Only**: No POST/PUT/DELETE (for safety)
- **Redacted**: URLs with credentials redacted in logs

**Use Cases:**
- Fetching API data
- Checking URLs
- Downloading small files
- Testing endpoints

---

### Git Tools

All git tools execute git commands in the current working directory or specified repository path.

#### git_status

**Description:** Check git repository status (modified files, branch, etc.)

**Arguments:**
- `repo_path` (string, optional, default: current directory) - Path to git repository

**Returns:** object
```json
{
  "cwd": "/path/to/repo",
  "status": "## main...origin/main\n M file.txt\n?? newfile.txt",
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_status",
  "arguments": {}
}
```

**Response:**
```json
{
  "cwd": "/workspace/forgekeeper",
  "status": "## feat/tool-docs...origin/feat/tool-docs\n M README.md\n M docs/tooling/TOOLS_REFERENCE.md",
  "stderr": null
}
```

**Common Errors:**
- `git_status error: not a git repository` - Not in a git repo
- `git_status error: git command not found` - Git not installed

**Use Cases:**
- Checking uncommitted changes
- Verifying current branch
- Listing modified files
- Pre-commit checks

---

#### git_diff

**Description:** Show differences in git repository (unstaged or staged changes).

**Arguments:**
- `staged` (boolean, optional, default: false) - Show staged changes (--cached) instead of unstaged
- `repo_path` (string, optional, default: current directory) - Path to git repository

**Returns:** object
```json
{
  "cwd": "/path/to/repo",
  "diff": "diff --git a/file.txt b/file.txt\nindex abc123..def456 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1,1 +1,1 @@\n-old line\n+new line",
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_diff",
  "arguments": {
    "staged": true
  }
}
```

**Common Errors:**
- `git_diff error: not a git repository` - Not in a git repo
- `git_diff error: timeout` - Diff too large

**Use Cases:**
- Reviewing changes before commit
- Comparing staged vs unstaged
- Generating patches
- Code review

---

#### git_add

**Description:** Stage files for commit.

**Arguments:**
- `files` (array, required, max 100 items) - List of file paths to stage

**Returns:** object
```json
{
  "ok": true,
  "files": ["file1.txt", "file2.txt"],
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_add",
  "arguments": {
    "files": ["README.md", "docs/tooling/QUICKSTART.md"]
  }
}
```

**Common Errors:**
- `files is required and must be an array` - Invalid argument
- `Argument 'files' exceeds maximum of 100 items` - Too many files
- `git_add error: pathspec 'file.txt' did not match any files` - File not found

**Use Cases:**
- Staging changes for commit
- Preparing pull requests
- Selective commits

---

#### git_commit

**Description:** Create a git commit with staged changes.

**Arguments:**
- `message` (string, required, max 10000 chars) - Commit message

**Returns:** object
```json
{
  "ok": true,
  "message": "feat: Add tool documentation",
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_commit",
  "arguments": {
    "message": "feat: Add comprehensive tool documentation\n\nAdded QUICKSTART.md, GUARDRAILS.md, TROUBLESHOOTING.md"
  }
}
```

**Common Errors:**
- `message is required` - Missing commit message
- `git_commit error: nothing to commit` - No staged changes
- `git_commit error: please tell me who you are` - Git config missing

**Use Cases:**
- Committing changes
- Creating checkpoints
- Automated commits

---

#### git_push

**Description:** Push commits to remote repository.

**Arguments:**
- `remote` (string, optional, max 256 chars, default: 'origin') - Remote name
- `branch` (string, optional, max 256 chars, default: current branch) - Branch name

**Returns:** object
```json
{
  "ok": true,
  "remote": "origin",
  "branch": "main",
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_push",
  "arguments": {
    "remote": "origin",
    "branch": "feat/tool-docs"
  }
}
```

**Common Errors:**
- `git_push error: no upstream branch` - Branch not tracking remote
- `git_push error: authentication failed` - Credentials invalid
- `git_push error: rejected` - Push rejected (non-fast-forward, hooks, etc.)

**Security:**
- **Credentials**: Uses git credential helper (environment/SSH)
- **Force Push**: Not supported (safety)

**Use Cases:**
- Publishing changes
- Syncing branches
- Automated deployments

---

#### git_pull

**Description:** Pull changes from remote repository.

**Arguments:**
- `remote` (string, optional, max 256 chars, default: 'origin') - Remote name
- `branch` (string, optional, max 256 chars, default: current branch) - Branch name

**Returns:** object
```json
{
  "ok": true,
  "remote": "origin",
  "branch": "main",
  "stderr": null
}
```

**Example:**
```json
{
  "tool": "git_pull",
  "arguments": {
    "remote": "origin",
    "branch": "main"
  }
}
```

**Common Errors:**
- `git_pull error: no tracking information` - Branch not tracking remote
- `git_pull error: merge conflict` - Conflicts during merge
- `git_pull error: authentication failed` - Credentials invalid

**Use Cases:**
- Syncing local repository
- Getting latest changes
- Automated updates

---

### Shell Tools

**⚠️ SECURITY WARNING:** Shell tools allow arbitrary command execution and are **disabled by default**. Only enable in trusted environments.

#### run_bash

**Description:** Run a bash script inside the frontend container (dev only; gated by env). Useful for quick setup and installing test deps.

**Arguments:**
- `script` (string, required, max 100000 chars) - Bash script (non-interactive). Use `&&` to chain commands.
- `timeout_ms` (integer, optional, default: 15000) - Timeout in milliseconds
- `cwd` (string, optional) - Working directory (container path)

**Returns:** object
```json
{
  "shell": "/bin/bash",
  "stdout": "command output...",
  "stderr": "error output..."
}
```

**Example:**
```json
{
  "tool": "run_bash",
  "arguments": {
    "script": "ls -la | grep .md",
    "timeout_ms": 5000
  }
}
```

**Response:**
```json
{
  "shell": "/bin/bash",
  "stdout": "-rw-r--r-- 1 user user 1234 Nov 16 15:30 README.md\n-rw-r--r-- 1 user user 5678 Nov 16 15:30 QUICKSTART.md",
  "stderr": ""
}
```

**Common Errors:**
- `Bash tool disabled (set FRONTEND_ENABLE_BASH=1 to enable)` - Feature disabled
- `script is required` - Missing script argument
- `bash error (exit 1): command not found` - Command doesn't exist
- `/bin/bash not found` - Bash not installed

**Security:**
- **Feature-Gated**: Disabled by default (`FRONTEND_ENABLE_BASH=0`)
- **Time-Limited**: 15 second default timeout
- **Output-Limited**: 4MB max buffer
- **Non-Interactive**: Cannot use interactive commands (vim, top, etc.)

**Use Cases:**
- Running build scripts
- Installing dependencies
- System diagnostics
- Automated testing

---

#### run_powershell

**Description:** Run a PowerShell script (Windows only). Gated by `FRONTEND_ENABLE_POWERSHELL=1`.

**Arguments:**
- `script` (string, required, max 100000 chars) - PowerShell script
- `timeout_ms` (integer, optional, default: 15000) - Timeout in milliseconds
- `cwd` (string, optional) - Working directory

**Returns:** object
```json
{
  "shell": "powershell.exe",
  "stdout": "command output...",
  "stderr": "error output..."
}
```

**Example:**
```json
{
  "tool": "run_powershell",
  "arguments": {
    "script": "Get-ChildItem | Where-Object {$_.Extension -eq '.md'}",
    "timeout_ms": 5000
  }
}
```

**Common Errors:**
- `PowerShell tool disabled` - Feature disabled
- `script is required` - Missing script argument
- `powershell error: command not found` - PowerShell not installed (Linux/Mac)

**Security:**
- **Feature-Gated**: Disabled by default (`FRONTEND_ENABLE_POWERSHELL=0`)
- **Time-Limited**: 15 second default timeout
- **Output-Limited**: 4MB max buffer
- **Windows Only**: Typically only works on Windows

**Use Cases:**
- Windows automation
- .NET operations
- System administration (Windows)

---

### System Tools

#### refresh_tools

**Description:** Reload tool definitions from disk. Useful during development when tools are modified.

**Arguments:** None

**Returns:** object
```json
{
  "ok": true,
  "count": 19,
  "tools": ["echo", "get_time", ...]
}
```

**Example:**
```json
{
  "tool": "refresh_tools",
  "arguments": {}
}
```

**Response:**
```json
{
  "ok": true,
  "count": 19,
  "tools": ["echo", "get_time", "read_file", ...]
}
```

**Common Errors:** None (rarely fails)

**Use Cases:**
- Development workflow
- Hot-reloading tools
- Testing tool changes

---

#### restart_frontend

**Description:** Restart the frontend server. Useful for applying configuration changes.

**Arguments:** None

**Returns:** object
```json
{
  "ok": true,
  "message": "Frontend restart initiated"
}
```

**Example:**
```json
{
  "tool": "restart_frontend",
  "arguments": {}
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Frontend restart initiated. Server will restart in 1 second."
}
```

**Common Errors:** None

**⚠️ Note:** This will disconnect all active clients. The frontend will restart automatically.

**Use Cases:**
- Applying config changes
- Clearing in-memory state
- Troubleshooting

---

### Integration Tools

#### create_task_card

**Description:** Create a TGT task card from telemetry or manual input.

**Arguments:**
- `title` (string, required, max 200 chars) - Task title
- `description` (string, required, max 10000 chars) - Task description
- `priority` (string, optional, enum: low/medium/high/critical, default: medium) - Task priority

**Returns:** object
```json
{
  "ok": true,
  "taskId": "T123",
  "title": "Fix HTTP timeout issue",
  "priority": "high"
}
```

**Example:**
```json
{
  "tool": "create_task_card",
  "arguments": {
    "title": "Fix HTTP timeout issue",
    "description": "HTTP requests are timing out after 30s. Increase timeout or optimize requests.",
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "taskId": "T321",
  "title": "Fix HTTP timeout issue",
  "priority": "high",
  "created_at": "2025-11-16T15:30:45.123Z"
}
```

**Common Errors:**
- `title is required` - Missing title
- `description is required` - Missing description
- `Argument 'priority' must be one of: low, medium, high, critical` - Invalid priority

**Use Cases:**
- Automated task creation from errors
- Capturing technical debt
- Planning improvements

---

#### check_pr_status

**Description:** Check GitHub PR status using GitHub CLI (`gh`).

**Arguments:**
- `pr_number` (number, required, min: 1) - Pull request number

**Returns:** object
```json
{
  "ok": true,
  "pr_number": 123,
  "status": "open",
  "title": "Add tool documentation",
  "url": "https://github.com/owner/repo/pull/123"
}
```

**Example:**
```json
{
  "tool": "check_pr_status",
  "arguments": {
    "pr_number": 123
  }
}
```

**Response:**
```json
{
  "ok": true,
  "pr_number": 123,
  "status": "open",
  "title": "T30 - Document tool usage patterns",
  "state": "OPEN",
  "url": "https://github.com/gatewaybuddy/forgekeeper/pull/123",
  "checks": "passing"
}
```

**Common Errors:**
- `Argument 'pr_number' must be of type number` - Wrong type
- `gh command not found` - GitHub CLI not installed
- `PR not found` - Invalid PR number

**Prerequisites:**
- GitHub CLI (`gh`) must be installed
- Must be authenticated (`gh auth login`)
- Must be in a git repository with GitHub remote

**Use Cases:**
- Checking PR status
- Monitoring CI/CD
- Automated PR workflows

---

## Adding Custom Tools (Advanced)

### Prerequisites

- Understanding of JavaScript/Node.js
- Familiarity with async/await
- Knowledge of JSON Schema
- Understanding of tool guardrails

### Step-by-Step Guide

#### Step 1: Create Tool File

Create a new file in `frontend/tools/`:

```javascript
// frontend/tools/my_tool.mjs

/**
 * Tool Definition
 * Follows OpenAI function calling format
 */
export const def = {
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'Brief description of what this tool does',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Description of this parameter'
        },
        optional_param: {
          type: 'number',
          description: 'Optional parameter with default'
        }
      },
      required: ['input'],
      additionalProperties: false,
    },
    strict: true,
  },
};

/**
 * Tool Implementation
 * @param {object} args - Tool arguments
 * @returns {any} - Tool result
 */
export async function run(args = {}) {
  // 1. Validate arguments (optional - schema validation happens automatically)
  if (typeof args.input !== 'string') {
    throw new Error('input must be a string');
  }

  // 2. Perform operation
  try {
    const result = await performOperation(args.input);
    return result;
  } catch (err) {
    // 3. Handle errors gracefully
    throw new Error(`my_tool error: ${err.message}`);
  }
}

async function performOperation(input) {
  // Your implementation here
  return { success: true, data: input };
}
```

#### Step 2: Add to Allowlist

Edit `frontend/config/tools.config.mjs`:

```javascript
export const DEFAULT_ALLOWED_TOOLS = [
  // ... existing tools
  'my_tool',  // Add your tool
];
```

#### Step 3: Add Argument Schema

In `frontend/config/tools.config.mjs`:

```javascript
export const TOOL_ARGUMENT_SCHEMAS = {
  my_tool: {
    input: {
      type: 'string',
      required: true,
      maxLength: 1000
    },
    optional_param: {
      type: 'number',
      required: false,
      min: 0,
      max: 100
    }
  }
};
```

#### Step 4: Test the Tool

Create a test file:

```javascript
// frontend/tests/my_tool.test.mjs
import { describe, it, expect } from 'vitest';
import { run } from '../tools/my_tool.mjs';

describe('my_tool', () => {
  it('should work with valid input', async () => {
    const result = await run({ input: 'test' });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should reject invalid input', async () => {
    await expect(run({ input: 123 })).rejects.toThrow('input must be a string');
  });

  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

Run tests:
```bash
npm --prefix frontend run test my_tool.test.mjs
```

#### Step 5: Refresh Tools

Restart the frontend or call `refresh_tools`:

```bash
# Option A: Restart
npm --prefix frontend run dev

# Option B: Refresh (if server is running)
curl -X POST http://localhost:3000/api/tools/refresh
```

#### Step 6: Verify

Check tool is available:

```bash
curl http://localhost:3000/config.json | jq '.tools[] | select(.function.name=="my_tool")'
```

### Best Practices

**1. Error Handling:**
```javascript
export async function run(args) {
  try {
    // Operation
  } catch (err) {
    // Always provide context in error messages
    throw new Error(`my_tool error: ${err.message}`);
  }
}
```

**2. Input Validation:**
```javascript
export async function run(args) {
  // Validate even if schema validation exists
  if (!args.input || typeof args.input !== 'string') {
    throw new Error('Invalid input');
  }

  // Sanitize input
  const sanitized = args.input.trim().toLowerCase();

  // Validate format
  if (!/^[a-z0-9_-]+$/.test(sanitized)) {
    throw new Error('Input must be alphanumeric');
  }
}
```

**3. Resource Limits:**
```javascript
const MAX_ITERATIONS = 1000;
const TIMEOUT_MS = 5000;

export async function run(args) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Use signal for abort
    const result = await fetch(url, { signal: controller.signal });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
```

**4. Async Best Practices:**
```javascript
export async function run(args) {
  // ✅ Good: Use async/await
  const result = await asyncOperation();

  // ❌ Bad: Don't use sync operations
  // const result = fs.readFileSync(path);  // Blocks event loop!

  return result;
}
```

**5. Return Structured Data:**
```javascript
export async function run(args) {
  // ✅ Good: Return structured object
  return {
    ok: true,
    data: result,
    metadata: { timestamp: Date.now() }
  };

  // ❌ Bad: Return raw strings for complex data
  // return JSON.stringify(result);
}
```

**6. Logging:**
```javascript
export async function run(args) {
  // Log important events (will be redacted automatically)
  console.log('[my_tool] Starting operation');

  try {
    const result = await operation();
    console.log('[my_tool] Operation succeeded');
    return result;
  } catch (err) {
    console.error('[my_tool] Operation failed:', err.message);
    throw err;
  }
}
```

### Testing Checklist

- [ ] Valid input produces expected output
- [ ] Invalid input throws clear error
- [ ] Missing required args throws error
- [ ] Args exceeding limits are rejected
- [ ] Timeout is enforced (if applicable)
- [ ] Output size is limited (if applicable)
- [ ] Sensitive data is redacted in logs
- [ ] Error messages are helpful
- [ ] Tool completes within timeout
- [ ] Memory usage is reasonable

---

## Tool Development Best Practices

### Security

1. **Never Trust Input**: Always validate and sanitize
2. **Principle of Least Privilege**: Request minimal permissions
3. **Fail Securely**: Errors should not leak sensitive info
4. **Audit Everything**: Log all operations to ContextLog
5. **Redact Secrets**: Never log credentials or API keys

### Performance

1. **Async Operations**: Use async I/O, never block
2. **Timeouts**: Always set timeouts for external calls
3. **Size Limits**: Limit input/output sizes
4. **Streaming**: Use streaming for large data
5. **Caching**: Cache expensive operations when safe

### Reliability

1. **Error Messages**: Provide actionable error messages
2. **Graceful Degradation**: Handle partial failures
3. **Idempotency**: Make operations idempotent when possible
4. **Retries**: Implement exponential backoff for retries
5. **Testing**: Write comprehensive unit tests

### Maintainability

1. **Documentation**: Document parameters and return values
2. **Type Hints**: Use JSDoc for type information
3. **Code Style**: Follow project conventions
4. **Versioning**: Version tool definitions for compatibility
5. **Deprecation**: Provide migration path for breaking changes

---

**Last Updated:** 2025-11-16
**Milestone:** M1 - Tool Hardening Complete
**Tasks:** T11, T12, T21, T22, T28, T29, T30

**Related Docs:**
- [QUICKSTART.md](QUICKSTART.md) - Getting started
- [GUARDRAILS.md](GUARDRAILS.md) - Security features
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common errors
