# Forgekeeper v2 - Ollama Setup

## Current Situation
- ❌ Using `night-arch-ollama` from different project
- ✅ Works but not clean separation

## Recommended: Switch to Forgekeeper-Specific Ollama

### Step 1: Start Forgekeeper Ollama Container
```bash
cd /mnt/d/Projects/forgekeeper/v2

# Start forgekeeper-ollama on port 11435
docker-compose up -d forgekeeper-ollama

# Wait for it to be healthy
docker ps | grep forgekeeper-ollama
```

### Step 2: Pull Qwen Model
```bash
# Pull the model into forgekeeper container
docker exec forgekeeper-ollama ollama pull qwen2.5-coder:7b

# Verify
docker exec forgekeeper-ollama ollama list
```

### Step 3: Update Forgekeeper v2 Configuration
Edit `v2/.env`:
```bash
# Change from night-arch Ollama
LOCAL_QWEN_URL="http://127.0.0.1:11435/v1"  # Note: port 11435 instead of 11434
LOCAL_QWEN_MODEL="qwen2.5-coder:7b"
```

### Step 4: Restart Forgekeeper v2 Server
```bash
# Rebuild
npm run build

# Restart
npm start
```

### Step 5: Verify It Works
```bash
# Test direct Ollama access
curl http://localhost:11435/api/tags

# Test via v2 API
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{orchestrate(input:{userMessage:\"test\",maxIterations:1}){sessionId}}"}'
```

### Step 6: (Optional) Stop night-arch-ollama
```bash
# Once forgekeeper-ollama is working
docker stop night-arch-ollama

# Or leave it running for other projects
```

---

## Alternative: Keep Using night-arch-ollama

**Pros:**
- Already working
- No migration needed
- Model already downloaded

**Cons:**
- Mixing projects
- Port conflict potential
- Not clean architecture

**To Keep Current Setup:**
Just leave `.env` as is:
```bash
LOCAL_QWEN_URL="http://127.0.0.1:11434/v1"  # night-arch port
```

---

## Clean Up Old Forgekeeper v1 Containers

```bash
# Remove old vLLM container
docker rm forgekeeper-vllm-core-1

# Remove old pickybatad containers (if not needed)
docker rm pickybatad-frontend-dev pickybatad-backend-dev pickybatad-db-dev pickybatad-redis-dev pickybatad-celery-worker-dev pickybatad-celery-beat-dev
```

---

## Database Options

### Option A: Keep SQLite (Current)
```bash
DATABASE_URL="file:./dev.db"
```
**Pros:** Simple, no Docker container
**Cons:** Not production-ready

### Option B: Use Forgekeeper PostgreSQL
```bash
# Start postgres
docker-compose up -d forgekeeper-postgres

# Update .env
DATABASE_URL="postgresql://forgekeeper:forgekeeper_dev@localhost:5434/forgekeeper_v2"

# Run migrations
npx prisma migrate dev
```

---

## Summary

**Recommended Architecture:**
```
Forgekeeper v2 Stack:
├── forgekeeper-ollama (port 11435) ✨ NEW
├── forgekeeper-postgres (port 5434) - optional
└── Node.js server (port 4000)

Night-arch Stack (separate):
├── night-arch-ollama (port 11434)
├── night-arch-postgres (port 5433)
└── night-arch-redis (port 6380)
```

**Quick Start (Recommended):**
```bash
cd /mnt/d/Projects/forgekeeper/v2
docker-compose up -d forgekeeper-ollama
docker exec forgekeeper-ollama ollama pull qwen2.5-coder:7b
# Update .env: LOCAL_QWEN_URL="http://127.0.0.1:11435/v1"
npm start
```
