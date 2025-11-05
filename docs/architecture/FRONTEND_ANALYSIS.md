# Frontend Analysis & Recommendations

## Summary of Findings

### 1. Continuation Attempts Configuration ✅

**Current Setting**: `FRONTEND_CONT_ATTEMPTS=2` (default)

**How it works**:
- After the model completes a response, the server checks if it looks incomplete using heuristics
- If incomplete, it sends a follow-up prompt: "Continue and finish the last sentence (and close any unfinished code block)."
- This happens up to 2 times by default (configurable: 0-6 attempts)
- Each continuation uses `FRONTEND_CONT_TOKENS=512` tokens

**Heuristics for "incomplete"** (see `server.finishers.mjs`):
- Text ends without terminal punctuation (., !, ?, etc.)
- Text is very short (< 30 chars)
- Unclosed code fences (```)

**Recommendation**: **2 attempts is reasonable** for most cases. Consider:
- Set to `0` if your model tends to produce very long responses (to avoid auto-continuation spam)
- Increase to `3-4` if you're using a smaller model that often truncates
- The continuation telemetry is logged to ContextLog, so you can monitor via Diagnostics Drawer

---

### 2. Reasoning Box Empty 🔍

**Root Cause**: The reasoning box will only show content if your LLM model produces `reasoning_content` in its response.

**What models support reasoning_content**:
- OpenAI models with native reasoning (o1, o1-mini, o1-preview)
- Models fine-tuned for Harmony protocol with analysis channel
- GPT-OSS models configured with Harmony rendering

**Current detection**:
```javascript
// server.mjs line 808
const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') ||
                   /gpt[-_]?oss|oss-|harmony/i.test(mdl);
```

**Your setup**: `FRONTEND_USE_HARMONY=1` ✅

**The flow**:
1. If Harmony is enabled, the server uses `/v1/completions` endpoint (not `/v1/chat/completions`)
2. Server extracts reasoning from `<|channel|>analysis<|message|>` tags
3. Server sends `reasoning_content` in delta chunks
4. Client displays it in the reasoning panel

**Why it might be empty**:
- Your model doesn't support Harmony protocol
- Model is not configured to produce analysis channel output
- Model is llama.cpp-based without Harmony template

**Solutions**:

### Option A: Use a model with native reasoning support
```bash
# In .env, use a model that supports reasoning_content
FRONTEND_VLLM_MODEL=o1-mini  # or o1, o1-preview
```

### Option B: Disable Harmony if your model doesn't support it
```bash
# In .env
FRONTEND_USE_HARMONY=0
```
This will use standard chat completions (no reasoning extraction).

### Option C: Configure your model for Harmony
If using llama.cpp with a model that can do chain-of-thought:
1. The prompt template should include Harmony-style channel tags
2. Model needs to be trained/fine-tuned to use `<|channel|>analysis<|message|>` for thinking

**Quick test**: Check if your model produces any `<|channel|>analysis<|message|>` in raw output
```bash
# Send a test request and check logs
grep "analysis<|message|>" .forgekeeper/context_log/*.jsonl
```

---

### 3. Tool Usage Effectiveness 🛠️

**Current System Prompt** (when tools are available):
```
You are a helpful assistant.
You may call JSON function tools when they will help solve the task.
Available tools:
- get_time: Returns current UTC timestamp
- echo: Echo back the provided text
- read_file: Read a file from the sandbox
... (etc)
Call a tool only when necessary and otherwise respond normally.
```

**Assessment**: The prompt is functional but could be more directive.

**Recommendations for Better Tool Usage**:

#### A. Make the system prompt more actionable
```javascript
// In Chat.tsx buildSystemPrompt(), enhance the instructions:
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful, action-oriented assistant. When users ask for information you don\'t have, use tools to gather it. When users ask you to perform actions, use tools to execute them.';

// Add more specific guidance:
extras.push('IMPORTANT: Before answering questions about files, directories, or system state, USE TOOLS to check current state rather than guessing.');
extras.push('When asked to modify files or run commands, do it step-by-step: (1) check current state with read_dir/read_file, (2) make changes, (3) verify with tools.');
```

#### B. Improve tool descriptions
Current tools are well-described, but consider adding examples in the metadata:
```javascript
{
  name: 'read_file',
  description: 'Read a file from the sandbox. Example: read_file({"path": "config.json"})'
}
```

#### C. Add a "think before acting" instruction
```javascript
extras.push('Think step-by-step: (1) What information do I need? (2) Which tools can help? (3) Execute tools. (4) Synthesize results.');
```

#### D. Consider adding tool usage examples in initial turns
Start conversations with a system message that includes a brief example:
```
Example tool usage:
User: "What files are in the current directory?"
Assistant calls: read_dir({"path": "."})
Assistant responds: "Here are the files: [list from tool result]"
```

---

### 4. Additional Recommendations

#### A. Reduce continuation spam
**Problem**: Lines 983-986 in server.mjs have duplicate metrics logging
```javascript
try { metrics.continuations.total += 1; ... } catch {}
try { metrics.continuations.total += 1; ... } catch {}  // DUPLICATE
try { metrics.continuations.total += 1; ... } catch {}  // DUPLICATE
try { metrics.continuations.total += 1; ... } catch {}  // DUPLICATE
```

**Fix**: Remove 3 of the 4 duplicate lines

#### B. Improve continuation prompt
Current: "Continue and finish the last sentence (and close any unfinished code block)."

Better: "Continue from where you left off. Complete any unfinished thoughts, code blocks, or sentences. Do not restart or summarize."

#### C. Add tool execution feedback to UI
The reasoning box is great, but consider also showing:
- Which tools were called (you do this! ✓)
- Tool execution time
- Whether tools succeeded/failed

#### D. Make temperature/top_p more discoverable
Currently hidden in Settings modal. Consider showing current values in status line:
```
Using model "core" • Tools: 6 available • temp: 0.0, top-p: 0.4
```

#### E. Add "suggested tools" feature
When user types certain keywords, show a hint:
- "list files" → suggests read_dir
- "check time" → suggests get_time
- "run command" → suggests run_bash

---

## Quick Fixes to Implement Now

### 1. Fix duplicate metrics logging
**File**: `frontend/server.mjs:983-986`
**Action**: Remove 3 duplicate lines

### 2. Improve system prompt for better tool usage
**File**: `frontend/src/components/Chat.tsx:136-178`
**Action**: Make prompt more directive about when to use tools

### 3. Add reasoning box helper text
**File**: `frontend/src/components/Chat.tsx:771`
**Current**: `(no reasoning yet)`
**Better**:
```
(This model doesn't produce reasoning output.
 To see reasoning, use a model with native reasoning support like o1-mini,
 or disable FRONTEND_USE_HARMONY in .env)
```

### 4. Improve continuation prompt
**File**: `frontend/server.mjs:964`
**Change**:
```javascript
const contBody = {
  model: mdl,
  messages: [
    ...convo,
    { role: 'user', content: 'Continue from where you left off. Complete any unfinished thoughts, code blocks, or sentences. Do not restart or summarize - just continue naturally.' }
  ],
  temperature: 0.0,
  stream: false,
  max_tokens: contOut
};
```

---

## Testing Recommendations

### Test 1: Verify reasoning works
```bash
# Use a test model that supports reasoning_content
# Check if reasoning appears in the panel during streaming
```

### Test 2: Verify tool usage
```bash
# Ask: "What files are in the current directory?"
# Expected: Model should call read_dir tool
# Check Diagnostics Drawer for tool execution logs
```

### Test 3: Verify continuation logic
```bash
# Ask model to write a very long response
# Check if auto-continuation triggers
# View continuation metrics in Diagnostics Drawer
```

### Test 4: Check continuation count
```bash
# Open browser console during chat
# Monitor SSE events for fk-debug messages
# Verify continuation attempts match FRONTEND_CONT_ATTEMPTS setting
```

---

## Environment Variable Reference

```bash
# Continuation settings
FRONTEND_CONT_ATTEMPTS=2           # 0-6, default 2
FRONTEND_CONT_TOKENS=512           # tokens per continuation, default 512

# Harmony/reasoning
FRONTEND_USE_HARMONY=1             # Enable reasoning extraction (0 or 1)

# Model selection
FRONTEND_VLLM_MODEL=core           # Model name to use

# Generation params
FRONTEND_TEMP=0.0                  # Temperature (0.0 = deterministic)
FRONTEND_TOP_P=0.4                 # Nucleus sampling
FRONTEND_MAX_TOKENS=8192           # Max tokens per response
```

---

## Summary

✅ **Continuation logic**: Working correctly, 2 attempts is reasonable
⚠️ **Reasoning box**: Empty because your model likely doesn't support reasoning_content
✅ **Tool system**: Functional but could be more directive in prompting
🐛 **Bug found**: Duplicate metrics logging (lines 983-986)

**Priority fixes**:
1. Remove duplicate metrics logging
2. Improve system prompt for tool usage
3. Add helper text to reasoning box explaining why it's empty
4. Improve continuation prompt
