# GPT-OSS-20B Issues: Diagnosis & Solutions

## 🔍 Issues Identified

### Issue 1: No Reasoning Output
### Issue 2: Context Cutoff (Incomplete Responses)

---

## Current Configuration Analysis

```bash
# Your current .env settings:
FRONTEND_VLLM_MODEL=gpt-oss-20b-mxfp4.gguf
FK_CORE_KIND=llama
LLAMA_MODEL_CORE=/models/gpt-oss-20b-mxfp4.gguf
LLAMA_N_CTX=4096                    # ← Context window
FRONTEND_MAX_TOKENS=384             # ← PROBLEM #1: Too low!
FRONTEND_USE_HARMONY=1              # ← Enabled
```

### Model Details
- **File**: `gpt-oss-20b-mxfp4.gguf` (12 GB)
- **Type**: GPT-OSS 20B quantized to MXFP4
- **llama.cpp**: Running on port 8001 with GPU acceleration
- **Context Size**: 4096 tokens (set via `-c 4096`)

---

## 🚨 CRITICAL PROBLEM #1: FRONTEND_MAX_TOKENS=384

**This is why your responses are cutting off!**

### What's Happening:
1. Your `.env` has `FRONTEND_MAX_TOKENS=384`
2. This means the model can only generate **384 tokens** (~300 words) per response
3. After 384 tokens, the model **MUST STOP** even mid-sentence
4. This is being sent to llama.cpp as `max_tokens: 384` in every request

### The Fix:
```bash
# In .env, change from:
FRONTEND_MAX_TOKENS=384

# To:
FRONTEND_MAX_TOKENS=2048
# Or even:
FRONTEND_MAX_TOKENS=4096
# (But leave room for conversation history)
```

### Explanation:
- Your model has a 4096 token context window
- You need to leave room for: (1) system prompt, (2) conversation history, (3) response
- Recommended allocation:
  - System prompt + tools: ~500 tokens
  - Conversation history: ~1500 tokens
  - Response: **2048 tokens** ← This is what FRONTEND_MAX_TOKENS controls
  - Total: ~4000 tokens (safe buffer)

**After changing this, restart the frontend container:**
```bash
docker compose restart frontend
```

---

## 🧠 PROBLEM #2: No Reasoning Output

### Why GPT-OSS-20B Isn't Producing Reasoning

**Short answer**: The GGUF quantized model you're using likely doesn't support Harmony protocol properly.

### Long Answer:

#### What is GPT-OSS?
GPT-OSS is a research project that attempted to recreate GPT models with chain-of-thought reasoning. However:

1. **Original GPT-OSS** (HuggingFace weights):
   - Trained with Harmony-style prompting
   - Can produce `<|channel|>analysis<|message|>` reasoning output
   - Requires specific prompt formatting

2. **GGUF Quantized Version** (what you have):
   - Converted to GGUF for llama.cpp
   - Heavily quantized (MXFP4 = 4-bit mixed precision)
   - **May have lost reasoning capability during quantization**
   - Chat template might not be configured correctly

### What Forgekeeper is Trying to Do:

When `FRONTEND_USE_HARMONY=1` and model name contains "gpt-oss":

1. **Frontend Server** (server.orchestrator.mjs:808):
   ```javascript
   const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') ||
                      /gpt[-_]?oss|oss-|harmony/i.test(mdl);
   ```
   ✅ Detects your model correctly

2. **Rendering** (server.harmony.mjs):
   ```
   <|start|>system<|message|>
   You are a precise, helpful assistant. Current date: 2025-10-23.
   <|end|>
   <|start|>system<|channel|>policies<|message|>
   Valid channels: analysis, final.
   Write your private chain-of-thought in the analysis channel.
   Then produce the user-facing answer in the final channel.
   <|end|>
   ```

3. **Expected Model Output**:
   ```
   <|start|>assistant<|channel|>analysis<|message|>
   Let me think through this step by step...
   [reasoning here]
   <|end|>
   <|start|>assistant<|channel|>final<|message|>
   Here is the answer...
   <|end|>
   ```

4. **What Your Model Actually Outputs**:
   ```
   Here is the answer...
   ```
   (No Harmony tags, no channels, just plain text)

### Why This Happens:

#### A. Model Template Not Configured
llama.cpp needs a "chat template" to know how to format prompts. Check:
```bash
# Does your model have a chat template?
curl -s http://localhost:8001/v1/models | grep -i template
```

Your docker-compose.yml passes `--jinja` flag, but the model might not have the right template embedded.

#### B. Quantization Degraded Reasoning
MXFP4 is an aggressive 4-bit quantization. The model may:
- Still understand language
- Still generate coherent text
- But NOT follow complex Harmony protocol formatting

