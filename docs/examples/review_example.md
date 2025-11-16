# Self-Review Mode Example

This example demonstrates self-review mode in action, showing how the system iteratively improves response quality.

## Scenario: Production Deployment Verification

**User Question:**
```
Verify this Kubernetes deployment configuration is production-ready and secure.
```

**Configuration:**
```bash
FRONTEND_ENABLE_REVIEW=1
FRONTEND_REVIEW_MODE=auto
FRONTEND_REVIEW_THRESHOLD=0.75
FRONTEND_REVIEW_ITERATIONS=3
FRONTEND_AUTO_REVIEW=1
```

## Execution Flow

### Step 1: Auto-Detection

The heuristics system analyzes the question:

```javascript
{
  "mode": "review",
  "confidence": 0.85,
  "reason": "Detected 3 review indicators: highStakes, accuracy, technical",
  "detection": {
    "review": {
      "shouldUse": true,
      "confidence": 0.85,
      "matches": [
        { "category": "highStakes", "pattern": "/production/i" },
        { "category": "accuracy", "pattern": "/verify/i" },
        { "category": "technical", "pattern": "/deployment/i" }
      ]
    }
  }
}
```

**Result**: Review mode automatically enabled (confidence 0.85 > 0.5 threshold)

### Step 2: Initial Generation

Standard orchestrator generates first response:

**Initial Response** (simplified):
```
Your Kubernetes deployment looks good. Here are the key points:

1. Resource limits are set
2. Health checks configured
3. Deployment strategy is RollingUpdate

You should be ready to deploy.
```

**Quality Evaluation:**
- Completeness: 6/10 (missing several important checks)
- Accuracy: 7/10 (generally correct but vague)
- Detail: 5/10 (lacks specific recommendations)

**Quality Score: 0.60** (below 0.75 threshold)

### Step 3: First Review Cycle

**Review Prompt:**
```
Original question: "Verify this Kubernetes deployment configuration..."
Generated response: [initial response]

Review questions:
1. Is this response satisfactory for the prompt?
2. Does it fully address all aspects?
3. Are there errors or areas needing improvement?
4. Is it complete or cut off?
5. Rate 0.0 to 1.0

Provide:
- Quality score (0.0-1.0)
- Brief critique
- Specific improvements needed
```

**Review Response:**
```
Quality score: 0.60

Critique: The response provides basic validation but misses critical
production concerns. It doesn't address security hardening, secret
management, network policies, resource quotas, or disaster recovery.
For a production-ready verification, these are essential.

Improvements needed:
- Add security hardening checklist
- Verify secret management approach
- Check network policies
- Validate resource quotas
- Include rollback strategy
```

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "review_cycle",
  "iteration": 1,
  "quality_score": 0.60,
  "threshold": 0.75,
  "critique": "Missing critical production concerns...",
  "accepted": false,
  "elapsed_ms": 850
}
```

### Step 4: Regeneration with Critique

**Regeneration Prompt:**
```
Your previous response received a quality score of 0.60.

Review feedback:
The response provides basic validation but misses critical production
concerns. It doesn't address security hardening, secret management,
network policies, resource quotas, or disaster recovery.

Please regenerate the response addressing the feedback above.
```

**Regenerated Response:**
```
Production-Ready Kubernetes Deployment Verification:

✅ RESOURCE MANAGEMENT
- Resource limits: Configured (CPU: 500m, Memory: 512Mi)
- Resource requests: Set appropriately
- Recommendation: Consider vertical pod autoscaling

✅ HEALTH & RELIABILITY
- Liveness probe: HTTP /healthz on port 8080 ✓
- Readiness probe: HTTP /ready on port 8080 ✓
- Rolling update strategy: maxUnavailable=1, maxSurge=1 ✓

⚠️ SECURITY HARDENING (NEEDS ATTENTION)
- Pod security policy: NOT CONFIGURED
- Security context: Missing (should set runAsNonRoot: true)
- Network policies: MISSING - Recommend implementing ingress/egress rules
- Image pull policy: "Always" ✓

⚠️ SECRET MANAGEMENT
- Secrets: Using environment variables - AVOID THIS
- Recommendation: Use Kubernetes Secrets or external vault
- Current approach exposes secrets in pod spec

✅ DEPLOYMENT CONFIGURATION
- Replicas: 3 (good for HA)
- Deployment strategy: RollingUpdate ✓
- Revision history: 10 ✓

