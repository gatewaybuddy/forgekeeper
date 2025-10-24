# Switching from llama.cpp to vLLM with Safetensors

## Changes Made to .env

```bash
# Core selection
FK_CORE_KIND=llama → vllm

# API endpoints
FRONTEND_VLLM_API_BASE=http://llama-core:8080/v1 → http://vllm-core:8000/v1
FK_CORE_API_BASE=http://llama-core:8080 → http://vllm-core:8000

# Model configuration
FRONTEND_VLLM_MODEL=gpt-oss-20b-F16.gguf → gpt-oss-20b (safetensors)
VLLM_MODEL_CORE=/models/gpt-oss-20b (already correct)

# Generation limits
FRONTEND_MAX_TOKENS=384 → 2048 (fixes context cutoff)
VLLM_MAX_MODEL_LEN=32768 → 8192 (conservative for 20B model)

# Harmony protocol
FRONTEND_USE_HARMONY=1 (kept enabled - full model should support it)
```

## Model Details

**Location**: `D:\Projects\codex\forgekeeper\models\gpt-oss-20b\`

**Files**:
- 3x safetensors shards (~12.9 GB total)
- config.json (with max_position_embeddings: 131072)
- chat_template.jinja (Harmony protocol template)
- tokenizer files

**Context Window**:
- Original: 4096 tokens
- Extended (RoPE): 131072 tokens
- vLLM setting: 8192 tokens (safe starting point)

## Docker Services

### Stop llama.cpp:
```bash
docker compose --profile inference down
```

### Start vLLM:
```bash
docker compose --profile ui --profile inference-vllm up -d
```

This will start:
- `vllm-core` (gpt-oss-20b safetensors)
- `frontend` (Node server + React UI)

## Advantages of Safetensors + vLLM

### vs GGUF Quantized Model:
1. ✅ **Full Precision**: No quantization loss (bfloat16 vs MXFP4)
2. ✅ **Harmony Support**: Chat template intact, should produce reasoning
3. ✅ **Better Quality**: No degradation from aggressive quantization
4. ✅ **Faster**: vLLM optimized for throughput
5. ✅ **Longer Context**: Can use 8K-131K tokens vs 4K

### Trade-offs:
- ❌ More VRAM needed (~16-20GB vs ~8GB for quantized)
- ❌ Slower first token (model loading time)
- ✅ But faster subsequent tokens (vLLM is very optimized)

## Expected Behavior After Switch

### 1. Reasoning Box Should Work!
The full-precision model with proper chat template should produce:
```
<|channel|>analysis<|message|>
Let me think through this step by step...
<|end|>
<|channel|>final<|message|>
Here is the answer...
<|end|>
```

Frontend will extract the `analysis` channel into the reasoning box.

### 2. No More Context Cutoff
- Can generate up to 2048 tokens (~1600 words)
- With 8192 total context, plenty of room for conversation history

### 3. Better Quality Responses
- Full precision weights
- Native Harmony template
- More accurate instruction following

## Startup Commands

### Full restart:
```bash
# Stop everything
docker compose down

# Start with vLLM profile
docker compose --profile ui --profile inference-vllm up -d

# Watch logs
docker compose logs -f vllm-core
```

### Check vLLM loaded successfully:
```bash
# Wait for: "Avg prompt throughput: ... tokens/s"
# Then test:
curl http://localhost:8001/v1/models
```

### Access UI:
```
http://localhost:5173 (dev mode)
or
http://localhost:3000 (production build)
```

## First Test

1. Open UI
2. Enable "Show reasoning" checkbox
3. Ask: "What is 2+2? Think step by step."
4. **Expected**: Reasoning box shows chain-of-thought
5. **Expected**: Response doesn't cut off

## Troubleshooting

### vLLM won't start (OOM):
```bash
# Reduce memory usage in .env:
VLLM_GPU_MEMORY_UTILIZATION=0.8
VLLM_MAX_MODEL_LEN=4096

# Restart:
docker compose restart vllm-core
```

### Model not found:
```bash
# Verify model path:
ls -lh models/gpt-oss-20b/

# Should see:
# - model-00000-of-00002.safetensors
# - model-00001-of-00002.safetensors
# - model-00002-of-00002.safetensors
# - config.json
# - chat_template.jinja
```

### Still no reasoning:
```bash
# Check raw vLLM output:
curl -X POST http://localhost:8001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-20b",
    "prompt": "<|start|>user<|message|>What is 2+2?<|end|><|start|>assistant",
    "max_tokens": 100,
    "temperature": 0.0
  }'

# Should see Harmony tags in response
```

## Performance Expectations

### First Request (Cold Start):
- Model loading: 30-60 seconds
- First token: 2-5 seconds

### Subsequent Requests:
- Time to first token: 0.5-1 seconds
- Tokens per second: 20-40 (depends on GPU)

### Memory Usage:
- Model weights: ~13GB
- KV cache (8K ctx): ~3-4GB
- Total: ~16-20GB VRAM

## Reverting to llama.cpp

If vLLM doesn't work or uses too much VRAM:

```bash
# Edit .env:
FK_CORE_KIND=vllm → llama
FK_CORE_API_BASE=http://vllm-core:8000 → http://llama-core:8080
FRONTEND_VLLM_API_BASE=http://vllm-core:8000/v1 → http://llama-core:8080/v1
FRONTEND_VLLM_MODEL=gpt-oss-20b → gpt-oss-20b-mxfp4.gguf

# Restart:
docker compose --profile inference-vllm down
docker compose --profile ui --profile inference up -d
```

## Next Steps

After confirming it works:
1. Test reasoning output quality
2. Try longer conversations (test 8K context)
3. Monitor VRAM usage with `nvidia-smi`
4. Adjust VLLM_MAX_MODEL_LEN if needed
5. Consider increasing to 16K or 32K if you have VRAM headroom
