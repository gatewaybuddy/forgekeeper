# Forgekeeper Architecture Guide

## Overview

Forgekeeper is a minimal AI agent that uses **Claude Code as the brain**. It's designed for autonomous operation with human oversight via Telegram.

```
Telegram → Topic Router → Agent Pool → Claude Code (headless) → JSONL Memory
                              ↑
                         PM2 (process management)
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN

# Start with PM2 (recommended)
npm install -g pm2
npm run pm2:start

# Or start directly
npm start
```

## Directory Structure

```
forgekeeper/
├── index.js              # Main entry point
├── config.js             # Configuration (env-driven)
├── ecosystem.config.cjs  # PM2 configuration
├── package.json          # Dependencies
├── .env.example          # Environment template
│
├── core/                 # Core modules
│   ├── loop.js           # Main task loop (10s ticks)
│   ├── planner.js        # LLM-driven task decomposition
│   ├── claude.js         # Claude Code CLI wrapper
│   ├── memory.js         # JSONL storage
│   ├── guardrails.js     # Security controls
│   ├── agent-pool.js     # Parallel task execution
│   ├── agent-worker.js   # Worker thread for tasks
│   └── topic-router.js   # Multi-topic message handling
│
├── skills/               # High-level task handlers
│   ├── registry.js       # Skill loader
│   ├── code.js           # Code writing/editing
│   ├── git.js            # Git operations
│   ├── research.js       # Web research
│   ├── restart.js        # Self-restart via PM2
│   └── self-extend.js    # Create new skills
│
├── mcp-servers/          # MCP protocol servers
│   └── telegram.js       # Telegram bot
│
├── interface/            # User interfaces
│   └── dashboard.js      # Web dashboard
│
├── scripts/              # Utility scripts
│   └── health-check.js   # Health check
│
├── tests/                # Unit tests
│   └── unit/
│
├── data/                 # Runtime data (gitignored)
│   ├── tasks/            # Task JSONL files
│   ├── goals/            # Goal JSONL files
│   ├── learnings/        # Learning JSONL files
│   ├── conversations/    # Conversation history
│   └── user_sessions.json
│
├── logs/                 # PM2 logs (gitignored)
│
├── docs/                 # Documentation
│
└── legacy/               # v1/v2 code (reference only)
    ├── frontend/         # Old React frontend
    ├── forgekeeper/      # Old Python package
    └── ...
```

## Key Concepts

### 1. Task Loop
The main loop runs every 10 seconds:
1. Check pending tasks
2. Run through planner (decompose if complex)
3. Execute via Claude Code CLI
4. Record results to JSONL

### 2. Planner Agent
All tasks go through the planner first:
- **Simple tasks** → Execute directly
- **Complex tasks** → Decompose into 2-5 subtasks

### 3. Agent Pool
Optional parallel execution (enable with `FK_AGENT_POOL_ENABLED=1`):
- Configurable number of workers
- Tasks run in parallel across workers
- Queue when all workers busy

### 4. Topic Router
Handles multiple topics in one message (enable with `FK_TOPIC_ROUTER_ENABLED=1`):
- LLM-driven topic detection
- Routes tasks, questions, info separately
- Enables natural conversation with context switching

### 5. Skills
High-level task handlers that match patterns:
- `code.js` - write/edit/refactor code
- `git.js` - git operations
- `research.js` - web research
- `restart.js` - self-restart via PM2
- `self-extend.js` - create new skills

### 6. Memory (JSONL)
All state is stored in append-only JSONL files:
- Tasks: `data/tasks/{id}.json` + `_index.jsonl`
- Goals: `data/goals/{id}.json`
- Learnings: `data/learnings/learnings.jsonl`
- Conversations: `data/conversations/{userId}.jsonl`

### 7. Guardrails
Security controls:
- Destructive operations require confirmation
- Self-extension requires approval
- Rate limiting on Claude calls
- Path/command denylists

## Commands

### NPM Scripts
```bash
npm start           # Start directly
npm run dev         # Start with watch mode
npm run setup       # Interactive setup wizard
npm run health      # Run health check
npm test            # Run unit tests

# PM2 commands
npm run pm2:start   # Start with PM2
npm run pm2:stop    # Stop
npm run pm2:restart # Restart
npm run pm2:logs    # View logs
npm run pm2:status  # Status
npm run pm2:monit   # Monitor dashboard
```

### Telegram Commands
- `/start` - Welcome message
- `/help` - Available commands
- `/status` - Current status
- `/tasks` - List pending tasks
- `/goals` - List active goals
- `/task <description>` - Create a task
- `/goal <description>` - Create a goal
- `/approve <id>` - Approve pending request
- `/reject <id>` - Reject pending request
- `/newsession` - Reset conversation context

## Environment Variables

See `.env.example` for all options. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | (required) |
| `TELEGRAM_ALLOWED_USERS` | Allowed user IDs | (all) |
| `FK_CLAUDE_SKIP_PERMISSIONS` | Skip permission prompts | 0 |
| `FK_AGENT_POOL_ENABLED` | Enable parallel execution | 0 |
| `FK_AGENT_POOL_SIZE` | Number of workers | 3 |
| `FK_TOPIC_ROUTER_ENABLED` | Enable topic routing | 0 |

## Legacy Code

The `legacy/` directory contains the original v1/v2 codebase:
- Complex multi-service architecture
- React frontend
- Python CLI
- Local inference support

This is kept for reference but is not actively maintained. All new development should use the v3 architecture.

---

**Last updated**: 2025-02-03
**Version**: 3.1.0
