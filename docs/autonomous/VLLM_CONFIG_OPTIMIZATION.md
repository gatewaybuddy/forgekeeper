# vLLM Configuration Optimization Guide

**Date**: 2025-11-03
**Model**: gpt-oss-20b (GPT-OSS 20B)
**Current Context Length**: 8192 tokens
**Purpose**: Optimize inference for autonomous agent reasoning

---

## Current Configuration (SAFE-FALLBACK)

This is your current **production configuration** - save this as the fallback if experiments go wrong.

### Server-Side Settings (Restart Required)

```bash
# ===== SAFE-FALLBACK CONFIG (SAVE THIS!) =====
FK_CORE_KIND=vllm
VLLM_MODEL_CORE=/models/gpt-oss-20b
VLLM_DTYPE=bfloat16
VLLM_MAX_MODEL_LEN=8192              # Context window
VLLM_GPU_MEMORY_UTILIZATION=0.9      # 90% GPU memory
VLLM_MAX_NUM_BATCHED_TOKENS=4096     # Batch size
VLLM_TP=1                            # Tensor parallelism (1 GPU)
```

**When These Change**: Requires `docker compose restart vllm-core`

### Runtime Settings (Tunable Per-Request)

```bash
# Frontend Request Settings
FRONTEND_MAX_TOKENS=2048             # Max tokens per response
FRONTEND_TEMP=0.0                    # Temperature (deterministic)
FRONTEND_TOP_P=0.4                   # Nucleus sampling
FRONTEND_CTX_LIMIT=4096              # Conversation context limit
FRONTEND_CONT_TOKENS=512             # Continuation tokens
FRONTEND_CONT_ATTEMPTS=2             # Auto-continuation attempts
```

**When These Change**: Take effect immediately on next request

---

## Understanding the Settings

### 🔴 Restart-Required Settings

These are baked into the vLLM server at startup. Changing them requires container restart.

