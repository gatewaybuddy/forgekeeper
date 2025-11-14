# TGT (Telemetry-Driven Task Generation)

**Status**: ✅ Implemented (Weeks 1-8)

TGT automatically converts system telemetry (ContextLog events, metrics, errors) into actionable Task Cards for prioritization and execution.

**📖 New to TGT?** See the **[TGT User Guide](../../guides/TGT_USER_GUIDE.md)** for practical examples and how-to instructions.

This document is the technical reference. For usage instructions, start with the user guide.

---

## Overview

TGT enables Forgekeeper to:
- **Auto-detect issues** from telemetry (high continuation rates, error spikes, missing docs)
- **Generate Task Cards** with severity, evidence, suggested fixes
- **Prioritize tasks** using smart scoring (Week 9 integration)
- **Auto-approve low-risk tasks** (Week 8 integration)

---

## Implementation History

**Weeks 1-8**: Core TGT system

- [Week 1: Foundation](TGT_WEEK1_IMPLEMENTATION_SUMMARY.md) - Telemetry analysis, task detection
- [Week 2: Refinement](TGT_WEEK2_IMPLEMENTATION_SUMMARY.md) - Improved heuristics, confidence scoring
- [Week 3: API Integration](TGT_WEEK3_API_INTEGRATION.md) - REST endpoints, UI integration
- [Week 4: Scheduling](TGT_WEEK4_SCHEDULING.md) + [UI Complete](TGT_WEEK4_UI_COMPLETE.md) - Background processing, UI polish
- [Week 5: Realtime Updates](TGT_WEEK5_REALTIME_UPDATES.md) - WebSocket integration, live task updates
- [Week 6: Advanced Features](TGT_WEEK6_ADVANCED_FEATURES.md) - Batch operations, templates, dependencies
- [Week 7: Analytics Dashboard](TGT_WEEK7_ANALYTICS_DASHBOARD.md) - Funnel metrics, auto-approval stats
- [Week 8: Plan](TGT_WEEK8_PLAN.md) - Future enhancements

---

## Key Documents

- **[TGT Implementation Status](TGT_IMPLEMENTATION_STATUS.md)** - Current status and feature matrix
- **[TGT Concept](tgt_telemetry_driven_task_generator.md)** - Original design document

---

## Architecture

### Detection Heuristics

1. **High Continuation Rate** (>15% in last 60 min) → Prompt quality issue
2. **Error Spikes** (upstream/tool errors > threshold) → Integration problem
3. **Missing Docs** (new features without documentation) → Docs gap
4. **Performance Degradation** (slow response times) → Optimization needed

### Task Card Structure

```javascript
{
  id: 'ULID',
  type: 'performance_degradation' | 'error_spike' | 'documentation_gap' | 'ux_issue',
  severity: 'critical' | 'high' | 'medium' | 'low',
  title: 'High continuation rate detected',
  description: 'Continuation rate 18% in last hour (threshold: 15%)',
  evidence: {
    summary: '18 continuations out of 100 responses',
    details: ['/api/chat/stream: 12 continuations', ...],
    metrics: { continuationRate: 0.18, threshold: 0.15 },
  },
  suggestedFix: 'Review prompts causing incomplete responses',
  acceptanceCriteria: ['Continuation rate <10%', 'Monitor for 24 hours'],
  generatedAt: '2025-11-04T...',
  analyzer: 'continuation-rate',
  confidence: 0.9,
  priority: 1,
}
```

---

## Integration Points

### Week 8 Features
- **Auto-Approval**: `shouldAutoApprove()` checks confidence, analyzer trust, rate limits
- **Templates**: Pre-defined task templates for common patterns
- **Batch Operations**: Approve/dismiss multiple tasks at once

### Week 9 Features
- **Priority Scoring**: Smart prioritization based on severity, confidence, age, impact
- **Dependencies**: Task relationships and blockers
- **Smart Sorting**: Multiple sort strategies (priority, confidence, date)

---

## API Endpoints

```
GET  /api/taskgen/analyze?window_min=60  - Analyze telemetry
POST /api/taskgen/generate               - Generate task cards
GET  /api/taskgen/suggest                - Get suggested tasks
POST /api/tasks/approve                  - Approve task
POST /api/tasks/dismiss                  - Dismiss task with reason
```

---

## Configuration

```bash
TASKGEN_ENABLED=1                    # Enable task generation
TASKGEN_WINDOW_MIN=60                # Analysis window (minutes)
TASKGEN_CONTINUATION_THRESHOLD=0.15   # Continuation rate threshold
TASKGEN_ERROR_THRESHOLD=5            # Errors per hour
TASKGEN_AUTO_APPROVE=1               # Enable auto-approval
TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9   # Min confidence for auto-approval
```

---

## Testing

Tests located in:
- `frontend/tests/week8-week9-integration.test.mjs` - Integration tests (22/22 passing)
- `frontend/tests/tgt.integration.test.mjs` - TGT-specific tests

---

## Future Enhancements (Week 8 Plan)

See [TGT_WEEK8_PLAN.md](TGT_WEEK8_PLAN.md) for planned improvements.

---

**Last Updated**: 2025-11-04
