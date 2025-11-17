# ADR-0003: Collaborative Intelligence (Human-in-the-Loop)

**Status**: Draft
**Date**: 2025-11-16
**Authors**: Claude Code
**Relates to**: Phase 8 - Collaborative Intelligence

---

## Context

The autonomous agent system (Phases 1-7) operates independently, making decisions and executing actions without explicit user approval. While this enables efficiency, it can lead to:
- Lack of user control over critical operations
- Reduced trust in automated decisions
- Missed opportunities for user expertise
- Difficulty understanding agent reasoning

**Phase 8** introduces **Collaborative Intelligence**: a human-in-the-loop system that enables users to participate in agent decision-making while maintaining automation efficiency.

---

## Decision

Implement a collaborative intelligence system with:

1. **Approval Workflows**: Pause execution for user approval on critical operations
2. **Decision Checkpoints**: Allow users to review and modify agent plans before execution
3. **Feedback Integration**: Capture user feedback to improve future decisions
4. **Interactive Planning**: Enable real-time collaboration during task planning
5. **Trust Calibration**: Build user confidence through transparency and control

---

## Architecture

### 1. Approval Workflow System

**Core Concept**: Before executing critical operations, request user approval.

```typescript
interface ApprovalRequest {
  id: string;
  timestamp: string;
  operation: string;
  context: {
    task: string;
    reasoning: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    alternatives?: string[];
  };
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}

interface ApprovalResponse {
  requestId: string;
  decision: 'approve' | 'reject' | 'modify';
  feedback?: string;
  modifications?: Record<string, unknown>;
  timestamp: string;
}
```

**Workflow States**:
```
[Agent Action] → [Risk Assessment] → [Approval Request?]
                                              ↓
                                      [User Decision]
                                              ↓
                          [Approved] → [Execute] → [Log Result]
                               ↓
                          [Rejected] → [Log] → [Alternative?]
                               ↓
                          [Modified] → [Apply Changes] → [Execute]
```

### 2. Decision Checkpoint System

**Core Concept**: Pause at key decision points for user review.

```typescript
interface DecisionCheckpoint {
  id: string;
  type: 'plan' | 'strategy' | 'parameter' | 'execution';
  title: string;
  description: string;
  options: DecisionOption[];
  recommendation: string;
  confidence: number; // 0.0-1.0
  status: 'waiting' | 'resolved';
}

interface DecisionOption {
  id: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedEffort?: string;
}
```

**Checkpoint Triggers**:
- Planning multi-step tasks (>3 steps)
- Selecting between multiple strategies
- Before irreversible operations (delete, deploy)
- When confidence < threshold (default: 0.7)
- User-requested manual checkpoints

### 3. Risk Assessment Engine

**Purpose**: Automatically classify operations by risk level to determine if approval needed.

```typescript
interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  score: number; // 0.0-1.0
  requiresApproval: boolean;
}

interface RiskFactor {
  category: 'data' | 'code' | 'config' | 'external' | 'security';
  description: string;
  weight: number;
}
```

**Risk Classification Rules**:
- **Low**: Read operations, info queries, local analysis
- **Medium**: File writes, config changes, tool execution
- **High**: Code changes, git commits, API calls
- **Critical**: Deployments, deletes, security changes, production operations

### 4. Feedback Integration

**Core Concept**: Learn from user decisions to improve future recommendations.

```typescript
interface UserFeedback {
  decisionId: string;
  userChoice: string;
  agentRecommendation: string;
  wasCorrect: boolean;
  userReason?: string;
  timestamp: string;
}

interface FeedbackAnalysis {
  pattern: string;
  frequency: number;
  userPreference: string;
  confidence: number;
}
```

**Learning Mechanism**:
1. Store all user decisions with context
2. Analyze patterns in user preferences
3. Adjust future recommendations based on history
4. Build user preference profile over time

### 5. Interactive Planning UI

**Core Concept**: Real-time collaboration during task planning phase.

**UI Components**:
- **ApprovalModal**: Display approval requests with context
- **DecisionDialog**: Present options with pros/cons
- **PlanReview**: Show proposed plan with modify capability
- **FeedbackForm**: Capture user reasoning for decisions
- **ProgressTracker**: Show checkpoints in task execution

---

## Implementation Plan

### Phase 8.1: Core Approval System (T301-T303)

**T301 - Approval Request System**
- Backend: Approval request queue
- API: POST `/api/autonomous/approval/request`
- API: POST `/api/autonomous/approval/respond`
- ContextLog: Approval events
- Tests: Approval workflow

**T302 - Risk Assessment Engine**
- Risk classification rules
- Automatic risk scoring
- Approval requirement logic
- Configuration (thresholds, rules)
- Tests: Risk assessment accuracy

