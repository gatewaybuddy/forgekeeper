# Chunked Reasoning Mode

## Overview

Chunked reasoning mode breaks down complex, lengthy responses into multiple focused chunks, each with its own reasoning and writing phase. This approach overcomes context limitations and improves response quality for comprehensive queries.

**Key Benefits:**
- Handles responses that exceed context limits
- Better organization and structure
- Progressive refinement (each chunk builds on previous)
- Maintains coherence across long content

**When to Use:**
- Comprehensive guides and tutorials
- Step-by-step explanations
- Multi-part analyses
- Detailed comparisons
- Long-form documentation

## Architecture

Chunked mode operates in three phases:

1. **Outline Generation**: Create structured outline with chunk labels
2. **Chunk Writing**: Generate each chunk with context from previous chunks
3. **Assembly**: Combine chunks into coherent final response

### Outline Phase

The model generates an outline breaking the question into logical chunks:

**Input:** "Explain Docker comprehensively with examples"

**Outline:**
```
1. Docker Fundamentals
2. Container Architecture
3. Images and Dockerfiles
4. Networking and Volumes
5. Docker Compose
```

### Chunk Writing Phase

Each chunk is generated with:
- User question
- Chunk-specific focus (from outline)
- Accumulated content from previous chunks
- Chunk index and total count

**Benefits:**
- Focused generation (smaller scope per iteration)
- Context awareness (builds on previous chunks)
- Better quality (each chunk can be optimized independently)

### Assembly Phase

Chunks are assembled with appropriate spacing and formatting:
```
[Chunk 1 content]

[Chunk 2 content]

[Chunk 3 content]
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_ENABLE_CHUNKED` | `0` | Enable/disable chunked mode |
| `FRONTEND_CHUNKED_MAX_CHUNKS` | `5` | Maximum chunks per response |
| `FRONTEND_CHUNKED_TOKENS_PER_CHUNK` | `1024` | Max tokens per chunk |
| `FRONTEND_CHUNKED_OUTLINE_TOKENS` | `512` | Max tokens for outline generation |
| `FRONTEND_CHUNKED_OUTLINE_RETRIES` | `2` | Retry attempts for outline generation |
| `FRONTEND_AUTO_CHUNKED` | `0` | Enable auto-detection heuristics |
| `FRONTEND_AUTO_CHUNKED_THRESHOLD` | `0.3` | Auto-detection confidence threshold |

### Chunked Config Object

```javascript
{
  enabled: true,
  maxChunks: 5,
  tokensPerChunk: 1024,
  outlineTokens: 512,
  outlineRetries: 2
}
```

## Auto-Detection Heuristics

When `FRONTEND_AUTO_CHUNKED=1`, chunked mode automatically triggers for:

### Comprehensive Requests
- "Comprehensive analysis/overview/guide/explanation"
- "In detail" or "detailed analysis/explanation"
- "Thorough explanation/analysis"

**Example Triggers:**
```
"Provide a comprehensive analysis of React hooks"
"Explain Kubernetes in detail"
"Thorough explanation of microservices architecture"
```

### Step-by-Step Requests
- "Step-by-step" or "step by step"
- "Walkthrough"
- "Complete guide"

**Example Triggers:**
```
"Step-by-step guide to Docker setup"
"Complete walkthrough of Git workflow"
"Guide me through deploying to AWS"
```

### Multi-Part Questions
- Multiple "and" connectors
- "Compare X and Y and Z"
- "Differences between A, B, C"
- "Pros and cons"

**Example Triggers:**
```
"Compare React and Vue and Angular"
"Differences between MySQL, PostgreSQL, and MongoDB"
"Pros and cons of microservices vs monoliths"
```

### Tutorial/Educational
- "Tutorial"
- "Beginner's guide"
- "Getting started with"
- "How to ... from scratch"

**Example Triggers:**
```
"Tutorial for Python beginners"
"Getting started with machine learning"
"How to build a REST API from scratch"
```

## API Usage

### REST API

```bash
# Enable chunked mode for a single request
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Comprehensive guide to Docker"}
    ],
    "model": "core",
    "chunked_enabled": true
  }'
```

### Response Format

