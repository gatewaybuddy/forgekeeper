# Self-Review Mode

## Overview

Self-review mode is an iterative quality improvement feature that automatically evaluates and refines responses before delivery. The system generates an initial response, evaluates its quality against configurable criteria, and regenerates with feedback if quality is below threshold.

**Key Benefits:**
- Improved response accuracy and completeness
- Automatic detection of incomplete or low-quality responses
- Iterative refinement without user intervention
- Configurable quality thresholds and iteration limits

**When to Use:**
- High-stakes queries requiring accuracy (production, security, critical systems)
- Technical specifications and implementation details
- Code review and debugging tasks
- Questions where correctness is paramount

## Architecture

Self-review operates as a wrapper around the standard orchestrator:

1. **Initial Generation**: Use base orchestrator to generate response
2. **Quality Evaluation**: Evaluate response against review criteria
3. **Threshold Check**: Compare quality score to configured threshold
4. **Regeneration** (if needed): Regenerate with critique feedback
5. **Iteration**: Repeat until quality threshold met or max iterations reached
6. **Best Response**: Return highest-quality response found

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_ENABLE_REVIEW` | `0` | Enable/disable review mode (`1` = enabled) |
| `FRONTEND_REVIEW_MODE` | `manual` | Trigger mode: `manual`, `always`, `auto` |
| `FRONTEND_REVIEW_ITERATIONS` | `2` | Maximum review cycles |
| `FRONTEND_REVIEW_THRESHOLD` | `0.7` | Minimum quality score (0.0-1.0) to accept |
| `FRONTEND_REVIEW_MAX_REGENERATIONS` | `1` | Maximum regeneration attempts |
| `FRONTEND_REVIEW_EVAL_TOKENS` | `512` | Max tokens for review evaluation |
| `FRONTEND_AUTO_REVIEW` | `0` | Enable auto-detection heuristics |
| `FRONTEND_AUTO_REVIEW_THRESHOLD` | `0.5` | Auto-detection confidence threshold |

### Trigger Modes

**Manual** (`manual`):
- Review only when explicitly requested
- User must enable review mode in UI or API

**Always** (`always`):
- Review all responses regardless of context
- Highest quality but slower and more resource-intensive

**Auto** (`auto`):
- Use heuristics to auto-detect when review is needed
- Requires `FRONTEND_AUTO_REVIEW=1`
- See [Auto-Detection Heuristics](#auto-detection-heuristics) below

## Auto-Detection Heuristics

When `FRONTEND_AUTO_REVIEW=1`, the system automatically enables review mode for:

### High-Stakes Requests
- Production deployments
- Critical systems
- Security-related queries
- Vulnerability analysis

**Example Triggers:**
```
"This is critical for production deployment"
"Check for security vulnerabilities"
"Must be correct for our infrastructure"
```

### Technical Accuracy
- Algorithm implementations
- Performance optimization
- Specifications and requirements
- Benchmarking

**Example Triggers:**
```
"Verify the algorithm is correct"
"Ensure accurate performance metrics"
"Validate against specification"
```

### Code Quality
- Debugging
- Bug fixes
- Troubleshooting
- Code review

**Example Triggers:**
```
"Debug this error"
"Fix the bug in production code"
"Review this code for correctness"
```

### Context-Based
- Previous incomplete responses
- Multiple continuations needed
- Long conversation threads

## API Usage

### REST API

```bash
# Enable review mode for a single request
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Verify this algorithm is correct"}
    ],
    "model": "core",
    "review_enabled": true
  }'