**T303 - Approval UI Components**
- `ApprovalModal.tsx` - Modal for approval requests
- Real-time notification system
- Approval queue display
- Keyboard shortcuts (approve/reject)
- Tests: UI component behavior

### Phase 8.2: Decision Checkpoints (T304-T306)

**T304 - Checkpoint System**
- Checkpoint definition and triggers
- Option presentation logic
- Decision capture and storage
- Backend integration
- Tests: Checkpoint workflow

**T305 - Interactive Planning**
- Plan review UI
- Modification interface
- Alternative generation
- Plan validation
- Tests: Planning interaction

**T306 - Confidence Calibration**
- Confidence scoring for decisions
- Threshold configuration
- Automatic checkpoint triggering
- Confidence display in UI
- Tests: Calibration accuracy

### Phase 8.3: Feedback & Learning (T307-T309)

**T307 - Feedback Collection**
- Feedback capture forms
- Reason/justification input
- Rating system (optional)
- ContextLog integration
- Tests: Feedback storage

**T308 - Pattern Analysis**
- User preference detection
- Decision pattern recognition
- Recommendation adjustment
- Preference profile building
- Tests: Pattern accuracy

**T309 - Adaptive Recommendations**
- Use feedback to improve suggestions
- Personalized recommendations
- Confidence adjustment based on history
- A/B testing framework (optional)
- Tests: Recommendation quality

### Phase 8.4: Integration & Polish (T310-T312)

**T310 - ContextLog Integration**
- Collaboration event schemas
- Approval/rejection events
- Checkpoint events
- Feedback events
- Query endpoints

**T311 - Configuration & Tuning**
- Environment variables
- Risk thresholds
- Checkpoint triggers
- UI preferences
- Documentation

**T312 - Testing & Validation**
- Integration tests
- E2E workflows
- Performance testing
- User acceptance criteria
- Documentation

---

## Configuration

### Environment Variables

```bash
# Phase 8: Collaborative Intelligence
AUTONOMOUS_ENABLE_COLLABORATION=1  # Enable human-in-loop features
AUTONOMOUS_APPROVAL_REQUIRED=high  # Minimum risk level requiring approval (low/medium/high/critical)
AUTONOMOUS_CHECKPOINT_THRESHOLD=0.7  # Confidence threshold for automatic checkpoints
AUTONOMOUS_ENABLE_FEEDBACK=1  # Enable feedback collection
AUTONOMOUS_FEEDBACK_LEARNING=1  # Use feedback to adjust recommendations

# Approval Timeouts
AUTONOMOUS_APPROVAL_TIMEOUT_MS=300000  # 5 minutes default
AUTONOMOUS_CHECKPOINT_TIMEOUT_MS=600000  # 10 minutes default

# UI Configuration
AUTONOMOUS_APPROVAL_SOUND=1  # Play sound on approval request
AUTONOMOUS_APPROVAL_DESKTOP_NOTIFY=0  # Desktop notifications (off by default)
```

---

## ContextLog Event Schemas

### Approval Request Event
```json
{
  "id": "uuid",
  "ts": "2025-11-16T...",
  "actor": "autonomous",
  "act": "approval_request",
  "conv_id": "conversation-id",
  "trace_id": "trace-id",
  "operation": "git_commit",
  "risk_level": "high",
  "risk_score": 0.85,
  "reasoning": "Committing changes to production branch",
  "context": {...}
}
```

### Approval Response Event
```json
{
  "id": "uuid",
  "ts": "2025-11-16T...",
  "actor": "user",
  "act": "approval_response",
  "conv_id": "conversation-id",
  "trace_id": "trace-id",
  "request_id": "approval-request-id",
  "decision": "approved",
  "feedback": "Looks good, proceed",
  "elapsed_ms": 45000
}
```

### Decision Checkpoint Event
```json
{
  "id": "uuid",
  "ts": "2025-11-16T...",
  "actor": "autonomous",
  "act": "decision_checkpoint",
  "conv_id": "conversation-id",
  "checkpoint_type": "strategy",
  "options_count": 3,
  "recommendation": "option-2",
  "confidence": 0.65,
  "user_choice": "option-3",
  "elapsed_ms": 120000
}
```

---

## User Experience

### Approval Request Flow

1. **Agent detects high-risk operation**
   - Assesses risk level automatically
   - Determines approval needed

2. **Approval request appears**
   - Modal overlay with operation details
   - Shows reasoning and impact
   - Presents alternatives if available
   - Clear approve/reject/modify buttons

3. **User reviews and decides**
   - Reads context and reasoning
   - Evaluates alternatives
   - Optionally provides feedback
   - Makes decision

4. **Agent continues based on decision**
   - Approved: Executes operation
   - Rejected: Logs rejection, offers alternatives
   - Modified: Applies changes, executes