```json
{
  "content": "Full assembled response...",
  "reasoning": "Combined reasoning from all chunks",
  "chunks": [
    {
      "index": 0,
      "label": "Docker Fundamentals",
      "reasoning": "Chunk-specific reasoning...",
      "content": "Chunk content...",
      "reasoning_tokens": 150,
      "content_tokens": 800,
      "elapsed_ms": 1200
    },
    // ... more chunks
  ],
  "outline": ["Docker Fundamentals", "Container Architecture", ...],
  "debug": {
    "chunked": true,
    "chunk_count": 5,
    "total_reasoning_tokens": 750,
    "total_content_tokens": 4200,
    "total_elapsed_ms": 8500
  }
}
```

## Examples

See [Chunked Example](../examples/chunked_example.md) for a complete walkthrough.

### Simple Chunked Generation

**Input:**
```
"Explain microservices architecture step-by-step with examples"
```

**Process:**

1. **Outline Generation:**
```
1. What are Microservices?
2. Core Principles
3. Service Communication
4. Deployment Patterns
5. Real-World Example
```

2. **Chunk 1: What are Microservices?**
- Reasoning: "Focus on defining microservices, contrasting with monoliths"
- Content: ~800 tokens covering definition, key characteristics

3. **Chunk 2: Core Principles**
- Reasoning: "Build on definition, explain design principles"
- Content: ~900 tokens on single responsibility, bounded contexts, etc.

4. **Chunk 3-5**: Continue similarly

5. **Assembly**: Combine all chunks into coherent guide

### Auto-Detected Chunking

**Input:**
```
"Comprehensive comparison of React, Vue, and Angular"
```

**Auto-Detection:**
- Detected "comprehensive" → +0.4 score
- Detected "and ... and" pattern → +0.3 score
- Total confidence: 0.7 → Triggers chunked mode

**Outline:**
```
1. Overview of Each Framework
2. Component Architecture Comparison
3. State Management Approaches
4. Performance Benchmarks
5. Use Case Recommendations
```

## Use Cases

### 1. Technical Documentation

**Scenario**: Generate comprehensive API documentation

**Input**: "Create complete documentation for our REST API"

**Chunks**:
1. API Overview
2. Authentication
3. Endpoints Reference
4. Error Handling
5. Examples and Best Practices

**Benefits**:
- Organized structure
- Complete coverage
- Each section properly detailed

### 2. Educational Content

**Scenario**: Tutorial for beginners

**Input**: "Step-by-step Python tutorial for beginners"

**Chunks**:
1. Python Basics and Setup
2. Variables and Data Types
3. Control Flow
4. Functions and Modules
5. First Project Example

**Benefits**:
- Logical progression
- Each concept fully explained
- Doesn't overwhelm with too much at once

### 3. Comparative Analysis

**Scenario**: Technology comparison

**Input**: "Compare SQL vs NoSQL databases in detail"

**Chunks**:
1. Database Fundamentals
2. SQL Databases Deep Dive
3. NoSQL Databases Deep Dive
4. Performance Comparison
5. Use Case Recommendations

**Benefits**:
- Fair coverage of both
- Structured comparison
- Comprehensive analysis

### 4. Problem-Solving Guides

**Scenario**: Debugging guide

**Input**: "Comprehensive guide to debugging Node.js memory leaks"

**Chunks**:
1. Understanding Memory Leaks
2. Diagnostic Tools
3. Common Patterns
4. Step-by-Step Investigation
5. Prevention Best Practices

**Benefits**:
- Complete methodology
- Actionable steps
- Prevention included

## Performance Considerations

### Latency Impact

Chunked mode has significant latency overhead:
- **Outline generation**: ~1-2 seconds
- **Per chunk**: ~1-3 seconds (depends on tokens)
- **Total for 5 chunks**: ~8-15 seconds

**Compared to standard**: 3-8x slower

**Recommendations**:
- Use for genuinely complex queries only
- Limit max chunks (3-5 is optimal)
- Consider async/streaming for UX

### Token Usage

Chunked mode uses more tokens:
- Outline: ~200-400 tokens
- Per chunk: ~1000-1500 tokens (generation)
- Context accumulation: Previous chunks included in later prompts
- Total: ~2-4x standard token usage

**Example** (5 chunks):
- Standard response: ~2000 tokens
- Chunked response: ~6000-8000 tokens

