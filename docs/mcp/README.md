# Model Context Protocol (MCP) Integration

## Overview

Forgekeeper integrates with the **Model Context Protocol (MCP)**, an open standard for connecting AI systems to external tools and data sources. This enables Forgekeeper to use:

- Pre-built MCP servers (GitHub, Postgres, Slack, Puppeteer, etc.)
- Custom MCP servers for specialized integrations
- Community MCP servers from the ecosystem

MCP tools appear alongside native Forgekeeper tools and are invoked seamlessly during conversations.

## Architecture

```
┌─────────────────────────────────────────┐
│         Forgekeeper Frontend            │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  Orchestrator                   │    │
│  │  (server.orchestrator.mjs)      │    │
│  └───────────┬─────────────────────┘    │
│              │                           │
│  ┌───────────▼─────────────────────┐    │
│  │  Tool Registry                   │    │
│  │  (server.tools.mjs)              │    │
│  └───┬──────────────────────┬──────┘    │
│      │ Native Tools         │ MCP Tools │
│  ┌───▼───────┐      ┌───────▼────────┐  │
│  │ read_file │      │ Tool Adapter   │  │
│  │ write_file│      │ (tool-adapter) │  │
│  │ git_*     │      └───────┬────────┘  │
│  │ run_bash  │              │           │
│  └───────────┘      ┌───────▼────────┐  │
│                     │  MCP Registry  │  │
│                     │  (registry)    │  │
│                     └───────┬────────┘  │
│                             │           │
└─────────────────────────────┼───────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                            │
┌───────▼────────┐  ┌──────────────┐  ┌──────────────┐
│  MCP Client    │  │  MCP Client  │  │  MCP Client  │
│  (GitHub)      │  │  (Postgres)  │  │  (Custom)    │
└───────┬────────┘  └──────┬───────┘  └──────┬───────┘
        │                  │                  │
┌───────▼────────┐  ┌──────▼───────┐  ┌──────▼───────┐
│ GitHub Server  │  │ Postgres     │  │ Custom       │
│ (stdio)        │  │ Server       │  │ Server       │
└────────────────┘  └──────────────┘  └──────────────┘
```

## Key Concepts

### 1. MCP Servers

MCP servers are external processes that provide tools, resources, and prompts via the Model Context Protocol. Each server runs as a separate process and communicates with Forgekeeper via stdio.

**Example servers:**
- `@modelcontextprotocol/server-github`: GitHub API integration
- `@modelcontextprotocol/server-postgres`: PostgreSQL database access
- `@modelcontextprotocol/server-filesystem`: Filesystem operations
- `@modelcontextprotocol/server-git`: Git repository operations
- `@modelcontextprotocol/server-slack`: Slack workspace integration
- `@modelcontextprotocol/server-puppeteer`: Browser automation

### 2. MCP Tools

MCP servers expose **tools** (functions) that the AI can call. Tools have:
- **Name**: Unique identifier (e.g., `create_issue`, `search_repositories`)
- **Description**: What the tool does
- **Input Schema**: JSON Schema defining required/optional parameters
- **Output**: Structured content response

### 3. MCP Resources

Servers can expose **resources** (data sources) like:
- File contents
- Database records
- API responses
- Configuration data

### 4. MCP Prompts

Servers can provide **prompt templates** for common workflows (e.g., "Create PR", "Analyze codebase").

## Quick Start

### 1. Configure MCP Servers

Create `.forgekeeper/mcp-servers.json`:

```json
{
  "servers": {
    "github": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "description": "GitHub API integration"
    },
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {},
      "description": "Filesystem operations"
    }
  },
  "defaults": {
    "timeout": 30000
  }
}
```

See `.forgekeeper/mcp-servers.example.json` for more examples.

### 2. Set Environment Variables

Add to your `.env`:

```bash
# Enable MCP (default: 1)
MCP_ENABLED=1

# Config path (default: .forgekeeper/mcp-servers.json)
MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json

# Auto-reload on config changes (default: 1)
MCP_AUTO_RELOAD=1

# Health check interval in ms (default: 60000)
MCP_HEALTH_CHECK_INTERVAL=60000

# GitHub token for GitHub server
GITHUB_TOKEN=ghp_your_token_here
```

### 3. Start Forgekeeper

```bash
npm --prefix forgekeeper/frontend run dev
```

The MCP registry will:
1. Load config from `.forgekeeper/mcp-servers.json`
2. Start all enabled servers
3. Discover tools from each server
4. Make tools available to the orchestrator

### 4. Use MCP Tools

