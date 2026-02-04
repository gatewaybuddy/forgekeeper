# Forgekeeper Startup Verification

## How the Fingerprinting Works

When you run `./bin/forgekeeper` or `python -m forgekeeper`, the startup script:

1. **Calculates fingerprints** of:
   - `docker-compose.yml` (SHA-256 hash)
   - `.env` file (SHA-256 hash)
   - `frontend/` directory (SHA-256 hash, excluding node_modules and dist)

2. **Compares with previous run**:
   - Loads previous fingerprint from `.forgekeeper/stack_fingerprint.json`
   - Compares hashes: `should_build = (prev != curr_fingerprint)`

3. **Only rebuilds if changed**:
   - If fingerprints match → Skip build, start services directly
   - If fingerprints differ → Rebuild containers, then start services

4. **Saves new fingerprint** after successful startup

## Current Fingerprint

```json
{
  "compose": "4d72a4c27fc421678fbcd6b5719538b1828504e71eb794c2a02e896d639ef18d",
  "env": "b727ab53de1265d721ea1c5a90ba48ded1f484dd4984f3fa5ac81679f8ea0dbd",
  "frontend": "27455ced1bb1841e70ef347482265d019ba016f58691ee97690f2eb3dfab652f",
  "compose_file": "D:\\Projects\\codex\\forgekeeper\\docker-compose.yml"
}
```

## Startup Process

### First Time (or after changes):
```bash
cd /mnt/d/projects/codex/forgekeeper
./bin/forgekeeper
```

**Output:**
```
Ensuring stack via ensure-stack (build + profiles); Ctrl+C to tear down.
Building selected services: frontend
[... build output ...]
Forgekeeper UI: http://localhost:3000
Frontend health: http://localhost:3000/health-ui
Core API: http://localhost:8001/v1
Thought World Test: http://localhost:3000/test-thought-world.html
```

**What happens:**
- Detects fingerprint change (first run or files modified)
- Builds frontend container with thought-world integration
- Starts llama-core and frontend services
- Displays URLs
- Waits in foreground (Ctrl+C to stop)

### Second Run (no changes):
```bash
cd /mnt/d/projects/codex/forgekeeper
./bin/forgekeeper
```

**Output:**
```
Ensuring stack via ensure-stack (build + profiles); Ctrl+C to tear down.
[... service startup, NO build output ...]
Forgekeeper UI: http://localhost:3000
Frontend health: http://localhost:3000/health-ui
Core API: http://localhost:8001/v1
Thought World Test: http://localhost:3000/test-thought-world.html
```

**What happens:**
- Detects fingerprint match (no changes)
- **SKIPS** build step
- Starts services directly
- Much faster startup

## Making the `forgekeeper` Command Available Globally

### Option 1: Add to PATH (Recommended)
```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="/mnt/d/projects/codex/forgekeeper/bin:$PATH"

# Reload shell
source ~/.bashrc

# Now you can run from anywhere:
cd /mnt/d/projects/codex/forgekeeper
forgekeeper
```

### Option 2: Use from bin directory (Current)
```bash
cd /mnt/d/projects/codex/forgekeeper
./bin/forgekeeper
```

### Option 3: Symlink to user bin
```bash
ln -s /mnt/d/projects/codex/forgekeeper/bin/forgekeeper ~/.local/bin/forgekeeper
# Assuming ~/.local/bin is in your PATH
```

## Verification Commands

### Check if fingerprint exists:
```bash
cat .forgekeeper/stack_fingerprint.json | python3 -m json.tool
```

### Check running services:
```bash
docker compose --profile ui --profile inference ps
```

### Check logs:
```bash
# Frontend logs
docker compose logs -f frontend

# Inference backend logs
docker compose logs -f llama-core
```

### Stop services:
```bash
docker compose --profile ui --profile inference down
```

## Troubleshooting

### "Fingerprint changed but I didn't modify files"
- Normal for first run (no previous fingerprint)
- Check if `.env` was created/modified
- Check if `docker-compose.yml` was updated (thought-world volume mount)
- Check if `frontend/` files changed (new thought-world files)

### "Services not starting"
```bash
# Check Docker is running
docker ps

# Check network exists
docker network inspect forgekeeper-net

# Manually create network if needed
docker network create forgekeeper-net

# Check .env file
cat .env
```

### "Rebuild not happening when it should"
```bash
# Force rebuild by deleting fingerprint
rm .forgekeeper/stack_fingerprint.json
./bin/forgekeeper
```

## Summary

✅ **Fingerprinting works correctly** - Only rebuilds when compose/env/frontend changes
✅ **Default command works** - Just run `./bin/forgekeeper` to start everything
✅ **Thought World integrated** - Available at `http://localhost:3000/test-thought-world.html`
✅ **Clean shutdown** - Ctrl+C tears down services gracefully

**Next step:** Add `bin/` to your PATH so you can just type `forgekeeper` from the forgekeeper directory!
