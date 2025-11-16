---
title: ADR-0002 Self-Review Iteration and Chunked Reasoning
status: Proposed
date: 2025-10-25
owners: planning
priority: high
---

# Context

Forgekeeper currently generates responses in a single pass (with optional continuations for truncated outputs). This approach has limitations:

1. **Quality Issues**: Responses may be incomplete, contain errors, or miss key aspects of the user's question without any self-correction mechanism
2. **Context Limits**: Long, comprehensive responses get cut off at max_tokens boundaries
3. **Repetition**: Models sometimes repeat themselves or loop without recognizing the issue
4. **No Self-Reflection**: The system doesn't evaluate whether its own output satisfies the user's request

We need two complementary features to address these issues:
- **Self-Review Iteration**: Multi-pass quality evaluation and refinement
- **Chunked Reasoning**: Breaking responses into manageable thinking + writing chunks

# Decision

Implement two new orchestration modes that can work independently or together:

## Feature 1: Self-Review Iteration

After generating a response, the system performs iterative self-review through reflection questions before returning to the user.

### Review Cycle
1. Generate initial response (via existing orchestrator)
2. For each review iteration (default: 3 passes):
   - Present the response to the model with review questions
   - Model evaluates the response and provides a quality score and critique
   - If score below threshold: regenerate with critique as context
   - If score above threshold: accept and return
3. Log all review cycles to ContextLog

### Review Questions (Default Set)
- "Is this response satisfactory for the prompt?"
- "Does this response fully address all aspects of the user's question?"
- "Are there any errors, inconsistencies, repetitions, or areas that need improvement?"
- "Is this response complete, or was it cut off mid-thought?"
- "Rate this response on a scale of 0.0 to 1.0"

### Configuration
```bash
# Enable/disable review mode
FRONTEND_ENABLE_REVIEW=1

# Number of review passes (default 3)
FRONTEND_REVIEW_ITERATIONS=3

# Quality threshold to accept (0.0-1.0, default 0.7)
FRONTEND_REVIEW_THRESHOLD=0.7

# Maximum regeneration attempts per review cycle (default 2)
FRONTEND_REVIEW_MAX_REGENERATIONS=2

# Token budget for review evaluation (default 512)
FRONTEND_REVIEW_EVAL_TOKENS=512

# Auto-review mode: trigger review only for certain conditions
# Options: always, never, on_error, on_incomplete, on_complex
FRONTEND_REVIEW_MODE=always
```

### Review Protocol (Harmony-Compatible)
```
<|start|>system<|message|>
You are a quality reviewer. Evaluate the following response for completeness, accuracy, and quality.
<|end|>

<|start|>user<|message|>
Original question: [USER_QUESTION]

Generated response:
[GENERATED_RESPONSE]

Review questions:
1. Is this response satisfactory for the prompt?
2. Does this response fully address all aspects of the user's question?
3. Are there any errors, inconsistencies, or areas that need improvement?
4. Is this response complete, or was it cut off?

Provide:
- Quality score (0.0 to 1.0)
- Brief critique (2-3 sentences)
- Specific improvements needed (if score < 0.7)
<|end|>

<|start|>assistant<|channel|>final<|message|>
```

### ContextLog Schema Extension
```json
{
  "id": "01J9YH..",
  "ts": "2025-10-25T16:35:12.345Z",
  "actor": "system",
  "act": "review_cycle",
  "conv_id": "c_7e..",
  "trace_id": "t_c4..",
  "iter": 1,
  "name": "self_review",
  "status": "ok",
  "review_pass": 1,
  "quality_score": 0.85,
  "threshold": 0.7,
  "critique": "Response is comprehensive but could elaborate on edge cases.",
  "accepted": true,
  "elapsed_ms": 823
}
```

## Feature 2: Chunked Reasoning and Response

Break down complex responses into multiple reasoning + writing chunks to overcome context limits and enable deeper reasoning per section.

### Chunked Response Cycle
1. **Outline Phase**: Generate a high-level outline/plan for the response
   - Identify N logical chunks (sections, topics, steps)
   - Assign brief labels to each chunk
2. **Chunk Loop**: For each chunk (1 to N):
   - **Think Phase**: Generate reasoning about this specific chunk (analysis channel)
   - **Write Phase**: Write just this chunk's content (final channel)
   - **Accumulate**: Append chunk to growing response
   - **Context Carry**: Pass accumulated response + next chunk label to next iteration
