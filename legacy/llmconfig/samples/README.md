# vLLM Parameter Testing - Config Library

**Total Configs**: 36
**Created**: 2025-11-03
**Purpose**: Systematic parameter exploration for autonomous agent optimization

---

## 📋 Config Matrix Overview

| Phase | Configs | Restart Needed | Focus | Status |
|-------|---------|----------------|-------|--------|
| 1. Baseline | 1 | No | Current production | ✅ Ready |
| 2. Temperature | 5 | No | 0.0 → 1.0 exploration | ✅ Ready |
| 3. Context (det) | 4 | **Yes** | 8K → 16K (temp=0.0) | ✅ Ready |
| 4. Context (creative) | 4 | **Yes** | 8K → 16K (temp=0.7) | ✅ Ready |
| 5. Top-P | 5 | No | 0.2 → 0.95 diversity | ✅ Ready |
| 6. Top-K | 4 | No | 0 → 100 restriction | ✅ Ready |
| 7. Repetition | 6 | No | Various penalty combos | ✅ Ready |
| 8. Length | 4 | No | Length control | ✅ Ready |
| 9. Optimization | 3 | Varies | Final combos | ✅ Ready |

**Total**: 36 configs
**Per-Request (Fast)**: 28 configs (78%)
**Restart Required (Slow)**: 8 configs (22%)

---

## 📊 Phase 1: Baseline (1 config)

Establish current production performance baseline.

| Config | Description | Restart |
|--------|-------------|---------|
| `BASELINE.json` | Current production (temp=0.0, 8K context) | No |

---

## 🌡️ Phase 2: Temperature Exploration (5 configs)

Test impact of temperature on tool selection and response quality.

| Config | Temp | Description | Restart |
|--------|------|-------------|---------|
| `T1-8K-0.0.json` | 0.0 | Deterministic (baseline) | No |
| `T2-8K-0.3.json` | 0.3 | Slight randomness | No |
| `T3-8K-0.5.json` | 0.5 | Moderate creativity | No |
| `T4-8K-0.7.json` | 0.7 | High creativity | No |
| `T5-8K-1.0.json` | 1.0 | Maximum diversity | No |

**Hypothesis**: temp=0.7 provides best balance for autonomous agent

---

## 🧠 Phase 3: Context Length - Deterministic (4 configs)

Test context window impact with deterministic sampling (temp=0.0).

| Config | Context | Description | Restart |
|--------|---------|-------------|---------|
| `C1-8K-0.0.json` | 8192 | Baseline | No |
| `C2-10K-0.0.json` | 10240 | +25% context | **Yes** |
| `C3-12K-0.0.json` | 12288 | +50% context | **Yes** |
| `C4-16K-0.0.json` | 16384 | +100% context (may OOM) | **Yes** |

**Hypothesis**: Larger context helps multi-step reasoning but increases latency

---

## 🎨 Phase 4: Context Length - Creative (4 configs)

Test context window impact with creative sampling (temp=0.7).

| Config | Context | Description | Restart |
|--------|---------|-------------|---------|
| `C5-8K-0.7.json` | 8192 | Baseline creative | No |
| `C6-10K-0.7.json` | 10240 | +25% context, creative | **Yes** |
| `C7-12K-0.7.json` | 12288 | +50% context, creative (**RECOMMENDED**) | **Yes** |
| `C8-16K-0.7.json` | 16384 | +100% context, creative (may OOM) | **Yes** |

**Hypothesis**: 12K context + temp=0.7 = optimal for autonomous agent

---

## 🎯 Phase 5: Top-P Exploration (5 configs)

Test nucleus sampling impact on vocabulary diversity.

| Config | Top-P | Description | Restart |
|--------|-------|-------------|---------|
| `P1-12K-0.7-0.2.json` | 0.2 | Very focused vocabulary | No |
| `P2-12K-0.7-0.4.json` | 0.4 | Current baseline | No |
| `P3-12K-0.7-0.6.json` | 0.6 | Moderate diversity | No |
| `P4-12K-0.7-0.8.json` | 0.8 | High diversity | No |
| `P5-12K-0.7-0.95.json` | 0.95 | Maximum diversity | No |

**All use**: 12K context, temp=0.7 (from Phase 4 best result)

---

## 🔢 Phase 6: Top-K Exploration (4 configs)

Test token selection restriction impact.

| Config | Top-K | Description | Restart |
|--------|-------|-------------|---------|
| `K1-12K-0.7-0.json` | 0 | Disabled (baseline) | No |
| `K2-12K-0.7-20.json` | 20 | Very restrictive | No |
| `K3-12K-0.7-50.json` | 50 | Moderate restriction | No |
| `K4-12K-0.7-100.json` | 100 | Permissive | No |

**All use**: 12K context, temp=0.7, top_p=0.8 (from Phase 5 best result)

---

## 🔁 Phase 7: Repetition Control (6 configs)

Test various repetition penalty strategies.

| Config | Strategy | Description | Restart |
|--------|----------|-------------|---------|
| `R1-12K-0.7-1.0.json` | None | No penalties (baseline) | No |
| `R2-12K-0.7-1.1.json` | Native | repetition_penalty=1.1 | No |
| `R3-12K-0.7-1.2.json` | Native | repetition_penalty=1.2 | No |
| `R4-12K-0.7-freq.json` | Frequency | frequency_penalty=0.5 | No |
| `R5-12K-0.7-pres.json` | Presence | presence_penalty=0.5 | No |
| `R6-12K-0.7-combo.json` | Combined | rep=1.1, freq=0.3, pres=0.3 | No |

