# MCP Configuration Guide

## Overview

This guide provides detailed configuration instructions for Model Context Protocol (MCP) servers in Forgekeeper.

## Configuration File

MCP servers are configured in `.forgekeeper/mcp-servers.json`:

```json
{
  "servers": {
    "server_name": {
      "enabled": true,
      "command": "command_to_execute",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      },
      "description": "Optional description"
    }
  },
  "defaults": {
    "timeout": 30000
  }
}
```

## Server Configuration

### Required Fields

- **`enabled`** (boolean): Whether to start this server
  - `true`: Server will be started automatically
  - `false`: Server will be skipped

- **`command`** (string): Command to execute
  - Examples: `"npx"`, `"node"`, `"/usr/bin/python3"`
  - Must be in PATH or absolute path

- **`args`** (array): Command-line arguments
  - Examples: `["-y", "@modelcontextprotocol/server-github"]`
  - Use `-y` with npx to auto-install packages

### Optional Fields

- **`env`** (object): Environment variables
  - Supports `${VAR}` substitution from process.env
  - Example: `{"API_KEY": "${MY_API_KEY}"}`

- **`description`** (string): Human-readable description
  - Shown in logs and status endpoints
  - Example: `"GitHub API integration"`

### Defaults

- **`timeout`** (number): Default timeout in milliseconds
  - Applies to all servers unless overridden
  - Default: 30000 (30 seconds)

## Environment Variables

### MCP-Specific

```bash
# Enable/disable MCP integration (default: 1)
MCP_ENABLED=1

# Config file path (default: .forgekeeper/mcp-servers.json)
MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json

# Auto-reload on config changes (default: 1)
MCP_AUTO_RELOAD=1

# Health check interval in ms (default: 60000)
MCP_HEALTH_CHECK_INTERVAL=60000
```

### Server-Specific

Add environment variables for each server:

```bash
# GitHub server
GITHUB_TOKEN=ghp_your_token_here

# Postgres server
POSTGRES_URL=postgresql://user:pass@localhost:5432/db

# Slack server
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_TEAM_ID=T1234567890
```

## Examples

### GitHub Server

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
    }
  }
}
```

**Environment variables:**
```bash
GITHUB_TOKEN=ghp_your_personal_access_token
```

### Postgres Server

```json
{
  "servers": {
    "postgres": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${POSTGRES_URL}"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_URL}"
      },
      "description": "PostgreSQL database access"
    }
  }
}
```

**Environment variables:**
```bash
POSTGRES_URL=postgresql://user:password@localhost:5432/database
```

### Filesystem Server

```json
{
  "servers": {
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {},
      "description": "Filesystem operations"
    }
  }
}
```

No environment variables required.

### Multiple Servers

```json
{
  "servers": {
    "github": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${POSTGRES_URL}"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_URL}"
      }
    },
    "filesystem": {
      "enabled": false,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {}
    }
  },
  "defaults": {
    "timeout": 30000
  }
}
```

## Hot-Reload

When `MCP_AUTO_RELOAD=1`, the registry watches for config file changes:

1. **Save** `.forgekeeper/mcp-servers.json`
2. **Wait** 500ms (debounce)
3. **Stop** all running servers
4. **Reload** configuration
5. **Start** enabled servers
6. **Discover** tools from each server

**Logs:**
```
[MCP Registry] Config file changed, reloading...
[MCP Registry] Stopping all servers (2)
[MCP Registry] All servers stopped
[MCP Registry] Loaded config from: .forgekeeper/mcp-servers.json
[MCP Registry] Found 3 server definitions
[MCP Registry] Starting server: github
[MCP] Connected to server: github
[MCP] Discovered 8 tools from github
[MCP Registry] Started 1/3 servers
```

## Security Best Practices

### 1. Use Environment Variables

**Good:**
```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}"
  }
}
```

**Bad:**
```json
{
  "env": {
    "API_KEY": "hardcoded-secret-key"
  }
}
```

### 2. Disable Unused Servers

```json
{
  "servers": {
    "unused_server": {
      "enabled": false
    }
  }
}
```

### 3. Restrict Filesystem Access

```json
{
  "servers": {
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace/safe-dir"],
      "env": {}
    }
  }
}
```

### 4. Enable Guardrails in Production

```bash
ENABLE_FS_SANDBOX=1
ENABLE_LOG_REDACTION=1
RATE_LIMIT_ENABLED=1
RESOURCE_QUOTAS_ENABLED=1
```

## Troubleshooting

### Config Not Loading

**Symptoms:**
```
[MCP Registry] Config file not found - MCP servers will not be loaded
```

**Solution:**
Create `.forgekeeper/mcp-servers.json` or set `MCP_SERVERS_CONFIG` to correct path.

### Invalid JSON

**Symptoms:**
```
[MCP Registry] Failed to load config: Unexpected token } in JSON
```

**Solution:**
Validate JSON with `jq`:
```bash
jq . .forgekeeper/mcp-servers.json
```

### Environment Variable Not Resolved

**Symptoms:**
```
[MCP] Process error for github: Command failed
```

**Solution:**
1. Check environment variable is set:
   ```bash
   echo $GITHUB_TOKEN
   ```
2. Ensure `.env` file is loaded
3. Restart Forgekeeper frontend

### Server Won't Start

**Symptoms:**
```
[MCP Registry] Failed to start server github: spawn npx ENOENT
```

**Solution:**
1. Check command exists: `which npx`
2. Install package globally:
   ```bash
   npm install -g @modelcontextprotocol/server-github
   ```
3. Use absolute path: `"/usr/local/bin/npx"`

## Advanced Configuration

### Custom Timeouts

```json
{
  "servers": {
    "slow_server": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "slow-mcp-server"],
      "env": {},
      "timeout": 60000
    }
  },
  "defaults": {
    "timeout": 30000
  }
}
```

### Multiple Instances

```json
{
  "servers": {
    "github_org1": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN_ORG1}"
      },
      "description": "GitHub for Org 1"
    },
    "github_org2": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN_ORG2}"
      },
      "description": "GitHub for Org 2"
    }
  }
}
```

### Custom Server Paths

```json
{
  "servers": {
    "custom": {
      "enabled": true,
      "command": "node",
      "args": ["/workspace/custom-mcp-server/index.js"],
      "env": {
        "CONFIG_PATH": "/workspace/config.json"
      }
    }
  }
}
```

## See Also

- [README.md](./README.md) - MCP integration overview
- [PRE_BUILT_SERVERS.md](./PRE_BUILT_SERVERS.md) - Pre-built server guides
- [CUSTOM_SERVERS.md](./CUSTOM_SERVERS.md) - Creating custom servers
