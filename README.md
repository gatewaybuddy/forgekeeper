# Forgekeeper

**A minimal AI agent that uses Claude Code as the brain.**

Forgekeeper is designed for autonomous operation with human oversight via Telegram. It features automatic task decomposition, parallel execution, and self-improvement capabilities.

## Features

- **🧠 Claude Code Integration** - Uses Claude Code CLI for real AI capabilities
- **📱 Telegram Interface** - Chat naturally, create tasks, approve actions
- **🔄 Task Decomposition** - Complex tasks automatically broken into smaller steps
- **⚡ Parallel Execution** - Optional multi-agent pool for concurrent tasks
- **🔀 Topic Routing** - Handle multiple topics in a single message
- **🔁 Self-Restart** - PM2 integration for process management
- **📝 JSONL Storage** - Simple, transparent state management

## Quick Start

```bash
# Clone the repository
git clone https://github.com/gatewaybuddy/forgekeeper.git
cd forgekeeper

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN

# Start with PM2 (recommended)
npm install -g pm2
npm run pm2:start

# Or start directly
npm start
```

## Usage

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/status` | Current system status |
| `/tasks` | List pending tasks |
| `/task <desc>` | Create a new task |
| `/goal <desc>` | Create a new goal |
| `/approve <id>` | Approve a pending request |
| `/newsession` | Reset conversation context |

### Natural Chat

Just send a message! Forgekeeper will:
- Answer questions directly
- Create tasks for action items ("Fix the login bug")
- Handle multiple topics in one message

## Architecture

```
Telegram → Topic Router → Planner → Agent Pool → Claude Code
                                         ↓
                                    JSONL Memory
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## Configuration

Key environment variables (see `.env.example` for all options):

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token (required) |
| `FK_CLAUDE_SKIP_PERMISSIONS` | Skip permission prompts (0/1) |
| `FK_AGENT_POOL_ENABLED` | Enable parallel execution (0/1) |
| `FK_TOPIC_ROUTER_ENABLED` | Enable multi-topic routing (0/1) |

## Development

```bash
npm run dev      # Start with watch mode
npm test         # Run unit tests
npm run health   # Check system health
npm run setup    # Interactive setup wizard
```

## PM2 Commands

```bash
npm run pm2:start   # Start with process management
npm run pm2:stop    # Stop
npm run pm2:restart # Restart
npm run pm2:logs    # View logs
npm run pm2:monit   # Monitor dashboard
```

## Legacy

The `legacy/` directory contains the original v1/v2 codebase for reference. It includes a more complex multi-service architecture with local inference support. All new development uses the streamlined v3 architecture.

## License

MIT

---

Built with [Claude Code](https://claude.ai/claude-code)