MCP tools are automatically available in conversations:

**User:** Create a GitHub issue titled "Bug: Login fails" with body "Users cannot login"

**Assistant:** *Calls `mcp_github_create_issue` tool*

**Result:** Issue #123 created successfully

## Tool Naming

MCP tools are prefixed to avoid collisions with native tools:

- **Format:** `mcp_{server_name}_{tool_name}`
- **Example:** `mcp_github_create_issue`, `mcp_postgres_query`

This ensures:
- No conflicts with native tools (`read_file`, `write_file`, etc.)
- Clear indication of tool origin
- Easy filtering and debugging

## Configuration Reference

### Server Configuration

```json
{
  "servers": {
    "server_name": {
      "enabled": true,              // Enable/disable this server
      "command": "npx",             // Command to execute
      "args": ["-y", "package"],    // Command arguments
      "env": {                      // Environment variables
        "API_KEY": "${API_KEY}",    // Use ${VAR} for env var substitution
        "BASE_URL": "https://..."
      },
      "description": "..."          // Optional description
    }
  },
  "defaults": {
    "timeout": 30000                // Default timeout in milliseconds
  }
}
```

### Environment Variable Substitution

MCP supports `${VAR}` syntax for environment variables:

```json
{
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "DATABASE_URL": "${POSTGRES_URL}",
    "API_KEY": "${MY_API_KEY}"
  }
}
```

Variables are resolved from `process.env` at server startup.

## Monitoring

### Check MCP Status

```bash
curl http://localhost:3000/api/mcp/status
```

Response:
```json
{
  "enabled": true,
  "servers": ["github", "filesystem"],
  "stats": {
    "serverCount": 2,
    "toolCount": 15,
    "servers": [
      {
        "name": "github",
        "toolCount": 8,
        "connected": true,
        "uptime": 12000
      },
      {
        "name": "filesystem",
        "toolCount": 7,
        "connected": true,
        "uptime": 12000
      }
    ]
  },
  "config_path": ".forgekeeper/mcp-servers.json"
}
```

### Check Available Tools

```bash
curl http://localhost:3000/api/tools
```

MCP tools will be included in the response with `_mcp` metadata.

## Features

### 1. Auto-Discovery

When a server starts, Forgekeeper automatically discovers:
- All available tools
- All available resources
- All available prompts

These are merged into the unified tool registry.

### 2. Hot-Reload

When `MCP_AUTO_RELOAD=1`, the registry watches the config file for changes:

1. Config file is modified
2. Registry stops all servers
3. Registry reloads config
4. Registry starts enabled servers
5. Tools are re-discovered

**Debounce:** 500ms to allow file write to complete

### 3. Health Monitoring

The registry periodically health-checks all servers (default: 60s interval):

1. Try to list tools from the server
2. If health check fails → restart server
3. If restart fails → mark server as unhealthy

### 4. Reconnection

If a server crashes or disconnects:

1. Client detects disconnection
2. Attempt reconnection (max 3 attempts)
3. Exponential backoff (2s delay)
4. If all retries fail → emit `max-reconnects` event

### 5. ContextLog Integration

All MCP tool calls are logged to ContextLog:

```jsonl
{"id":"...","ts":"...","actor":"assistant","act":"tool_start","tool":"mcp_github_create_issue","args_preview":"..."}
{"id":"...","ts":"...","actor":"assistant","act":"tool_finish","tool":"mcp_github_create_issue","result_preview":"...","elapsed_ms":1234}
```

This enables:
- Full audit trail
- Performance monitoring
- Error tracking
- Metrics-informed prompting (MIP)

### 6. Guardrails Support

MCP tools respect all Forgekeeper guardrails:

- **Rate Limiting:** MCP tools count toward rate limits (if enabled)
- **Resource Quotas:** MCP tools count toward quotas (if enabled)
- **Log Redaction:** MCP tool results are redacted (if enabled)
- **Tool Allowlist:** MCP tools respect `TOOL_ALLOW` environment variable

## Pre-Built Servers

See [PRE_BUILT_SERVERS.md](./PRE_BUILT_SERVERS.md) for detailed guides on:

- GitHub server (`@modelcontextprotocol/server-github`)
- Postgres server (`@modelcontextprotocol/server-postgres`)
- Filesystem server (`@modelcontextprotocol/server-filesystem`)
- Git server (`@modelcontextprotocol/server-git`)
- Slack server (`@modelcontextprotocol/server-slack`)
- Puppeteer server (`@modelcontextprotocol/server-puppeteer`)