#### C. Model Wasn't Actually Harmony-Trained
Some "gpt-oss" models floating around are:
- Just GPT-2/GPT-J/GPT-NeoX renamed
- Not actually trained on Harmony protocol
- Won't produce analysis channel output no matter what

---

## 🔧 Solutions

### Solution 1: Fix Max Tokens (DO THIS FIRST!)

```bash
# Edit .env
FRONTEND_MAX_TOKENS=2048
```

```bash
# Restart frontend
docker compose restart frontend
```

**Impact**: Your responses will no longer cut off mid-sentence.

---

### Solution 2A: Disable Harmony (Keep Using gpt-oss-20b)

If you just want the model to work without reasoning:

```bash
# In .env, change:
FRONTEND_USE_HARMONY=1

# To:
FRONTEND_USE_HARMONY=0
```

```bash
# Restart frontend
docker compose restart frontend
```

**What this does**:
- Uses standard `/v1/chat/completions` endpoint
- No Harmony protocol formatting
- No reasoning extraction attempted
- Model just generates normal chat responses
- **Reasoning box will show helpful text explaining why it's empty**

**Pros**:
- ✅ Will definitely work
- ✅ Simpler prompt = more reliable
- ✅ Model can use full capacity for response quality

**Cons**:
- ❌ No chain-of-thought reasoning visible
- ❌ No analysis channel

---

### Solution 2B: Use a Different Model That Actually Supports Reasoning

If you want real reasoning output, you need a model that natively supports it:

#### Option 1: OpenAI o1-mini (Cloud, $$$)
```bash
# In .env:
FK_CORE_KIND=openai
FK_CORE_API_BASE=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
FRONTEND_VLLM_MODEL=o1-mini
FRONTEND_USE_HARMONY=0  # o1 has native reasoning_content
```

**Pros**:
- ✅ Real chain-of-thought reasoning
- ✅ Shows in reasoning box automatically
- ✅ Very high quality

**Cons**:
- ❌ Costs money per token
- ❌ Requires internet connection
- ❌ Sends data to OpenAI

#### Option 2: Qwen2.5-Coder-32B-Instruct (Local, Free)
This is a strong open-source model with good instruction following:

```bash
# Download model (example):
huggingface-cli download Qwen/Qwen2.5-Coder-32B-Instruct-GGUF \
  qwen2.5-coder-32b-instruct-q4_k_m.gguf \
  --local-dir ./models

# In .env:
LLAMA_MODEL_CORE=/models/qwen2.5-coder-32b-instruct-q4_k_m.gguf
FRONTEND_VLLM_MODEL=qwen2.5-coder-32b-instruct
LLAMA_N_CTX=8192  # Qwen supports 8K context
FRONTEND_MAX_TOKENS=2048
FRONTEND_USE_HARMONY=0  # Not Harmony-trained
```

**Pros**:
- ✅ Free and local
- ✅ Great for coding tasks
- ✅ 8K context window
- ✅ Good instruction following

**Cons**:
- ❌ Larger model (needs more VRAM)
- ❌ No Harmony reasoning protocol
- ❌ No chain-of-thought in reasoning box

#### Option 3: Try GPT-OSS Original PyTorch Weights via vLLM

If you really want Harmony reasoning, try the original unquantized model:

```bash
# In .env:
FK_CORE_KIND=vllm
VLLM_MODEL_CORE=OrionStarAI/gpt-oss-20b  # HuggingFace repo
VLLM_MAX_MODEL_LEN=4096
FRONTEND_VLLM_MODEL=gpt-oss-20b
FRONTEND_USE_HARMONY=1
FRONTEND_MAX_TOKENS=2048
```

```bash
# Start with vLLM instead of llama.cpp
docker compose --profile ui --profile inference-vllm up -d
```

**Pros**:
- ✅ Full precision weights (no quantization loss)
- ✅ Might actually support Harmony
- ✅ vLLM is faster for batch inference

**Cons**:
- ❌ Requires more VRAM (~20GB for FP16)
- ❌ First startup downloads entire model
- ❌ Still might not work if model wasn't Harmony-trained

---

### Solution 3: Increase Context Window (If You Have VRAM)

```bash
# In .env:
LLAMA_N_CTX=8192  # Double the context
FRONTEND_MAX_TOKENS=4096  # Double max response
```

```bash
# Restart llama.cpp
docker compose restart llama-core
```

**Check VRAM usage first**:
```bash
nvidia-smi
```

Each token in context uses memory. For gpt-oss-20b MXFP4:
- 4096 context = ~2GB VRAM
- 8192 context = ~4GB VRAM

Make sure you have headroom!

---

## 🧪 Testing Your Fixes

### Test 1: Verify Max Tokens Fixed
```bash
# Ask the model to write a long response:
"Write a detailed 500-word essay about the history of computing."

# Before fix: Cuts off around 300 words
# After fix: Should complete the full essay
```

