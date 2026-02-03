# Forgekeeper v3

Minimal AI agent with Claude Code as the brain.

## Philosophy

v3 is a radical simplification. Instead of 85,000+ lines trying to make local inference smart, we have ~2,000 lines that orchestrate Claude Code for the heavy lifting.

```
┌─────────────────────────────────────────┐
│  Interface (Telegram/Discord)           │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Task Loop (proactive, checks triggers) │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Claude Code Headless (the real brain)  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  JSONL Memory (simple, portable)        │
└─────────────────────────────────────────┘
```

## Quick Start

### Option A: Setup Wizard (Recommended)

```bash
cd v3
npm run setup
```

The setup wizard will:
1. Check prerequisites (Node.js 20+, Claude CLI)
2. Create data directories
3. Install dependencies
4. Walk you through configuration
5. Test the installation

### Option B: Docker

```bash
cd v3
cp .env.example .env
# Edit .env with ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN

# Set your workspace path
export WORKSPACE_PATH=/path/to/your/projects

# Run
docker compose up -d

# View logs
docker compose logs -f
```

### Option C: Manual

```bash
# 1. Install dependencies
cd v3
npm install

# 2. Create data directories
mkdir -p data/{tasks,goals,learnings,conversations}

# 3. Configure
cp .env.example .env
# Edit .env with your Telegram bot token

# 4. Run health check
npm run health

# 5. Start
npm start
```

## Getting Your Telegram Bot Token

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Copy the API token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Message [@userinfobot](https://t.me/userinfobot) to get your user ID
5. Add both to your `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_ALLOWED_USERS=your_user_id
   TELEGRAM_ADMIN_USERS=your_user_id
   ```

## Architecture

### Core (~400 lines)
- `core/loop.js` - Main task loop, event-driven
- `core/memory.js` - JSONL storage for tasks, goals, learnings
- `core/claude.js` - Claude Code headless wrapper
- `core/guardrails.js` - Security controls

### Skills (~300 lines)
High-level task orchestration. Skills don't implement tools - they tell Claude Code what to do.

- `skills/code.js` - Write, fix, refactor code
- `skills/git.js` - Git operations, PRs
- `skills/research.js` - Web search, docs, codebase exploration
- `skills/self-extend.js` - Create new MCP servers

### Interface (~400 lines)
- `interface/bridge.js` - Connects MCP servers to main loop
- `mcp-servers/telegram.js` - Telegram bot

## Key Concepts

### Goals & Tasks

Goals are high-level objectives that decompose into tasks:

```
Goal: "Build a monitoring dashboard"
  └── Task: "Create React component for server status"
  └── Task: "Add API endpoint for metrics"
  └── Task: "Write tests"
```

### Self-Extension

Forgekeeper can create new capabilities by generating MCP servers:

```
You: "Add Slack integration"
Forgekeeper: "I'll create an MCP server for Slack. Here's the code..."
             [Requires your approval]
You: /approve abc123
Forgekeeper: "Slack integration ready!"
```

### Proactive Triggers

The loop checks for conditions and acts:
- Stale goals (no activity for 3+ days)
- Blocked tasks (stuck for 24+ hours)
- Scheduled tasks (cron-like)

## Configuration

See `.env.example` for all options. Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated user IDs | All |
| `TELEGRAM_ADMIN_USERS` | Users who can approve | None |
| `FK_LOOP_INTERVAL_MS` | Loop check interval | 10000 |
| `FK_CLAUDE_CMD` | Claude CLI command | claude |

## CLI Usage

```bash
# Start everything (loop + dashboard + Telegram)
npm start

# Create a task
node index.js task "Fix the login bug"

# Create a goal
node index.js goal "Implement user settings page"

# Check status
node index.js status

# Show help
node index.js help
```

When you run `npm start`, Forgekeeper automatically:
- Starts the task loop (checks every 10 seconds)
- Starts the web dashboard (http://localhost:3000)
- Connects to Telegram (if `TELEGRAM_BOT_TOKEN` is set)

## Security

Guardrails protect against:
- Destructive commands (rm -rf, DROP TABLE)
- Sensitive file access (~/.ssh, credentials)
- Rate limiting (100 calls/hour default)
- Self-extension requires approval

## Comparison to v1/v2

| Aspect | v1/v2 | v3 |
|--------|-------|-----|
| Lines of code | 85,000+ | ~2,000 |
| Tool definitions | Custom (duplicates Claude) | None (uses Claude's) |
| Inference | Local (weak) | Claude Code (strong) |
| Config options | 140+ | ~20 |
| Orchestration modes | 13 | 1 (simple loop) |
| Memory systems | 5 overlapping | 1 (JSONL) |

## Extending

### Add a Skill

```javascript
// skills/deploy.js
export default {
  name: 'deploy',
  description: 'Deploy to production',
  triggers: ['deploy', 'ship', 'release'],

  async execute(task) {
    // Claude Code does the work
    return await execute({
      description: `Deploy: ${task.description}`,
    });
  },
};
```

### Add an Interface

Create an MCP server in `mcp-servers/` that communicates via stdio JSON.

## Testing & Health

```bash
# Run unit tests
npm test

# Run health check
npm run health

# Run setup wizard
npm run setup
```

## Troubleshooting

**"Claude CLI not found"**
- Install Claude Code: https://claude.ai/code
- Or set `FK_CLAUDE_CMD` to your claude binary path

**"Task timed out"**
- Increase `FK_CLAUDE_TIMEOUT_MS` (default: 5 minutes)
- Check if Claude CLI is responsive: `claude --version`

**"Rate limit exceeded"**
- Wait for the hourly rate limit to reset
- Or increase `FK_MAX_CALLS_PER_HOUR`

**Telegram bot not responding**
- Check your `TELEGRAM_BOT_TOKEN` is correct
- Verify your user ID is in `TELEGRAM_ALLOWED_USERS`
- Check the console for error messages

## License

MIT