3. **Assembly Phase**: Concatenate all chunks into final response
4. **(Optional)** Review the assembled response via self-review iteration

### Chunked Protocol (Harmony-Compatible)

**Outline Phase**:
```
<|start|>system<|message|>
Break down the following user request into 3-5 logical chunks or sections for a comprehensive response.
<|end|>

<|start|>user<|message|>
[USER_QUESTION]
<|end|>

<|start|>assistant<|channel|>final<|message|>
Outline:
1. [Chunk 1 label]
2. [Chunk 2 label]
3. [Chunk 3 label]
```

**Think-Write Phase** (per chunk):
```
<|start|>system<|message|>
You are writing a comprehensive response in chunks. Current chunk: [CHUNK_LABEL]
Previously written: [ACCUMULATED_RESPONSE]
<|end|>

<|start|>user<|message|>
Original question: [USER_QUESTION]

Current section to address: [CHUNK_LABEL]

First, reason about this section in the analysis channel. Then write this section's content in the final channel.
<|end|>

<|start|>assistant<|channel|>analysis<|message|>
[REASONING ABOUT THIS CHUNK]
<|channel|>final<|message|>
[WRITTEN CONTENT FOR THIS CHUNK]
```

### Configuration
```bash
# Enable/disable chunked mode
FRONTEND_ENABLE_CHUNKED=1

# Maximum chunks per response (default 5)
FRONTEND_CHUNKED_MAX_CHUNKS=5

# Target tokens per chunk (default 1024)
FRONTEND_CHUNKED_TOKENS_PER_CHUNK=1024

# Minimum tokens to trigger chunking (default 2048)
# If requested output would exceed this, auto-chunk
FRONTEND_CHUNKED_AUTO_THRESHOLD=2048

# Auto-outline: let model determine chunks (vs. fixed count)
FRONTEND_CHUNKED_AUTO_OUTLINE=1

# Maximum outline attempts (default 2)
FRONTEND_CHUNKED_OUTLINE_RETRIES=2

# Token budget for outline generation (default 512)
FRONTEND_CHUNKED_OUTLINE_TOKENS=512

# Review each chunk individually (vs. only final assembled response)
FRONTEND_CHUNKED_REVIEW_PER_CHUNK=0
```

### ContextLog Schema Extension
```json
{
  "id": "01J9YH..",
  "ts": "2025-10-25T16:35:12.345Z",
  "actor": "system",
  "act": "chunk_outline",
  "conv_id": "c_7e..",
  "trace_id": "t_c4..",
  "iter": 0,
  "name": "generate_outline",
  "status": "ok",
  "chunk_count": 3,
  "outline": ["Introduction", "Implementation Details", "Best Practices"],
  "elapsed_ms": 312
}

{
  "id": "01J9YH..",
  "ts": "2025-10-25T16:35:12.345Z",
  "actor": "assistant",
  "act": "chunk_write",
  "conv_id": "c_7e..",
  "trace_id": "t_c4..",
  "iter": 1,
  "name": "write_chunk",
  "status": "ok",
  "chunk_index": 0,
  "chunk_label": "Introduction",
  "reasoning_tokens": 156,
  "content_tokens": 423,
  "elapsed_ms": 1205
}
```

## Integration: Combined Mode

Both features can work together for maximum quality:

1. **Chunked + Review Each**: Generate response in chunks, review each chunk before moving to next
2. **Chunked + Review Final**: Generate all chunks, then review assembled response
3. **Review + Retry with Chunking**: If review fails and response is long, retry with chunking enabled

Configuration:
```bash
# Enable both features
FRONTEND_ENABLE_REVIEW=1
FRONTEND_ENABLE_CHUNKED=1

# Review strategy when both enabled
# Options: per_chunk, final_only, both
FRONTEND_COMBINED_REVIEW_STRATEGY=final_only
```

# Implementation Architecture

## New Files

### Orchestrator Extensions
- `frontend/server.review.mjs` - Review orchestration logic
  - `orchestrateWithReview()` - Main review loop
  - `evaluateResponse()` - Quality evaluation
  - `regenerateWithCritique()` - Regeneration with feedback

- `frontend/server.chunked.mjs` - Chunked orchestration logic
  - `orchestrateChunked()` - Main chunked loop
  - `generateOutline()` - Outline generation
  - `generateChunk()` - Single chunk generation
  - `assembleChunks()` - Final assembly

### Configuration & Prompts
- `frontend/config/review_prompts.mjs` - Review question templates
- `frontend/config/chunked_prompts.mjs` - Outline and chunk templates