**All use**: 12K context, temp=0.7, top_p=0.8 (best from previous phases)

---

## 📏 Phase 8: Length Control (4 configs)

Test length penalty and max_tokens impact.

| Config | Strategy | Description | Restart |
|--------|----------|-------------|---------|
| `L1-12K-0.7-1.0.json` | Neutral | length_penalty=1.0 (baseline) | No |
| `L2-12K-0.7-0.8.json` | Shorter | length_penalty=0.8 (favor concise) | No |
| `L3-12K-0.7-1.2.json` | Longer | length_penalty=1.2 (favor detailed) | No |
| `L4-12K-0.7-4K.json` | Higher limit | max_tokens=4096 | No |

**All use**: 12K context, temp=0.7, top_p=0.8 (best from previous phases)

---

## 🎯 Phase 9: Final Optimization (3 configs)

Combine best-performing settings from all previous phases.

| Config | Risk | Description | Restart |
|--------|------|-------------|---------|
| `OPT-SAFE.json` | Low | Conservative (12K, minimal penalties) | No |
| `OPT-BALANCED.json` | Medium | **RECOMMENDED** (12K, balanced penalties) | No |
| `OPT-AGGRESSIVE.json` | High | Maximum performance (16K, all optimizations, may OOM) | **Yes** |

**These configs will be adjusted** based on results from Phases 2-8.

---

## 🚀 Usage

### List All Configs

```bash
ls llmconfig/samples/*.json | wc -l
# Should show: 36
```

### Test a Specific Config

```bash
node .forgekeeper/testing/vllm-params/scripts/test-runner.mjs \
  --config T4-8K-0.7 \
  --scenarios tier1-1,tier2-1 \
  --runs 3
```

### Test an Entire Phase

```bash
# Phase 2 (temperature)
for config in T1-8K-0.0 T2-8K-0.3 T3-8K-0.5 T4-8K-0.7 T5-8K-1.0; do
  node .forgekeeper/testing/vllm-params/scripts/test-runner.mjs \
    --config $config \
    --scenarios tier1-1,tier2-1,tier2-2 \
    --runs 3
done
```

---

## 📈 Expected Results Format

For each config, we measure:

| Metric | Description | Goal |
|--------|-------------|------|
| **Correctness** | % of tests with correct tool selection | Maximize (>80%) |
| **Response Quality** | Keyword coverage + detail (0-5) | Maximize (>4.0) |
| **Latency** | Time to completion (ms) | Minimize (<2000ms) |
| **Tokens/Sec** | Throughput | Maximize (>100) |
| **Consistency** | Variance across runs (temp=0) | Minimize (σ<0.1) |
| **Diversity** | Variance across runs (temp>0) | Moderate (σ~0.3) |

---

## 🔍 Config File Format

Each JSON config contains:

```json
{
  "name": "T4-8K-0.7",
  "description": "Human-readable description",
  "phase": "2-temperature",
  "requires_restart": false,
  "parameters": {
    // Per-request parameters (sent in API call)
    "temperature": 0.7,
    "top_p": 0.4,
    "top_k": 0,
    "repetition_penalty": 1.0,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.2,
    "max_tokens": 2048,
    "length_penalty": 1.0,
    "min_p": 0.0
  },
  "env_context": {
    // Server settings (for reference only)
    "VLLM_MAX_MODEL_LEN": 8192,
    "VLLM_GPU_MEMORY_UTILIZATION": 0.9,
    "VLLM_MAX_NUM_BATCHED_TOKENS": 4096
  }
}
```

**Key**:
- `requires_restart`: Does testing this config require vLLM restart?
- `parameters`: Sent directly in API request (no restart needed)
- `env_context`: Server-side settings (restart required if changed)

---

## ⏱️ Estimated Testing Time

### Per-Request Configs (28 configs)
- ~2 seconds per test
- 10 scenarios × 3 runs = 30 tests per config
- ~1 minute per config
- **Total**: ~28 minutes

### Restart-Required Configs (8 configs)
- ~2 minutes restart time per config
- ~1 minute testing per config
- **Total**: ~24 minutes

**Grand Total**: ~52 minutes for minimal test suite
**Full Suite (all scenarios)**: ~3-4 hours

---

## 📚 Documentation

- **Full Testing Plan**: `docs/autonomous/VLLM_PARAMETER_TESTING_PLAN.md`
- **Parameter Scope**: `docs/autonomous/VLLM_PARAMETER_SCOPE.md`
- **Framework README**: `.forgekeeper/testing/vllm-params/README.md`
- **POC Results**: `.forgekeeper/testing/vllm-params/POC_RESULTS_SUMMARY.md`
- **Tool Fix**: `.forgekeeper/testing/vllm-params/TOOL_CALLING_FIX.md`

---

## 🎯 Next Steps

1. **Restart frontend server** (to enable tool calling)
2. **Re-run POC** with tool calling working
3. **Run Phase 2** (temperature exploration)
4. **Run Phases 3-4** (context length - requires restarts)
5. **Run Phases 5-8** (fast iteration)
6. **Run Phase 9** (final optimization)
7. **Analyze results** and identify optimal config
8. **Update production .env** with best settings

---

**Last Updated**: 2025-11-03
**Status**: ✅ All 36 configs ready for testing
**Framework**: Fully operational
**Tool Calling**: Fixed (restart required)