### Test 2: Check Reasoning Box
```bash
# Enable "Show reasoning" in UI
# Ask: "What is 2+2? Think step by step."

# If FRONTEND_USE_HARMONY=0:
# Should show helpful text explaining why reasoning is empty

# If FRONTEND_USE_HARMONY=1 and model doesn't support it:
# Will show same helpful text (because no reasoning_content in response)
```

### Test 3: Verify Context Isn't Overfilling
```bash
# Have a long conversation (10+ turns)
# Each response should maintain quality
# If quality degrades, you're hitting context limits
```

---

## 📊 Recommended Configuration

### For Best Results with gpt-oss-20b-mxfp4.gguf:

```bash
# .env changes:
FRONTEND_MAX_TOKENS=2048          # ← FIX #1: Increase from 384
FRONTEND_USE_HARMONY=0            # ← FIX #2: Disable Harmony (model doesn't support it)
LLAMA_N_CTX=4096                  # ← Keep as is (model limit)
FRONTEND_CONT_ATTEMPTS=2          # ← Keep as is
FRONTEND_CONT_TOKENS=512          # ← Keep as is
```

### After editing .env:
```bash
docker compose restart frontend
# Or if you changed LLAMA_N_CTX:
docker compose restart llama-core frontend
```

---

## 🎯 Quick Decision Matrix

**"I just want it to work and don't care about reasoning"**
→ Set `FRONTEND_MAX_TOKENS=2048` and `FRONTEND_USE_HARMONY=0`

**"I want reasoning but have limited VRAM"**
→ Try OpenAI o1-mini (cloud) or accept no reasoning with current model

**"I want reasoning and have 24GB+ VRAM"**
→ Try GPT-OSS via vLLM or use Qwen2.5-Coder-32B

**"I want best quality local model regardless of reasoning"**
→ Switch to Qwen2.5-Coder-32B-Instruct or Llama-3.1-70B (if you have 48GB+ VRAM)

---

## 🐛 Why Harmony Isn't Working (Technical Deep Dive)

### The Harmony Protocol Requirements:

1. **Training**: Model must be trained on Harmony-formatted data
2. **Template**: Chat template must render Harmony tags correctly
3. **Following**: Model must actually produce the expected channel structure

### What's Probably Happening:

```mermaid
Frontend Server
  ↓ Detects "gpt-oss" in model name
  ↓ Sets useHarmony=true
  ↓ Renders prompt with Harmony tags:
    <|start|>system<|channel|>policies<|message|>
    Valid channels: analysis, final.
    <|end|>
  ↓ Sends to llama.cpp /v1/completions
  ↓
llama.cpp
  ↓ Receives Harmony-formatted prompt
  ↓ Model sees the tags but doesn't understand them
  ↓ Model was either:
      - Never trained on Harmony
      - Lost capability during MXFP4 quantization
  ↓ Model generates plain text response (no channels)
  ↓
Frontend Server
  ↓ Tries to extract from <|channel|>analysis<|message|>
  ↓ Finds nothing (model didn't produce that)
  ↓ reasoning = null
  ↓ content = extractHarmonyFinalStrict(response)
  ↓ Returns response with empty reasoning
```

### How to Verify:

Check the actual raw output from your model:

```bash
curl -X POST http://localhost:8001/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<|start|>system<|message|>You are helpful.<|end|><|start|>user<|message|>What is 2+2?<|end|><|start|>assistant<|channel|>analysis<|message|>",
    "max_tokens": 100,
    "temperature": 0.0
  }' | jq .choices[0].text
```

**If you see**:
- Harmony tags like `<|channel|>final<|message|>` → Model supports Harmony ✅
- Plain text with no tags → Model doesn't support Harmony ❌

---

## Summary

### Critical Fixes (Do These Now):

1. ✅ **Increase FRONTEND_MAX_TOKENS from 384 to 2048**
   - Fixes context cutoff
   - Allows complete responses

2. ✅ **Disable Harmony: FRONTEND_USE_HARMONY=0**
   - Model doesn't support it anyway
   - Simplifies prompting
   - Better response quality

3. ✅ **Restart frontend after changes**
   ```bash
   docker compose restart frontend
   ```

### Long-Term Improvements:

- Consider switching to a better model (Qwen2.5-Coder, Llama-3.1, etc.)
- If you need reasoning, use OpenAI o1 or wait for open-source reasoning models
- Monitor VRAM usage if you increase context size

### Files to Edit:

```bash
# Only need to edit one file:
.env

# Make these changes:
FRONTEND_MAX_TOKENS=2048
FRONTEND_USE_HARMONY=0
```

That's it! After these two changes and a restart, your issues should be resolved.
