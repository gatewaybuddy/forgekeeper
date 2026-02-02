# Thought World Quick Start

Thought World is now integrated into Forgekeeper! 🎉

## Run Everything with One Command

```bash
cd /mnt/d/projects/codex/forgekeeper
./bin/forgekeeper
```

Or use the Python module directly:
```bash
python -m forgekeeper
```

To make `forgekeeper` available globally, add to your PATH:
```bash
export PATH="/mnt/d/projects/codex/forgekeeper/bin:$PATH"
```

This automatically starts:
- 🔨 **Inference Backend** (llama-core on port 8001)
- 🌐 **Express Backend** (with thought-world on port 3000)
- 📊 **React UI** (served by Express)

---

## First Time Setup (Automatic Rebuild)

The first time you run, the frontend will be built automatically:

```bash
cd /mnt/d/projects/codex/forgekeeper
./bin/forgekeeper
```

**Smart rebuilding:** The startup script uses fingerprinting to detect changes. It will:
- ✅ **Rebuild** when `docker-compose.yml`, `.env`, or `frontend/` files change
- ✅ **Skip rebuild** when nothing has changed (faster startup!)

See `STARTUP_VERIFICATION.md` for details on how fingerprinting works.

---

## Access Points

Once running, you'll see URLs like:

```
Forgekeeper UI: http://localhost:3000
Frontend health: http://localhost:3000/health-ui
Core API: http://localhost:8001/v1
Thought World Test: http://localhost:3000/test-thought-world.html
```

**Test Thought World:**
Open http://localhost:3000/test-thought-world.html in your browser!

---

## How It Works

When you run `python -m forgekeeper` or `forgekeeper`:

1. ✅ Creates `forgekeeper-net` Docker network
2. ✅ Builds frontend container (if needed)
3. ✅ Starts inference backend (llama-core)
4. ✅ Starts Express backend (includes thought-world)
5. ✅ Prints URLs to access services
6. ✅ Waits in foreground (Ctrl+C to stop)

---

## What's New

### Backend (`/api/chat/thought-world`)
- 3-agent consensus: Forge (Executor) → Loom (Verifier) → Anvil (Integrator)
- Integrated into Express server (server.mjs)
- Logs episodes to `.forgekeeper/thought_world/memory/episodes.jsonl`

### Test Page (`test-thought-world.html`)
- Beautiful UI showing all 3 agents deliberating
- Real-time consensus visualization
- Served by Express on port 3000

### Future: Full UI Integration
- Coming soon: Thought World mode in main Chat.tsx
- See `UI_MODERNIZATION_PLAN.md` for UI redesign plans

---

## Troubleshooting

### Port already in use
```bash
# Stop all Forgekeeper services
docker compose --profile ui --profile inference down

# Or stop specific service
docker compose stop frontend
```

### Changes not appearing
```bash
# Rebuild frontend container
docker compose build frontend
docker compose restart frontend
```

### View logs
```bash
# Frontend (Express backend)
docker compose logs -f frontend

# Inference backend
docker compose logs -f llama-core
```

---

## Environment Variables

Create/edit `.env` in the forgekeeper root:

```bash
# Frontend port (default: 3000)
FRONTEND_PORT=3000

# Anthropic API key (required for thought-world)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Inference backend
LLAMA_PORT_CORE=8001
FK_CORE_KIND=llama  # or vllm
```

---

## Next Steps

1. **Test it**: Open http://localhost:3000/test-thought-world.html
2. **Try a task**: "Create a function that validates email addresses"
3. **Watch agents deliberate**: Forge proposes → Loom reviews → Anvil decides
4. **Check logs**: `docker compose logs -f frontend`
5. **Review episode**: `.forgekeeper/thought_world/memory/episodes.jsonl`

---

**That's it! Thought World is running via `python -m forgekeeper`** 🚀