### Context Log Extensions
- `forgekeeper/services/context_log/review.py` - Review event helpers
- `forgekeeper/services/context_log/chunked.py` - Chunk event helpers

## Modified Files

### Orchestrator Integration
- `frontend/server.orchestrator.mjs`
  - Add feature detection (check env vars)
  - Route to appropriate orchestrator based on config
  - Maintain backward compatibility

### Server Entry Point
- `frontend/server.mjs`
  - Import new orchestrator modes
  - Add feature flags to `/config.json` endpoint
  - Wire up new routes if needed

### UI Components
- `frontend/src/components/Chat.tsx`
  - Add UI controls for review/chunked modes (optional toggles)
  - Display review passes in progress indicator
  - Display chunk progress (e.g., "Writing section 2 of 5...")

- `frontend/src/components/DiagnosticsDrawer.tsx`
  - Display review cycles with scores and critiques
  - Display chunk breakdown with reasoning previews

## Execution Flow

### Review Mode Flow
```
User Message
    ↓
Existing Orchestration (with tools)
    ↓
Initial Response Generated
    ↓
[Review Loop: 1 to N iterations]
    ↓
    Evaluate Response
        ↓
    Extract Score & Critique
        ↓
    Score >= Threshold? → Yes → Return Response
        ↓ No
    Regenerate with Critique
        ↓
    [Loop back or max iterations reached]
    ↓
Return Best Response (highest score)
```

### Chunked Mode Flow
```
User Message
    ↓
Generate Outline (3-5 chunks)
    ↓
[Chunk Loop: for each chunk]
    ↓
    Generate Reasoning (analysis channel)
        ↓
    Generate Content (final channel)
        ↓
    Accumulate to Response Buffer
        ↓
    [Optional: Review this chunk]
        ↓
    Continue to Next Chunk
    ↓
Assemble Final Response
    ↓
[Optional: Review Final Response]
    ↓
Return Assembled Response
```

### Combined Mode Flow
```
User Message
    ↓
Generate Outline
    ↓
[Chunk Loop]
    ↓
    Generate Chunk
        ↓
    [Optional: Review Chunk]
        ↓
    Accumulate
    ↓
Assemble Response
    ↓
[Review Final Response]
    ↓
Return Response
```

# Benefits

## Self-Review Iteration
- **Higher Quality**: Catches errors, repetitions, and incomplete thoughts
- **User Confidence**: Responses are validated before delivery
- **Debugging**: Review cycles logged for transparency
- **Adaptability**: Adjustable threshold and iteration count
- **Fail-Safe**: Always returns best attempt even if threshold not met

## Chunked Reasoning
- **Overcomes Context Limits**: Longer responses without truncation
- **Better Reasoning**: Dedicated think time per section
- **Structured Output**: Organized, comprehensive responses
- **Scalability**: Handle complex, multi-faceted questions
- **Transparency**: Users see reasoning per chunk in diagnostics

## Combined
- **Maximum Quality & Completeness**: Best of both approaches
- **Flexible**: Can be tuned per use case
- **Observable**: Full audit trail via ContextLog

# Tradeoffs

## Costs
- **Increased Latency**: Multiple LLM calls per response (review iterations + chunks)
- **Token Usage**: 2-5x more tokens consumed per user question
- **Complexity**: More orchestration logic to maintain
- **Compute**: Higher load on inference backend

## Mitigations
- **Progressive Enhancement**: Features are opt-in via flags
- **Smart Triggers**: Auto-detect when to use (based on question complexity, response length)
- **Configurable Budgets**: Cap iterations and chunks
- **Caching**: Cache outlines and reviews where possible
- **Rate Limiting**: Enforce per-user limits to prevent abuse

# Alternatives Considered

## 1. Client-Side Review
Have the UI prompt the user to review and request refinements.
- **Rejected**: Requires user effort; defeats purpose of autonomous quality improvement

## 2. Single-Pass with Extended Context
Just increase max_tokens to 16K or 32K.
- **Rejected**: Doesn't solve quality issues; still no self-correction; wastes tokens on low-quality outputs

## 3. Streaming with Checkpoints
Stream response and checkpoint at section boundaries for potential rollback.
- **Rejected**: Complex to implement; doesn't provide reasoning-per-section benefit

## 4. External Validator Model
Use a separate critic model to review outputs.
- **Deferred**: Adds dependency; can implement later if self-review insufficient