### Quality vs Speed Tradeoff

| Mode | Latency | Tokens | Quality | Best For |
|------|---------|--------|---------|----------|
| Standard | 1x | 1x | Good | Simple queries |
| Chunked (3 chunks) | 4-6x | 2-3x | Better | Moderate complexity |
| Chunked (5 chunks) | 8-12x | 3-5x | Best | High complexity |

## Troubleshooting

### Outline Generation Fails

**Symptom**: Error "Outline generation failed after N attempts"

**Causes**:
- Model struggling with complexity
- Question too vague
- Outline retries exhausted

**Solutions**:
- Increase `FRONTEND_CHUNKED_OUTLINE_RETRIES`
- Increase `FRONTEND_CHUNKED_OUTLINE_TOKENS`
- Rephrase question to be more specific
- Check base model health

### Chunks Not Coherent

**Symptom**: Chunks feel disconnected or repetitive

**Causes**:
- Context accumulation not working
- Model not using previous chunks
- Outline labels too vague

**Solutions**:
- Check chunk prompts include accumulated content
- Improve outline specificity
- Reduce total chunks (better focus per chunk)

### Response Too Long

**Symptom**: Final response exceeds expected length

**Causes**:
- Too many chunks
- Tokens per chunk too high
- Model being verbose

**Solutions**:
- Reduce `FRONTEND_CHUNKED_MAX_CHUNKS`
- Lower `FRONTEND_CHUNKED_TOKENS_PER_CHUNK`
- Add "be concise" to chunk prompts

### Auto-Detection Not Triggering

**Symptom**: Expected chunked mode but didn't activate

**Causes**:
- `FRONTEND_AUTO_CHUNKED=0`
- Confidence below threshold
- Tools enabled (chunks disabled with tools)

**Solutions**:
- Enable: `FRONTEND_AUTO_CHUNKED=1`
- Lower threshold: `FRONTEND_AUTO_CHUNKED_THRESHOLD=0.2`
- Remove tools for chunked generation

## ContextLog Events

Chunked mode logs detailed events:

### Outline Event
```json
{
  "actor": "assistant",
  "act": "chunk_outline",
  "chunk_count": 5,
  "outline": ["Chunk 1", "Chunk 2", ...],
  "raw_outline": "Full outline text",
  "elapsed_ms": 1500
}
```

### Chunk Write Event
```json
{
  "actor": "assistant",
  "act": "chunk_write",
  "chunk_index": 0,
  "chunk_label": "Docker Fundamentals",
  "reasoning_tokens": 150,
  "content_tokens": 800,
  "elapsed_ms": 2000
}
```

### Assembly Event
```json
{
  "actor": "assistant",
  "act": "chunk_assembly",
  "chunk_count": 5,
  "total_reasoning_tokens": 750,
  "total_content_tokens": 4200,
  "total_tokens": 4950,
  "elapsed_ms": 8500
}
```

## Best Practices

1. **Use Auto-Detection**: Enable `FRONTEND_AUTO_CHUNKED=1` for smart triggering
2. **Limit Chunks**: 3-5 chunks is optimal (more = diminishing returns)
3. **Right-Size Tokens**: 800-1200 tokens per chunk works well
4. **Clear Questions**: Specific questions → better outlines
5. **Disable Tools**: Chunked mode works best without tool orchestration
6. **Monitor Performance**: Check ContextLog for overhead
7. **User Feedback**: Set expectations about response time

## Limitations

1. **No Tool Support**: Chunked mode disables tool orchestration
2. **Latency**: Significantly slower than standard mode
3. **Token Cost**: Uses 2-5x more tokens
4. **Outline Dependency**: Poor outline → poor chunks
5. **Model Dependent**: Requires capable model for coherence

## Related Features

- [Self-Review](./self_review.md) - Quality improvement through iteration
- [Combined Mode](../examples/combined_mode.md) - Review + Chunked together
- [Auto-Detection Heuristics](../architecture/heuristics.md) - Pattern matching

## References

- Implementation: `frontend/server.chunked.mjs`
- Config: `frontend/config/chunked_prompts.mjs`
- Tests: `tests/frontend/test_chunked.mjs`
- Heuristics: `frontend/server.heuristics.mjs`