❌ CRITICAL MISSING ITEMS
1. Network policies for pod-to-pod communication
2. Resource quotas and limit ranges
3. Pod disruption budget for availability
4. Backup/restore strategy
5. Monitoring and alerting integration

PRODUCTION READINESS: 60%

REQUIRED BEFORE DEPLOYMENT:
1. Implement pod security policies
2. Fix secret management (use Secrets object)
3. Add network policies
4. Configure pod disruption budget
5. Set up monitoring/alerting

NOT production-ready as-is. Address critical items above first.
```

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "regenerate",
  "attempt": 1,
  "reason": "Quality below threshold",
  "previous_score": 0.60,
  "elapsed_ms": 2400
}
```

### Step 5: Second Review Cycle

**Quality Evaluation:**
- Completeness: 9/10 (covers all major areas)
- Accuracy: 9/10 (technically correct)
- Detail: 9/10 (specific actionable items)
- Structure: 10/10 (well-organized with clear sections)

**Quality Score: 0.88** (above 0.75 threshold)

**Review Response:**
```
Quality score: 0.88

Critique: Excellent comprehensive verification. Covers security,
reliability, resource management, and provides actionable
recommendations. The checklist format makes it easy to follow.
Clear production readiness assessment.
```

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "review_cycle",
  "iteration": 2,
  "quality_score": 0.88,
  "threshold": 0.75,
  "critique": "Excellent comprehensive verification...",
  "accepted": true,
  "elapsed_ms": 900
}
```

### Step 6: Review Summary

**ContextLog Event:**
```json
{
  "actor": "assistant",
  "act": "review_summary",
  "total_passes": 2,
  "final_score": 0.88,
  "regeneration_count": 1,
  "accepted": true,
  "total_elapsed_ms": 4150
}
```

## Final Response

```json
{
  "assistant": {
    "role": "assistant",
    "content": "[Regenerated comprehensive response]"
  },
  "debug": {
    "review": {
      "enabled": true,
      "passes": 2,
      "regenerations": 1,
      "finalScore": 0.88,
      "threshold": 0.75,
      "accepted": true,
      "totalElapsedMs": 4150
    },
    "autoDetection": {
      "mode": "review",
      "confidence": 0.85,
      "reason": "Detected 3 review indicators: highStakes, accuracy, technical"
    }
  }
}
```

## Key Takeaways

1. **Auto-Detection Works**: System correctly identified high-stakes production query
2. **Iterative Improvement**: Score improved from 0.60 → 0.88
3. **Critique Quality**: Specific, actionable feedback drives better regeneration
4. **Performance Cost**: 4.15s total (vs ~1.5s standard) - acceptable for high-stakes
5. **Final Quality**: Comprehensive, production-ready verification checklist

## Variations

### Manual Trigger

```bash
curl -X POST http://localhost:3000/api/chat \
  -d '{"messages": [...], "review_enabled": true}'
```

### Different Thresholds

```bash
# Stricter (higher quality required)
FRONTEND_REVIEW_THRESHOLD=0.85

# More lenient (faster, fewer regenerations)
FRONTEND_REVIEW_THRESHOLD=0.65
```

### More Iterations

```bash
# Allow up to 3 review cycles
FRONTEND_REVIEW_ITERATIONS=3

# Allow up to 2 regenerations
FRONTEND_REVIEW_MAX_REGENERATIONS=2
```

## ContextLog Analysis

Query all review events for this conversation:

```bash
cat .forgekeeper/context_log/ctx-*.jsonl | \
  jq -c 'select(.conv_id == "conv-123" and .act | contains("review"))'
```

Sample output:
```json
{"ts":"2025-11-16T10:30:00.000Z","act":"review_cycle","iteration":1,"quality_score":0.60,"accepted":false,"elapsed_ms":850}
{"ts":"2025-11-16T10:30:02.000Z","act":"regenerate","attempt":1,"previous_score":0.60,"elapsed_ms":2400}
{"ts":"2025-11-16T10:30:05.000Z","act":"review_cycle","iteration":2,"quality_score":0.88,"accepted":true,"elapsed_ms":900}
{"ts":"2025-11-16T10:30:06.000Z","act":"review_summary","total_passes":2,"final_score":0.88,"total_elapsed_ms":4150}
```