# Testing Strategy

## Unit Tests
- `tests/test_review_orchestrator.py`
  - Test review question parsing
  - Test score extraction and thresholding
  - Test regeneration with critique

- `tests/test_chunked_orchestrator.py`
  - Test outline generation
  - Test chunk assembly
  - Test accumulated context management

## Integration Tests
- `tests/test_review_integration.py`
  - End-to-end review cycle with mock LLM
  - Verify ContextLog events

- `tests/test_chunked_integration.py`
  - End-to-end chunked generation
  - Verify chunk boundaries and assembly

## Smoke Tests
- `scripts/test_review_basic.py`
  - Trigger review mode with a test question
  - Verify response quality improved

- `scripts/test_chunked_basic.py`
  - Trigger chunked mode with a complex question
  - Verify multi-part response assembly

## UI Tests (Manual)
- Toggle review mode in UI, submit question, observe review passes in diagnostics
- Toggle chunked mode, submit complex question, observe chunk progress
- Verify combined mode works as expected

# Rollout Plan

## Phase 0: Design & Documentation (Current)
- ✅ Write ADR
- Create task cards in tasks.md
- Get stakeholder approval

## Phase 1: Review Mode MVP (Sprint 1)
- Implement `server.review.mjs` with basic review loop
- Add review prompt templates
- Wire up to existing orchestrator
- Add ContextLog events
- Unit tests + smoke test
- Feature flag: `FRONTEND_ENABLE_REVIEW=1` (default: 0)

## Phase 2: Chunked Mode MVP (Sprint 2)
- Implement `server.chunked.mjs` with outline + chunk loop
- Add chunk prompt templates
- Wire up to existing orchestrator
- Add ContextLog events
- Unit tests + smoke test
- Feature flag: `FRONTEND_ENABLE_CHUNKED=1` (default: 0)

## Phase 3: UI Integration (Sprint 3)
- Add review/chunked toggles to Chat UI
- Display progress indicators
- Enhance DiagnosticsDrawer for review/chunk events
- Polish user experience

## Phase 4: Combined Mode & Optimization (Sprint 4)
- Implement combined review + chunked strategies
- Add auto-detection heuristics
- Optimize token usage
- Performance tuning
- Documentation and examples

## Phase 5: Production Hardening (Sprint 5)
- Load testing
- Rate limiting
- Error handling edge cases
- Metrics and monitoring
- User documentation

# Success Metrics

## Quality Metrics
- Average quality score after review vs. before
- User satisfaction ratings (if collected)
- Reduction in incomplete/truncated responses
- Reduction in user follow-up questions

## Performance Metrics
- Average latency increase (target: < 3x baseline)
- Token usage increase (target: < 5x baseline)
- Cache hit rate (if caching implemented)

## Adoption Metrics
- Percentage of requests using review mode
- Percentage of requests using chunked mode
- Percentage of reviews that trigger regeneration
- Average chunks per chunked response

# Documentation Updates Required

- Update `CLAUDE.md` with new orchestration modes
- Add `docs/features/self_review.md` with configuration guide
- Add `docs/features/chunked_reasoning.md` with examples
- Update `docs/api/chat_stream.md` with new response formats
- Update `CONTRIBUTING.md` with testing requirements for these features

# Open Questions

1. **Threshold Tuning**: What's the optimal default quality threshold? (Propose: 0.7, but gather data)
2. **Chunk Count**: Should we auto-detect optimal chunk count, or let user specify? (Propose: auto-detect with override)
3. **Review Questions**: Should review questions be customizable per request? (Propose: phase 2 feature)
4. **Streaming**: How do we stream chunked responses? Stream per chunk or buffer all chunks? (Propose: buffer outline, stream chunks as ready)
5. **Caching**: Should we cache outlines for similar questions? (Propose: phase 4 optimization)
6. **Fallback**: What happens if review/chunking fails? (Propose: always return best attempt; log error to ContextLog)

# References

- ADR-0001: ContextLog design
- Existing continuation logic in `server.orchestrator.mjs:401-411`
- Harmony protocol: `server.harmony.mjs`
- Tool orchestration loop: `server.orchestrator.mjs:248-474`

# Approval & Sign-off

Status: **Proposed** (Awaiting stakeholder review)

Reviewers:
- [ ] Tech Lead
- [ ] Product Owner
- [ ] Security Review (for redaction in review logs)

---

**Next Steps**: Create task cards in `tasks.md` for phased implementation.