```

### Response Format

```json
{
  "assistant": {
    "role": "assistant",
    "content": "Final refined response...",
    "reasoning": "Internal reasoning..."
  },
  "debug": {
    "review": {
      "enabled": true,
      "passes": 2,
      "regenerations": 1,
      "finalScore": 0.85,
      "threshold": 0.7,
      "accepted": true,
      "totalElapsedMs": 3450
    },
    "autoDetection": {
      "mode": "review",
      "confidence": 0.75,
      "reason": "Detected 3 review indicators: highStakes, accuracy, technical"
    }
  }
}
```

## Examples

See [Review Example](../examples/review_example.md) for a complete walkthrough.

### Simple Review Cycle

**Input:**
```
"Verify this production deployment script is secure"
```

**Process:**
1. Generate initial response
2. Evaluate quality: score = 0.65 (below 0.7 threshold)
3. Critique: "Missing security considerations for environment variables"
4. Regenerate with critique
5. Re-evaluate: score = 0.85 (above threshold)
6. Return refined response

### Auto-Detected Review

**Input:**
```
"Debug this critical production error"
```

**Process:**
1. Auto-detection triggers review mode (confidence: 0.80)
2. Generate response
3. Quality evaluation and potential regeneration
4. Return best response with debug info

## Quality Criteria

Review evaluations assess responses against:

1. **Completeness**: Does it fully address all aspects?
2. **Accuracy**: Are there errors or inconsistencies?
3. **Technical Correctness**: Is the information technically sound?
4. **Clarity**: Is it clear and well-structured?
5. **Relevance**: Does it stay on topic?

## Performance Considerations

### Latency Impact

Review mode adds overhead:
- **Single pass**: ~1.5-2.5x base latency
- **With regeneration**: ~2-3x base latency
- **Multiple iterations**: ~3-5x base latency

**Recommendations:**
- Use `manual` or `auto` mode rather than `always`
- Limit review iterations (2-3 is typically sufficient)
- Set reasonable quality thresholds (0.7-0.8 works well)

### Token Usage

Review mode increases token consumption:
- Evaluation prompt: ~200-400 tokens per review
- Regeneration: Full response generation (~500-2000 tokens)
- Total overhead: ~1.5-3x standard token usage

## Troubleshooting

### Review Loop Never Accepts

**Symptom**: All iterations exhausted, quality always below threshold

**Causes:**
- Threshold too high (>0.9)
- Evaluation criteria too strict
- Model struggling with domain/complexity

**Solutions:**
- Lower threshold to 0.6-0.7
- Reduce review iterations
- Check base response quality (may indicate model limitation)

### No Regeneration Happening

**Symptom**: Review enabled but no regeneration occurs

**Causes:**
- `FRONTEND_REVIEW_MAX_REGENERATIONS=0`
- First response meets threshold
- Review mode not actually enabled

**Solutions:**
- Check `FRONTEND_ENABLE_REVIEW=1`
- Verify `FRONTEND_REVIEW_MAX_REGENERATIONS >= 1`
- Inspect `debug.review` in response

### Auto-Detection Not Triggering

**Symptom**: Expected review mode but auto-detection didn't trigger

**Causes:**
- `FRONTEND_AUTO_REVIEW=0` (disabled)
- Confidence below threshold
- Question doesn't match heuristic patterns

**Solutions:**
- Enable: `FRONTEND_AUTO_REVIEW=1`
- Lower threshold: `FRONTEND_AUTO_REVIEW_THRESHOLD=0.4`
- Use manual review for guaranteed activation

## ContextLog Events

Review mode logs detailed events to ContextLog:

### Review Cycle Event
```json
{
  "actor": "assistant",
  "act": "review_cycle",
  "iteration": 1,
  "quality_score": 0.65,
  "threshold": 0.7,
  "critique": "Missing error handling details",
  "accepted": false,
  "elapsed_ms": 850
}
```

### Regeneration Event
```json
{
  "actor": "assistant",
  "act": "regenerate",
  "attempt": 1,
  "reason": "Quality below threshold",
  "previous_score": 0.65,
  "elapsed_ms": 1200
}
```

### Review Summary Event
```json
{
  "actor": "assistant",
  "act": "review_summary",
  "total_passes": 2,
  "final_score": 0.85,
  "regeneration_count": 1,
  "accepted": true,
  "total_elapsed_ms": 3450
}
```

## Best Practices

1. **Use Auto-Detection**: Enable `FRONTEND_AUTO_REVIEW=1` for smart triggering
2. **Set Reasonable Thresholds**: 0.7-0.8 works well for most cases
3. **Limit Iterations**: 2-3 review cycles is typically sufficient
4. **Monitor Performance**: Check ContextLog for review overhead
5. **Combine with Tools**: Review works with tool orchestration
6. **Test Thresholds**: Adjust based on your quality requirements

## Related Features

- [Chunked Reasoning](./chunked_reasoning.md) - For long, complex responses
- [Combined Mode](../examples/combined_mode.md) - Review + Chunked together
- [Auto-Detection Heuristics](../architecture/heuristics.md) - Pattern matching details

## References

- Implementation: `frontend/server.review.mjs`
- Config: `frontend/config/review_prompts.mjs`
- Tests: `tests/frontend/test_review.mjs`
- Heuristics: `frontend/server.heuristics.mjs`