## Custom Servers

See [CUSTOM_SERVERS.md](./CUSTOM_SERVERS.md) for guides on:

- Creating custom MCP servers
- Implementing MCP protocol
- Testing custom servers
- Publishing custom servers

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
# Look for MCP initialization messages
docker logs forgekeeper-frontend-1 | grep "\[MCP\]"
```

**Common issues:**
- Missing config file → Create `.forgekeeper/mcp-servers.json`
- Invalid JSON → Validate with `jq`
- Missing environment variables → Check `${VAR}` substitutions
- Command not found → Install package (`npm install -g @modelcontextprotocol/server-*`)

### Tool Not Available

**Check tool discovery:**
```bash
curl http://localhost:3000/api/tools | jq '.names | map(select(startswith("mcp_")))'
```

**Common issues:**
- Server disabled → Set `"enabled": true` in config
- Server crashed → Check health with `/api/mcp/status`
- Tool not exported → Check server implementation

### Health Check Failures

**Symptoms:**
- Server restarting frequently
- Tools intermittently unavailable

**Solutions:**
- Increase health check interval: `MCP_HEALTH_CHECK_INTERVAL=120000`
- Check server logs for errors
- Verify environment variables are correct

### Performance Issues

**Check stats:**
```bash
curl http://localhost:3000/api/mcp/status | jq '.stats'
```

**Solutions:**
- Disable unused servers
- Increase timeout: `"timeout": 60000`
- Check for slow MCP server implementations

## Architecture Details

### Components

1. **`mcp/client.mjs`** - MCPClient wrapper
   - Manages server process lifecycle
   - Handles stdio communication
   - Discovers capabilities
   - Implements health checks

2. **`mcp/registry.mjs`** - MCPRegistry singleton
   - Loads configuration
   - Manages multiple servers
   - Aggregates capabilities
   - Monitors health

3. **`mcp/tool-adapter.mjs`** - Format converter
   - Converts MCP schema → OpenAI format
   - Routes tool calls to correct server
   - Transforms results

4. **`server.tools.mjs`** - Integration point
   - Merges MCP tools with native tools
   - Routes execution to MCP adapter
   - Applies guardrails

### Data Flow

**Tool Discovery:**
```
Registry.initialize()
  → loadConfig()
  → startAllServers()
    → MCPClient.start()
      → spawn(command, args)
      → client.connect(transport)
      → discoverCapabilities()
        → listTools(), listResources(), listPrompts()
```

**Tool Execution:**
```
User message
  → Orchestrator
    → getToolDefs() [includes MCP tools]
    → LLM decides to call tool
    → runTool(name, args)
      → Check if MCP tool (isMCPTool)
        → executeMCPTool()
          → getRegistry().getServer(name)
          → server.callTool(originalName, args)
          → transformResult()
```

## Security Considerations

### 1. Server Process Isolation

Each MCP server runs as a separate process:
- Isolated from Forgekeeper process
- Cannot directly access Forgekeeper memory
- Communicates only via stdio

### 2. Environment Variable Security

Use environment variables for secrets:
```json
{
  "env": {
    "API_KEY": "${API_KEY}"  // ✓ Good
  }
}
```

Never hardcode secrets:
```json
{
  "env": {
    "API_KEY": "sk-1234..."  // ✗ Bad
  }
}
```

### 3. Guardrails

MCP tools respect all guardrails:
- Redaction (if enabled)
- Rate limiting (if enabled)
- Resource quotas (if enabled)

Enable in production:
```bash
ENABLE_LOG_REDACTION=1
RATE_LIMIT_ENABLED=1
RESOURCE_QUOTAS_ENABLED=1
```

### 4. Server Allowlist

Disable untrusted servers:
```json
{
  "servers": {
    "untrusted_server": {
      "enabled": false
    }
  }
}
```

## References

- **MCP Specification:** https://github.com/anthropics/model-context-protocol
- **MCP SDK:** https://github.com/anthropics/model-context-protocol/tree/main/sdk
- **MCP Servers:** https://github.com/modelcontextprotocol/servers

## See Also

- [CONFIGURATION.md](./CONFIGURATION.md) - Detailed configuration guide
- [PRE_BUILT_SERVERS.md](./PRE_BUILT_SERVERS.md) - Guide to pre-built servers
- [CUSTOM_SERVERS.md](./CUSTOM_SERVERS.md) - Creating custom servers
- [../guides/CAPABILITY_LAYERS.md](../guides/CAPABILITY_LAYERS.md) - Security layers guide