### Decision Checkpoint Flow

1. **Agent reaches decision point**
   - Multiple valid approaches exist
   - Confidence below threshold
   - User-requested checkpoint

2. **Checkpoint dialog appears**
   - Shows all options with pros/cons
   - Indicates agent recommendation
   - Displays confidence level
   - Allow plan modification

3. **User selects option**
   - Reviews alternatives
   - Chooses preferred approach
   - Optionally explains reasoning

4. **Agent proceeds with user's choice**
   - Logs decision and reasoning
   - Updates preference profile
   - Continues execution

---

## Benefits

### For Users
- ✅ **Control**: Explicit approval for critical operations
- ✅ **Trust**: Transparency in agent decision-making
- ✅ **Safety**: Prevent unintended destructive actions
- ✅ **Learning**: Understand agent reasoning process
- ✅ **Collaboration**: Combine human expertise with AI automation

### For System
- ✅ **Risk Mitigation**: Human review for high-risk operations
- ✅ **Quality**: Better decisions through collaboration
- ✅ **Adaptability**: Learn user preferences over time
- ✅ **Accountability**: Clear audit trail of decisions
- ✅ **Confidence**: Calibrated recommendations

---

## Trade-offs

### Pros
- Increased user control and trust
- Reduced risk of unintended actions
- Better decision quality through collaboration
- Learning system improves over time
- Clear accountability and audit trail

### Cons
- Reduced automation efficiency (requires user interaction)
- Potential for workflow interruption
- Increased cognitive load for users
- More complex implementation
- Latency in task execution

### Mitigation Strategies
- **Configurable risk thresholds**: Users control level of intervention
- **Smart defaults**: Approve low-risk operations automatically
- **Batch approvals**: Group similar operations
- **Learn preferences**: Reduce prompts for trusted patterns
- **Async approvals**: Don't block on approvals when possible

---

## Success Metrics

### User Satisfaction
- % of users enabling collaboration features
- Average approval response time
- User feedback ratings
- Feature adoption rate

### System Quality
- Reduction in unintended operations
- Approval override rate (user disagrees with recommendation)
- Accuracy of risk assessment
- Preference learning convergence

### Performance
- Approval request latency
- UI responsiveness
- Decision checkpoint overhead
- Feedback processing time

---

## Risks & Mitigation

### Risk 1: Approval Fatigue
**Description**: Too many approval requests annoy users

**Mitigation**:
- Configurable risk thresholds
- Learn user preferences to reduce prompts
- Batch similar operations
- Default to auto-approve low-risk operations

### Risk 2: Decision Paralysis
**Description**: Users overwhelmed by complex choices

**Mitigation**:
- Clear recommendations with rationale
- Limit options to 3-4 most relevant
- Provide "use recommended" quick action
- Show confidence levels

### Risk 3: Workflow Interruption
**Description**: Breaks user flow and context

**Mitigation**:
- Async approvals when possible
- Clear context in approval requests
- Keyboard shortcuts for quick decisions
- Remember user context across sessions

### Risk 4: Learning Accuracy
**Description**: System learns wrong preferences

**Mitigation**:
- Allow users to review and edit preferences
- Confidence scoring on learned patterns
- Periodic preference confirmation
- Clear feedback when recommendations change

---

## Future Enhancements

### Phase 8+ (Future)
- **Voice approvals**: "Approve" voice command
- **Gesture control**: Swipe to approve on mobile
- **Predictive approvals**: Pre-approve based on context
- **Team collaboration**: Multi-user approvals
- **Approval delegation**: Assign approvals to team members
- **Policy engine**: Custom approval rules per organization

---

## Implementation Timeline

### Week 1: Core System
- T301: Approval request system
- T302: Risk assessment engine
- T303: Basic approval UI

### Week 2: Checkpoints
- T304: Checkpoint system
- T305: Interactive planning
- T306: Confidence calibration

### Week 3: Learning
- T307: Feedback collection
- T308: Pattern analysis
- T309: Adaptive recommendations

### Week 4: Polish
- T310: ContextLog integration
- T311: Configuration & tuning
- T312: Testing & documentation

**Total Effort**: 8-12 hours (estimated)

---

## References

- [Phase 1-7 Autonomous Agent Implementation](../autonomous/phases/)
- [ContextLog ADR-0001](../contextlog/adr-0001-contextlog.md)
- [Self-Review ADR-0002](./adr-0002-self-review-and-chunked-reasoning.md)
- [Autonomous Agent Documentation](../autonomous/)

---

**Status**: Ready for implementation
**Next Steps**: Create task cards (T301-T312) and begin implementation
**Dependencies**: Phases 1-7 autonomous agent (complete), ContextLog system (complete)
