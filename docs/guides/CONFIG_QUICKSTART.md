# vLLM Config Quickstart

## TL;DR

```bash
# Switch to recommended config (balanced creativity, +50% context)
bash scripts/switch-config.sh balanced_creative

# Or just copy manually
cp .env.balanced_creative .env
docker compose restart vllm-core
```

## Available Configs

| Config | Risk | Context | Temp | Use Case |
|--------|------|---------|------|----------|
| **safe_fallback** | ⚠️ LOW | 8K | 0.0 | Current production (fallback if problems) |
| **safe_extended** | ⚠️ LOW | 10K | 0.5 | +25% everything, minimal risk |
| **balanced_creative** | ⚠️⚠️ MEDIUM | 12K | 0.7 | **RECOMMENDED** for autonomous agent |
| **aggressive_max** | ⚠️⚠️⚠️ HIGH | 16K | 0.8 | Research only (may OOM) |

## Quick Switch

```bash
# Interactive switcher (recommended)
bash scripts/switch-config.sh balanced_creative

# Manual (faster)
cp .env.balanced_creative .env && docker compose restart vllm-core
```

## What Changed in Session 01K95JKJGE2TPRE99A57ZKY8CV?

**Problem**: Autonomous agent failed git pull task
- ❌ 0/6 tool calls succeeded
- ❌ All generated "echo" instead of git tools
- ❌ Session ended with "unknown" reason

**Root Causes**:
1. Alternative generator bug (generates wrong tool calls)
2. Temperature = 0.0 (deterministic, kept trying same thing)
3. Poor error recovery

**Config Impact**:
- Changing temp from 0.0 → 0.7 will help explore different strategies
- More context (8K → 12K) gives room for richer reflections
- **But the core bug is in code, not config**

## Recommended Testing Sequence

### 1. Baseline (current config)
```bash
# Don't change anything yet
# Run simple test in autonomous mode: "What time is it?"
# Record: Success/Failure, iterations, tool calls
```

### 2. Apply BALANCED_CREATIVE
```bash
bash scripts/switch-config.sh balanced_creative
# Rerun: "What time is it?"
# Then try: "Check git status"
# Compare alternative diversity
```

### 3. Test git pull (the task that failed)
```bash
# In autonomous mode: "Refresh the repo from origin"
# Should now generate diverse alternatives
# May still fail due to code bug, but should try different approaches
```

## Monitoring

```bash
# GPU memory
nvidia-smi --query-gpu=memory.used,memory.total --format=csv -l 1

# vLLM logs
docker logs -f vllm-core

# Frontend logs
docker logs -f frontend
```

## Rollback

```bash
# If problems occur
cp .env.safe_fallback .env
docker compose restart vllm-core
```

## Full Documentation

- **Session Analysis**: `docs/autonomous/SESSION_01K95JKJGE2TPRE99A57ZKY8CV_ANALYSIS.md`
- **Config Tuning Guide**: `docs/autonomous/VLLM_CONFIG_OPTIMIZATION.md`

## Key Takeaways

1. **temperature=0.0 is too restrictive** for autonomous agents
   - Agent generates same alternatives every time
   - Can't explore alternative strategies
   - **Fix**: Use temp=0.7 for alternative generation

2. **8K context may be limiting** multi-step reasoning
   - Reflections get truncated
   - Can't keep full history
   - **Fix**: Use 12K context

3. **Code bugs matter more than config**
   - Alternative generator is producing wrong tool calls
   - This is a code issue, not a tuning issue
   - Config changes will help, but won't fully solve the problem

4. **Start with BALANCED_CREATIVE**
   - Good balance of safety and capability
   - +50% context, temp=0.7
   - Low risk of OOM (tested on similar hardware)