#### `VLLM_MAX_MODEL_LEN` (Context Window)
- **Current**: 8192 tokens
- **What it does**: Maximum total tokens (prompt + completion) the model can handle
- **Recommendations**:
  - **Conservative**: 8192 (current - SAFE)
  - **Balanced**: 12288 (50% increase - moderate risk)
  - **Aggressive**: 16384 (2x current - requires testing)
  - **Maximum**: 32768 (model's theoretical max - may OOM)

**Trade-offs**:
- ✅ Larger = More context for reasoning, fewer truncations
- ❌ Larger = More GPU memory, slower inference, higher OOM risk

**Recommendation for Autonomous Agent**: **12288** - Gives room for multi-step reasoning without excessive memory pressure

#### `VLLM_GPU_MEMORY_UTILIZATION`
- **Current**: 0.9 (90%)
- **What it does**: Fraction of GPU memory vLLM can use
- **Recommendations**:
  - **Conservative**: 0.85 (leaves more headroom)
  - **Balanced**: 0.9 (current - SAFE)
  - **Aggressive**: 0.95 (maximum utilization)

**Trade-offs**:
- ✅ Higher = More KV cache, faster batching
- ❌ Higher = Risk of OOM crashes

**Recommendation**: **Keep at 0.9** (current is good)

#### `VLLM_MAX_NUM_BATCHED_TOKENS`
- **Current**: 4096
- **What it does**: Maximum tokens processed in a single batch
- **Recommendations**:
  - **Conservative**: 4096 (current - SAFE)
  - **Balanced**: 6144
  - **Aggressive**: 8192

**Trade-offs**:
- ✅ Higher = Better throughput for multiple requests
- ❌ Higher = More memory, may cause OOM

**Recommendation**: **6144** - Moderate increase for better autonomous agent throughput

#### `VLLM_DTYPE`
- **Current**: bfloat16
- **What it does**: Precision of model weights
- **Options**: `float16`, `bfloat16`, `float32`

**Recommendation**: **Keep at bfloat16** (optimal for most GPUs, good stability)

#### `VLLM_TP` (Tensor Parallelism)
- **Current**: 1 (single GPU)
- **What it does**: Split model across N GPUs
- **Options**: 1, 2, 4, 8 (must match available GPUs)

**Recommendation**: **Keep at 1** unless you have multiple GPUs

---

### 🟢 Runtime-Tunable Settings

These can be changed per-request via API parameters. No restart needed.

#### `temperature`
- **Current**: 0.0 (deterministic)
- **What it does**: Randomness in token selection
  - `0.0` = Always pick highest probability token (deterministic)
  - `0.7` = Moderate creativity
  - `1.0` = High creativity
  - `2.0` = Very random

**Recommendations by Use Case**:
| Use Case | Temperature | Rationale |
|----------|-------------|-----------|
| **Alternative Generation** | **0.8-1.0** | Need diverse creative alternatives |
| **Effort Estimation** | **0.3-0.5** | Some variability but mostly analytical |
| **Alignment Checking** | **0.2** | Fairly deterministic yes/no decisions |
| **Reflection** | **0.5-0.7** | Balance between consistency and insight |
| **Tool Call Generation** | **0.0-0.2** | Must be precise, follow schema |

**Current Problem**: `FRONTEND_TEMP=0.0` means the agent ALWAYS generates the same alternative for the same situation. This may explain why it kept trying `echo` - it was deterministically generating that response.

**Recommendation**: **Set default to 0.7**, but allow per-phase tuning (see Advanced Config below)

#### `top_p` (Nucleus Sampling)
- **Current**: 0.4 (fairly restrictive)
- **What it does**: Only sample from tokens comprising top P probability mass
  - `0.4` = Top 40% of probability mass
  - `0.9` = Top 90% (more diverse)
  - `1.0` = No filtering

**Recommendations**:
- **Conservative**: 0.4 (current)
- **Balanced**: 0.7
- **Creative**: 0.9

**Recommendation**: **0.8** - Allow more diversity in reasoning

#### `max_tokens`
- **Current**: 2048
- **What it does**: Maximum tokens in a single response
- **Recommendations**:
  - **Alternative Generation**: 1024 (short responses)
  - **Reflection**: 1536 (detailed reasoning)
  - **Tool Execution**: 512 (concise outputs)

**Recommendation**: **Increase to 2048-3072** for richer reflections

#### `top_k`
- **Current**: Not set (vLLM default: 50)
- **What it does**: Only sample from top K most likely tokens
- **Recommendations**:
  - **Conservative**: 20-30
  - **Balanced**: 40-50
  - **Creative**: 80-100

**Recommendation**: **50** (vLLM default is fine)

#### `frequency_penalty` & `presence_penalty`
- **Current**: Not set (defaults to 0)
- **What they do**:
  - `frequency_penalty`: Reduce likelihood of repeated tokens (0.0-2.0)
  - `presence_penalty`: Encourage new topics (0.0-2.0)

**Recommendations**:
- **Alternative Generation**: `frequency_penalty=0.3, presence_penalty=0.5` (encourage diversity)
- **Reflection**: `frequency_penalty=0.1, presence_penalty=0.1` (slight novelty)
- **Tool Calls**: `frequency_penalty=0, presence_penalty=0` (strict schema adherence)

---

## Optimized Configurations

### Config 1: SAFE_EXTENDED (Minimal Changes)

**Goal**: Increase context slightly, add some creativity
**Risk**: ⚠️ LOW

```bash
# Server (restart required)
VLLM_MAX_MODEL_LEN=10240             # +25% context
VLLM_GPU_MEMORY_UTILIZATION=0.9      # No change
VLLM_MAX_NUM_BATCHED_TOKENS=5120     # +25% batch

# Runtime (immediate)
FRONTEND_MAX_TOKENS=2560             # +25%
FRONTEND_TEMP=0.5                    # Add some creativity
FRONTEND_TOP_P=0.7                   # More diversity
FRONTEND_CTX_LIMIT=5120              # +25%
```

**Expected Benefits**:
- Longer context for multi-step reasoning
- More diverse alternatives
- Still very safe

**Testing**: Run simple git pull task

---

### Config 2: BALANCED_CREATIVE (Moderate Changes)

**Goal**: Significantly improve reasoning diversity
**Risk**: ⚠️⚠️ MEDIUM

```bash
# Server (restart required)
VLLM_MAX_MODEL_LEN=12288             # +50% context
VLLM_GPU_MEMORY_UTILIZATION=0.9      # No change
VLLM_MAX_NUM_BATCHED_TOKENS=6144     # +50% batch

# Runtime (immediate)
FRONTEND_MAX_TOKENS=3072             # +50%
FRONTEND_TEMP=0.7                    # Balanced creativity
FRONTEND_TOP_P=0.8                   # High diversity
FRONTEND_CTX_LIMIT=6144              # +50%
```

**Expected Benefits**:
- Much better alternative diversity
- Richer reflections
- Better tool call variety

**Testing**: Run git pull, then more complex task (e.g., "Add a new test file")

---

### Config 3: AGGRESSIVE_MAX (Maximum Performance)

**Goal**: Push model to limits for research
**Risk**: ⚠️⚠️⚠️ HIGH (may OOM, may hallucinate)

```bash
# Server (restart required)
VLLM_MAX_MODEL_LEN=16384             # 2x context
VLLM_GPU_MEMORY_UTILIZATION=0.95     # Maximum GPU
VLLM_MAX_NUM_BATCHED_TOKENS=8192     # 2x batch

# Runtime (immediate)
FRONTEND_MAX_TOKENS=4096             # 2x tokens
FRONTEND_TEMP=0.8                    # High creativity
FRONTEND_TOP_P=0.9                   # Very diverse
FRONTEND_CTX_LIMIT=8192              # 2x context
```

**Expected Benefits**:
- Maximum reasoning capability
- Very diverse alternatives
- Long-running tasks possible

**Risks**:
- May crash (OOM)
- May hallucinate more
- Slower inference

**Testing**: Only after Config 2 succeeds

---

### Config 4: PHASE_SPECIFIC (Advanced - Per-Phase Tuning)

**Goal**: Different sampling for different agent phases
**Risk**: ⚠️⚠️ MEDIUM (requires code changes)

**Implementation**: Modify `autonomous.mjs` to pass different parameters per phase:

```javascript
// Alternative Generation (creative)
const alternatives = await this.alternativeGenerator.generate(action, context, {
  temperature: 0.9,
  top_p: 0.9,
  frequency_penalty: 0.3,
  presence_penalty: 0.5,
});

// Effort Estimation (analytical)
const effort = await this.effortEstimator.estimate(alternative, context, {
  temperature: 0.3,
  top_p: 0.6,
});

// Reflection (balanced)
const reflection = await this.reflect(context, {
  temperature: 0.6,
  top_p: 0.8,
});

// Tool Call Execution (precise)
const toolCall = await executor.execute(tool, args, {
  temperature: 0.0,
  top_p: 0.4,
});
```

**Expected Benefits**:
- Optimal sampling for each phase
- Creative alternatives, precise execution
- Best of both worlds

---

## Recommended Testing Sequence

### Phase 1: Baseline Test (Current Config)
1. Run autonomous task: "What time is it?" (uses `get_time` tool)
2. Record: Success/Failure, Tool calls made, Iterations
3. Run autonomous task: "Check git status" (uses `git_status` tool)
4. Record: Success/Failure, Tool calls made, Iterations

**Goal**: Establish baseline with known-working config

---

### Phase 2: SAFE_EXTENDED
1. Update `.env` with Config 1 settings
2. Restart: `docker compose restart vllm-core`
3. Wait 30s for model reload
4. Repeat Phase 1 tests
5. Compare results

**Success Criteria**: Both tests pass, tools execute correctly

---

### Phase 3: BALANCED_CREATIVE
1. Update `.env` with Config 2 settings
2. Restart: `docker compose restart vllm-core`
3. Repeat Phase 1 tests
4. **New Test**: "Refresh the repo from origin" (the task that failed)
5. Compare alternative diversity

**Success Criteria**: Git pull task succeeds, alternatives are diverse

---

### Phase 4: PHASE_SPECIFIC (If Phase 3 succeeds)
1. Implement code changes in `autonomous.mjs`
2. Restart frontend: `docker compose restart frontend`
3. Repeat all tests
4. Measure improvement in success rate

---

## Parameter Quick Reference

| Setting | Restart Required? | Current | Safe | Balanced | Aggressive |
|---------|------------------|---------|------|----------|------------|
| `VLLM_MAX_MODEL_LEN` | ✅ Yes | 8192 | 10240 | 12288 | 16384 |
| `VLLM_GPU_MEMORY_UTILIZATION` | ✅ Yes | 0.9 | 0.9 | 0.9 | 0.95 |
| `VLLM_MAX_NUM_BATCHED_TOKENS` | ✅ Yes | 4096 | 5120 | 6144 | 8192 |
| `FRONTEND_MAX_TOKENS` | ❌ No | 2048 | 2560 | 3072 | 4096 |
| `FRONTEND_TEMP` | ❌ No | 0.0 | 0.5 | 0.7 | 0.8 |
| `FRONTEND_TOP_P` | ❌ No | 0.4 | 0.7 | 0.8 | 0.9 |
| `FRONTEND_CTX_LIMIT` | ❌ No | 4096 | 5120 | 6144 | 8192 |

---

## Monitoring During Tests

### Watch for OOM (Out of Memory)
```bash
# Check GPU memory usage
nvidia-smi --query-gpu=memory.used,memory.total --format=csv -l 1

# Check vLLM container logs
docker logs -f vllm-core
```

**Signs of Trouble**:
- Memory usage > 95%
- Container crashes with "CUDA out of memory"
- Inference hangs for > 60s

**Recovery**:
1. Stop container: `docker compose stop vllm-core`
2. Revert to SAFE-FALLBACK config in `.env`
3. Restart: `docker compose up -d vllm-core`

---

## Expected Impact on Autonomous Agent

### Problem: Tool Calls Failing
**Root Cause**: Alternative generator producing incorrect tool calls
**Config Impact**: ⚠️ **LOW** - This is a **code bug**, not a config issue

**However**, increasing `temperature` from 0.0 to 0.7 may help by:
- Generating different alternatives (breaking out of deterministic rut)
- Exploring tool call formats the LLM hasn't tried yet
- Increasing chance of stumbling upon correct schema

### Problem: Session Ending Prematurely
**Root Cause**: Unknown
**Config Impact**: ⚠️ **MEDIUM** - More tokens may allow fuller reflections

Increasing `FRONTEND_MAX_TOKENS` from 2048 to 3072 may:
- Allow agent to complete longer reasoning chains
- Prevent truncation mid-thought
- Give more room for debugging output

### Problem: Repetitive Alternatives
**Root Cause**: `temperature=0.0` is deterministic
**Config Impact**: ✅ **HIGH** - This is directly caused by config

Increasing `temperature` to 0.7-0.9 will:
- Generate different alternatives each iteration
- Explore diverse strategies
- Reduce likelihood of stuck loops

---

## Rollback Procedure

If any config causes problems:

```bash
# 1. Stop the stack
docker compose down

# 2. Revert .env to SAFE-FALLBACK (copy from this document)
nano .env  # Paste SAFE-FALLBACK config from top of this doc

# 3. Restart
docker compose up -d

# 4. Verify health
curl http://localhost:8001/v1/models
```

---

## Advanced: Per-Request Parameter Passing

vLLM accepts these parameters in the OpenAI API `/v1/chat/completions` request:

```json
{
  "model": "core",
  "messages": [...],
  "temperature": 0.7,              // ✅ Can override per request
  "top_p": 0.9,                    // ✅ Can override per request
  "top_k": 50,                     // ✅ Can override per request
  "max_tokens": 2048,              // ✅ Can override per request
  "frequency_penalty": 0.3,        // ✅ Can override per request
  "presence_penalty": 0.5,         // ✅ Can override per request
  "stop": ["###", "User:"],        // ✅ Can set per request
  "n": 1,                          // ✅ Number of completions
  "stream": false,                 // ✅ Streaming mode
  "logprobs": false,               // ✅ Return log probabilities
  "echo": false                    // ✅ Echo prompt in response
}
```

**Cannot be changed per-request** (server-side only):
- `max_model_len` - Baked into KV cache allocation
- `dtype` - Model weights are already loaded
- `tensor_parallel_size` - GPU distribution is fixed
- `gpu_memory_utilization` - Allocated at startup

---

## Next Steps

1. ✅ **Save SAFE-FALLBACK config** (done - copied above)
2. 📝 **Create test plan** (see Testing Sequence above)
3. 🧪 **Run baseline tests** with current config
4. 🔧 **Apply SAFE_EXTENDED** and retest
5. 📊 **Compare results** and decide next step
6. 🚀 **Proceed to BALANCED_CREATIVE** if safe tests pass
7. 🔬 **Only try AGGRESSIVE_MAX** for research (expect OOM risk)

**Recommended Path**: Start with **BALANCED_CREATIVE** (Config 2) - It's the sweet spot of improved performance without excessive risk.
