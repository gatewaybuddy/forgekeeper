# vLLM Parameter Scope - Per-Request vs Server-Restart

**Date**: 2025-11-03
**Verified From**: `frontend/server.orchestrator.mjs:53-71`

---

## ✅ Per-Request Parameters (No Restart Needed)

These parameters are sent in the `/v1/chat/completions` request body and can be changed **per API call**:

| Parameter | Type | Default | Description | Impact |
|-----------|------|---------|-------------|--------|
| **temperature** | float | 0.0 | Sampling randomness (0=deterministic, 2=chaotic) | Response creativity |
| **top_p** | float | 0.4 | Nucleus sampling threshold | Vocabulary diversity |
| **top_k** | int | 0 | Limit to top K tokens (0=disabled) | Token selection restriction |
| **presence_penalty** | float | 0.0 | Penalize repeated topics (-2.0 to 2.0) | Topic diversity |
| **frequency_penalty** | float | 0.2 | Penalize frequent tokens (-2.0 to 2.0) | Token repetition |
| **repetition_penalty** | float | 1.0 | Native vLLM repetition penalty (>1 reduces repetition) | Repetition control |
| **min_p** | float | 0.0 | Minimum token probability threshold | Quality floor |
| **max_tokens** | int | 2048 | Maximum completion tokens | Response length |
| **stop** | array | [] | Stop sequences | Response termination |
| **length_penalty** | float | 1.0 | Favor longer (>1) or shorter (<1) responses | Length bias |

**Source Code Reference**: `frontend/server.orchestrator.mjs:54-71`
```javascript
const body = {
  model,
  messages: sanitizeMessagesForTools(messages),
  temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : Number(process.env.FRONTEND_TEMP || '0.0'),
  top_p: (typeof topP === 'number' && !Number.isNaN(topP)) ? topP : Number(process.env.FRONTEND_TOP_P || '0.4'),
  presence_penalty: ...,
  frequency_penalty: ...,
  max_tokens: ...,
  // ... sent directly to vLLM
};
```

---

## 🔴 Server-Restart Parameters (Baked into vLLM at Startup)

These parameters are set when vLLM starts and **CANNOT be changed per-request**:

| Parameter | Type | Current | Description | Restart Required |
|-----------|------|---------|-------------|------------------|
| **VLLM_MAX_MODEL_LEN** | int | 8192 | Maximum context window (prompt + completion) | ✅ YES |
| **VLLM_GPU_MEMORY_UTILIZATION** | float | 0.9 | Fraction of GPU memory to use (0-1) | ✅ YES |
| **VLLM_MAX_NUM_BATCHED_TOKENS** | int | 4096 | Maximum tokens in a batch | ✅ YES |
| **VLLM_DTYPE** | string | bfloat16 | Model weight precision | ✅ YES |
| **VLLM_TP** | int | 1 | Tensor parallelism (number of GPUs) | ✅ YES |

**To Change These**:
1. Update `.env` file
2. Run `docker compose restart vllm-core`
3. Wait ~30-60 seconds for model to reload

---

## 🎯 Testing Strategy Implications

### ✅ What We Can Test Without Restarts (Fast Iteration)

**All Per-Request Parameters**:
- Temperature exploration (0.0, 0.3, 0.5, 0.7, 1.0) → **No restart needed**
- Top-P tuning (0.2, 0.4, 0.6, 0.8, 0.95) → **No restart needed**
- Top-K experiments (0, 20, 50, 100) → **No restart needed**
- Repetition penalties (1.0, 1.1, 1.2) → **No restart needed**
- Frequency/Presence penalties → **No restart needed**
- Length penalties → **No restart needed**

**This means**: We can run **hundreds of tests** rapidly by just changing request parameters!

### 🔴 What Requires Restarts (Slow Iteration)

**Context Length Testing**:
- 8K → 10K → 12K → 16K requires 4 restarts (~2 minutes each)
- GPU memory tuning requires restarts
- Batch size tuning requires restarts

**This means**: We'll group these tests together to minimize restart overhead.

---

## 📊 Optimized Testing Plan

### Phase 1-2, 5-9: **NO RESTARTS NEEDED** (~85% of tests)
- Temperature, top_p, top_k, repetition, length penalties
- Can run rapidly in sequence

### Phase 3-4: **RESTARTS NEEDED** (~15% of tests)
- Context length exploration
- Grouped to minimize restart count (8 restarts total)

---

## 🛠️ Config File Format

Since most parameters are per-request, we'll store configs as **JSON files** (not .env files):

**File**: `llmconfig/samples/T3-8K-0.5.json`
```json
{
  "name": "T3-8K-0.5",
  "description": "8K context, temp=0.5 (moderate creativity)",
  "phase": "2-temperature",
  "requires_restart": false,
  "parameters": {
    "temperature": 0.5,
    "top_p": 0.4,
    "top_k": 0,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.2,
    "repetition_penalty": 1.0,
    "min_p": 0.0,
    "max_tokens": 2048,
    "length_penalty": 1.0
  },
  "env_overrides": {
    "VLLM_MAX_MODEL_LEN": 8192,
    "VLLM_GPU_MEMORY_UTILIZATION": 0.9,
    "VLLM_MAX_NUM_BATCHED_TOKENS": 4096
  }
}
```

**File**: `llmconfig/samples/C3-12K-0.0.json`
```json
{
  "name": "C3-12K-0.0",
  "description": "12K context, temp=0.0 (deterministic)",
  "phase": "3-context-deterministic",
  "requires_restart": true,  // <-- Needs vLLM restart
  "parameters": {
    "temperature": 0.0,
    "top_p": 0.4,
    "max_tokens": 3072
  },
  "env_overrides": {
    "VLLM_MAX_MODEL_LEN": 12288,
    "VLLM_MAX_NUM_BATCHED_TOKENS": 6144
  }
}
```

---

## ✨ Key Insight

**95% of our testing can happen WITHOUT restarting vLLM!**

This makes the testing process much faster than expected:
- **Per-request param tests**: ~2 seconds per test
- **Server-restart tests**: ~2 minutes per config change

Total time estimate: **~6-8 hours** instead of 18-20 hours!

---

## 🚀 Next Steps

1. Create `llmconfig/samples/` directory with JSON configs
2. Build test runner that reads JSON and passes parameters to API
3. Run fast tests first (no restarts)
4. Run slow tests last (context length)
5. Generate comparison reports

**This is MUCH more efficient than we initially thought!**
