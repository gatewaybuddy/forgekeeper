# Collaborative Intelligence (Human-in-the-Loop) - Complete Guide

**Status**: ✅ Complete (Sprint 4)
**Version**: 1.0.0
**Last Updated**: 2025-11-21

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Configuration](#configuration)
5. [Usage Guide](#usage-guide)
6. [API Reference](#api-reference)
7. [Event Schemas](#event-schemas)
8. [Analytics & Monitoring](#analytics--monitoring)
9. [Troubleshooting](#troubleshooting)
10. [Examples](#examples)

---

## Overview

The Collaborative Intelligence system (Phase 8) adds human-in-the-loop capabilities to Forgekeeper's autonomous agent, enabling:

- **Approval Workflows**: Request user approval for critical operations
- **Decision Checkpoints**: Pause for user input at key decision points
- **Feedback Collection**: Capture and learn from user feedback
- **Preference Learning**: Detect patterns in user decisions
- **Adaptive Recommendations**: Personalize recommendations based on user history

### Benefits

- ✅ **Increased Control**: Explicit approval for high-risk operations
- ✅ **Trust Building**: Transparency in agent decision-making
- ✅ **Safety**: Prevention of unintended destructive actions
- ✅ **Learning**: System improves through user feedback
- ✅ **Personalization**: Tailored recommendations for each user

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Collaborative Intelligence                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Approval   │  │   Decision   │  │   Feedback   │      │
│  │   System     │  │  Checkpoints │  │  Collection  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────┐        │
│  │        Preference Analysis & Learning           │        │
│  │  - Pattern Detection                            │        │
│  │  - User Profile Building                        │        │
│  │  - Historical Analysis                          │        │
│  └────────────────────┬────────────────────────────┘        │
│                       │                                     │
│  ┌────────────────────┴────────────────────────┐            │
│  │      Adaptive Recommendation System         │            │
│  │  - Personalized Suggestions                 │            │
│  │  - Confidence Scoring                       │            │
│  │  - A/B Testing                              │            │
│  └────────────────────┬────────────────────────┘            │
│                       │                                     │
│  ┌────────────────────┴────────────────────────┐            │
│  │          ContextLog Integration             │            │
│  │  - Event Logging                            │            │
│  │  - Query & Analytics                        │            │
│  │  - Export & Reporting                       │            │
│  └─────────────────────────────────────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | File | Purpose |
|--------|------|---------|
| Approval System | `server.approval.mjs` | Request/response queue for approvals |
| Risk Assessment | `server.risk-assessment.mjs` | Classify operations by risk level |
| Confidence Calibration | `server.confidence-calibration.mjs` | Score agent confidence |
| Feedback Collection | `server.feedback.mjs` | Capture and store user feedback |
| Preference Analysis | `server.preference-analysis.mjs` | Detect user preference patterns |
| Adaptive Recommendations | `server.adaptive-recommendations.mjs` | Generate personalized suggestions |
| Collaboration Events | `server.collaboration-events.mjs` | Unified ContextLog access |

---

## Features

### 1. Approval Workflows (T301-T303)

**Purpose**: Request explicit user approval before executing critical operations.

**How It Works**:
1. Agent detects high-risk operation
2. Risk assessment determines approval needed
3. Approval request sent to user
4. User approves, rejects, or modifies
5. Agent proceeds based on decision

**Risk Levels**:
- **Low**: Read operations, queries
- **Medium**: File writes, config changes
- **High**: Code changes, git commits
- **Critical**: Deployments, deletes, production ops

**Example**:
```javascript
import { requestApproval } from './server.approval.mjs';

const response = await requestApproval('git_commit', {
  task: 'Commit changes to main branch',
  reasoning: 'User requested commit of feature implementation',
  impact: 'high',
  alternatives: ['Create PR instead', 'Commit to feature branch'],
}, {
  convId: 'conv-123',
  timeoutMs: 300000, // 5 minutes
});

if (response.decision === 'approve') {
  // Execute operation
} else if (response.decision === 'modify') {
  // Apply modifications from response.modifications
}
```

### 2. Decision Checkpoints (T304-T306)

**Purpose**: Pause at key decision points for user review and input.

**Checkpoint Triggers**:
- Planning multi-step tasks (>3 steps)
- Selecting between multiple strategies
- Before irreversible operations
- When confidence < threshold (default: 0.7)
- User-requested manual checkpoints

**Confidence Scoring**:
```javascript
import { calibrateConfidence } from './server.confidence-calibration.mjs';

const confidence = calibrateConfidence({
  task: 'Refactor authentication module',
  context: { complexity: 'high', testCoverage: 0.75 },
  historicalAccuracy: 0.82,
});

if (confidence.score < 0.7) {
  // Trigger decision checkpoint
}
```

### 3. Feedback Collection (T307)

**Purpose**: Capture user feedback to improve future decisions.

**Feedback Categories**:
- `decision`: Feedback on agent decisions
- `approval`: Feedback on approval processes
- `checkpoint`: Feedback on checkpoints
- `system`: General system feedback
- `general`: Other feedback

**Example**:
```javascript
import { submitFeedback } from './server.feedback.mjs';

submitFeedback('decision', {
  rating: 5,
  reasoning: 'Good approach, well-reasoned',
  suggestion: 'Consider adding more tests',
  tags: ['refactoring', 'code_quality'],
  context: {
    decisionId: 'decision-123',
    convId: 'conv-123',
  },
});
```

### 4. Preference Analysis (T308)

**Purpose**: Detect patterns in user behavior to build preference profiles.

**Pattern Categories**:
- `risk_tolerance`: User's willingness to take risks
- `decision_preference`: Preferred approaches (by tags)
- `suggestion_adoption`: How often user adopts suggestions

**Example**:
```javascript
import { buildPreferenceProfile, hasPattern } from './server.preference-analysis.mjs';

const profile = buildPreferenceProfile('user-123');

// Check for specific pattern
const highRiskTolerance = hasPattern('risk_tolerance', 'high_risk_tolerance', 'user-123');

if (highRiskTolerance) {
  // User prefers high-risk options, adjust recommendations
}
```

### 5. Adaptive Recommendations (T309)

**Purpose**: Generate personalized recommendations based on user preferences and history.

**Scoring Factors**:
- Base option score (0.0-1.0)
- Preference pattern matches (+up to 40%)
- Historical choice frequency (+up to 30%)
- Risk preference alignment (+up to 10%)

**Example**:
```javascript
import { generateRecommendations, recordRecommendationChoice } from './server.adaptive-recommendations.mjs';

const options = [
  { id: 'refactor', label: 'Refactor code', baseScore: 0.6, tags: ['refactoring'] },
  { id: 'quick-fix', label: 'Apply quick fix', baseScore: 0.7, tags: ['quick'] },
];

const result = generateRecommendations('decision_preference', options, {
  userId: 'user-123',
  convId: 'conv-123',
});

// Present to user
console.log(`Recommended: ${result.topRecommendation} (confidence: ${result.confidence})`);

// After user chooses
recordRecommendationChoice(result.id, 'refactor', {
  userId: 'user-123',
  category: 'decision_preference',
  wasRecommended: result.topRecommendation === 'refactor',
});
```

### 6. ContextLog Integration (T310)

**Purpose**: Unified access to all collaboration events for analytics and debugging.

**Query Examples**:
```javascript
import {
  queryCollaborationEvents,
  getCollaborationTimeline,
  getCollaborationAnalytics,
} from './server.collaboration-events.mjs';

// Query specific events
const approvals = queryCollaborationEvents({
  eventTypes: ['approval_request', 'approval_response'],
  convId: 'conv-123',
  limit: 100,
});

// Get timeline for conversation
const timeline = getCollaborationTimeline('conv-123');

// Get user analytics
const analytics = getCollaborationAnalytics('user-123', { days: 30 });
console.log(`Approval accuracy: ${analytics.approvals.approved / analytics.approvals.total}`);
```

---

## Configuration

### Environment Variables

#### Core Settings

```bash
# Enable/disable collaborative intelligence
AUTONOMOUS_ENABLE_COLLABORATION=1  # 1=enabled, 0=disabled (default: 0)

# Feedback and learning
AUTONOMOUS_ENABLE_FEEDBACK=1  # Enable feedback collection (default: 1)
AUTONOMOUS_FEEDBACK_LEARNING=1  # Use feedback for learning (default: 1)
```

#### Approval System

```bash
# Approval timeout (milliseconds)
AUTONOMOUS_APPROVAL_TIMEOUT_MS=300000  # Default: 5 minutes

# Minimum risk level requiring approval
AUTONOMOUS_APPROVAL_REQUIRED=high  # Values: low, medium, high, critical
```

#### Decision Checkpoints

```bash
# Confidence threshold for triggering checkpoints
AUTONOMOUS_CHECKPOINT_THRESHOLD=0.7  # Default: 0.7 (70%)

# Checkpoint timeout (milliseconds)
AUTONOMOUS_CHECKPOINT_TIMEOUT_MS=600000  # Default: 10 minutes
```

#### Feedback Collection

```bash
# Require rating with feedback
AUTONOMOUS_REQUIRE_FEEDBACK_RATING=0  # Default: 0 (optional)

# Maximum feedback entries to store
AUTONOMOUS_MAX_FEEDBACK_ENTRIES=5000  # Default: 5000
```

#### Preference Analysis

```bash
# Minimum samples to detect pattern
PREFERENCE_MIN_SAMPLES=5  # Default: 5

# Confidence threshold for using patterns
PREFERENCE_CONFIDENCE_THRESHOLD=0.6  # Default: 0.6

# Frequency threshold for patterns
PREFERENCE_FREQUENCY_THRESHOLD=0.5  # Default: 0.5 (50%)

# Max patterns per category
PREFERENCE_MAX_PATTERNS_PER_CATEGORY=10  # Default: 10
```

#### Adaptive Recommendations

```bash
# Use preferences in recommendations
RECOMMENDATION_USE_PREFERENCES=1  # Default: 1 (enabled)

# Confidence boost for preferred options
RECOMMENDATION_CONFIDENCE_BOOST=0.15  # Default: 0.15 (+15%)

# Weight of historical choices
RECOMMENDATION_HISTORY_WEIGHT=0.3  # Default: 0.3 (30%)

# Minimum confidence to recommend
RECOMMENDATION_MIN_CONFIDENCE=0.4  # Default: 0.4

# Enable A/B testing
RECOMMENDATION_AB_TESTING=0  # Default: 0 (disabled)

# Maximum recommendation history
RECOMMENDATION_MAX_HISTORY=1000  # Default: 1000
```

### Configuration Examples

#### Development Setup (Permissive)

```bash
# .env.development
AUTONOMOUS_ENABLE_COLLABORATION=1
AUTONOMOUS_APPROVAL_REQUIRED=critical  # Only critical ops need approval
AUTONOMOUS_FEEDBACK_LEARNING=1
PREFERENCE_MIN_SAMPLES=3  # Lower threshold for faster learning
RECOMMENDATION_USE_PREFERENCES=1
```

#### Production Setup (Strict)

```bash
# .env.production
AUTONOMOUS_ENABLE_COLLABORATION=1
AUTONOMOUS_APPROVAL_REQUIRED=medium  # Most ops need approval
AUTONOMOUS_APPROVAL_TIMEOUT_MS=600000  # 10 minute timeout
AUTONOMOUS_FEEDBACK_LEARNING=1
AUTONOMOUS_REQUIRE_FEEDBACK_RATING=1  # Require ratings
PREFERENCE_MIN_SAMPLES=10  # Higher threshold for reliability
PREFERENCE_CONFIDENCE_THRESHOLD=0.75  # Higher confidence required
RECOMMENDATION_MIN_CONFIDENCE=0.6  # Higher bar for recommendations
```

#### Testing Setup (Disabled)

```bash
# .env.test
AUTONOMOUS_ENABLE_COLLABORATION=0  # Disable for unit tests
AUTONOMOUS_FEEDBACK_LEARNING=0
```

---

## Usage Guide

### Basic Workflow

1. **Enable Collaborative Intelligence**:
   ```bash
   AUTONOMOUS_ENABLE_COLLABORATION=1
   ```

2. **Configure Risk Thresholds**:
   ```bash
   AUTONOMOUS_APPROVAL_REQUIRED=high
   ```

3. **Autonomous agent makes a decision**:
   - Risk assessment evaluates operation
   - If risk ≥ threshold, approval requested

4. **User receives approval request**:
   - Review operation details
   - See reasoning and alternatives
   - Approve, reject, or modify

5. **User provides feedback** (optional):
   - Rate the decision (1-5)
   - Explain reasoning
   - Suggest improvements

6. **System learns from feedback**:
   - Patterns detected automatically
   - Preferences updated
   - Future recommendations adjusted

### Advanced Usage

#### Custom Risk Assessment

```javascript
import { assessRisk } from './server.risk-assessment.mjs';

const assessment = assessRisk({
  operation: 'deploy_to_production',
  context: {
    environment: 'production',
    hasTests: true,
    testCoverage: 0.85,
  },
});

console.log(`Risk level: ${assessment.level}`); // 'critical'
console.log(`Score: ${assessment.score}`); // 0.95
console.log(`Requires approval: ${assessment.requiresApproval}`); // true
```

#### A/B Testing Recommendations

```javascript
import { createABTest, getABTestVariant } from './server.adaptive-recommendations.mjs';

// Enable A/B testing
process.env.RECOMMENDATION_AB_TESTING = '1';

// Create test
createABTest(
  'preference-vs-history',
  { strategy: 'preference-heavy', preferenceWeight: 0.6, historyWeight: 0.2 },
  { strategy: 'history-heavy', preferenceWeight: 0.2, historyWeight: 0.6 }
);

// Assign variant to user
const variant = getABTestVariant('preference-vs-history', 'user-123');
console.log(`User assigned to variant: ${variant}`); // 'A' or 'B'
```

---

## API Reference

### Approval System

#### `requestApproval(operation, context, options)`

Request user approval for an operation.

**Parameters**:
- `operation` (string): Operation name (e.g., 'git_commit')
- `context` (object): Request context
  - `task` (string): Task description
  - `reasoning` (string): Agent's reasoning
  - `impact` (string): Risk level (low/medium/high/critical)
  - `alternatives` (string[]): Alternative approaches
- `options` (object): Optional parameters
  - `timeoutMs` (number): Timeout in milliseconds
  - `convId` (string): Conversation ID
  - `traceId` (string): Trace ID

**Returns**: Promise<ApprovalResponse>
- `requestId` (string): Request ID
- `decision` (string): 'approve', 'reject', or 'modify'
- `feedback` (string): User feedback
- `modifications` (object): Modifications (if decision='modify')
- `timestamp` (string): Response timestamp

#### `getPendingApprovals(options)`

Get all pending approval requests.

**Returns**: ApprovalRequest[]

### Feedback Collection

#### `submitFeedback(category, data)`

Submit user feedback.

**Parameters**:
- `category` (string): Feedback category
- `data` (object): Feedback data
  - `rating` (number): 1-5 rating
  - `reasoning` (string): User's reasoning
  - `suggestion` (string): Improvement suggestion
  - `tags` (string[]): Tags
  - `context` (object): Associated context

**Returns**: Object with `success` and `feedbackId`

### Preference Analysis

#### `buildPreferenceProfile(userId, options)`

Build or update user preference profile.

**Returns**: UserPreferenceProfile
- `userId` (string)
- `patterns` (PreferencePattern[]): Detected patterns
- `preferences` (object): Specific preferences
- `statistics` (object): Usage statistics
- `lastUpdated` (string): Last update timestamp

### Adaptive Recommendations

#### `generateRecommendations(category, options, context)`

Generate personalized recommendations.

**Returns**: RecommendationResult
- `id` (string): Recommendation session ID
- `options` (ScoredRecommendation[]): Scored options
- `topRecommendation` (string): Top option ID
- `confidence` (number): Overall confidence
- `reasonings` (string[]): Reasoning summary

---

## Event Schemas

All collaboration events are logged to ContextLog with standardized schemas.

### Approval Request Event

```json
{
  "id": "01HK...",
  "ts": "2025-11-21T...",
  "actor": "autonomous",
  "act": "approval_request",
  "conv_id": "conversation-id",
  "trace_id": "trace-id",
  "request_id": "approval-request-id",
  "operation": "git_commit",
  "risk_level": "high",
  "reasoning": "Committing changes to main branch",
  "task": "Commit feature implementation",
  "alternatives_count": 2
}
```

### Feedback Submitted Event

```json
{
  "id": "01HK...",
  "ts": "2025-11-21T...",
  "actor": "user",
  "act": "feedback_submitted",
  "conv_id": "conversation-id",
  "feedback_id": "feedback-id",
  "feedback_category": "decision",
  "rating": 5,
  "has_reasoning": true,
  "has_suggestion": false,
  "tags": ["refactoring", "code_quality"]
}
```

### Recommendation Generated Event

```json
{
  "id": "01HK...",
  "ts": "2025-11-21T...",
  "actor": "autonomous",
  "act": "recommendation_generated",
  "conv_id": "conversation-id",
  "recommendation_id": "recommendation-id",
  "category": "decision_preference",
  "user_id": "user-123",
  "options_count": 3,
  "top_recommendation": "option-2",
  "confidence": 0.78,
  "adjustments": {
    "preference": 0.12,
    "history": 0.08,
    "risk": 0.05
  }
}
```

---

## Analytics & Monitoring

### User Analytics

```javascript
import { getCollaborationAnalytics } from './server.collaboration-events.mjs';

const analytics = getCollaborationAnalytics('user-123', { days: 30 });

console.log('Approval Stats:', analytics.approvals);
// {
//   total: 45,
//   approved: 38,
//   rejected: 5,
//   modified: 2,
//   timeout: 0,
//   avgResponseTimeMs: 42000
// }

console.log('Feedback Stats:', analytics.feedback);
// {
//   total: 52,
//   avgRating: 4.3,
//   withReasoning: 35,
//   withSuggestions: 18
// }

console.log('Recommendation Accuracy:', analytics.recommendations.accuracy);
// 0.82 (82% of recommendations were chosen)
```

### System Statistics

```javascript
import { getCollaborationStats } from './server.collaboration-events.mjs';

const stats = getCollaborationStats({ days: 7 });

console.log('Total Events:', stats.totalEvents);
console.log('Unique Users:', stats.uniqueUsers);
console.log('Event Distribution:', stats.eventTypes);
```

### Recommendation Accuracy

```javascript
import { getRecommendationAccuracy } from './server.adaptive-recommendations.mjs';

const accuracy = getRecommendationAccuracy({
  userId: 'user-123',
  category: 'decision_preference',
  limitDays: 30,
});

console.log(`Accuracy: ${accuracy.accuracyPercent}%`);
console.log(`Sample Size: ${accuracy.total}`);
```

---

## Troubleshooting

### Approval Requests Not Appearing

**Symptoms**: Approval requests are not created for high-risk operations

**Possible Causes**:
1. Collaboration disabled: Check `AUTONOMOUS_ENABLE_COLLABORATION=1`
2. Risk threshold too high: Lower `AUTONOMOUS_APPROVAL_REQUIRED`
3. Risk assessment not detecting risk: Review operation context

**Solution**:
```bash
# Enable collaboration
AUTONOMOUS_ENABLE_COLLABORATION=1

# Lower approval threshold
AUTONOMOUS_APPROVAL_REQUIRED=medium

# Check risk assessment
import { assessRisk } from './server.risk-assessment.mjs';
const assessment = assessRisk({ operation: 'your_operation', context: {...} });
console.log(assessment);
```

### Preferences Not Learning

**Symptoms**: User preferences are not being detected

**Possible Causes**:
1. Not enough feedback samples
2. Confidence threshold too high
3. Feedback learning disabled

**Solution**:
```bash
# Lower sample requirement
PREFERENCE_MIN_SAMPLES=3

# Lower confidence threshold
PREFERENCE_CONFIDENCE_THRESHOLD=0.5

# Enable learning
AUTONOMOUS_FEEDBACK_LEARNING=1

# Force rebuild profile
import { buildPreferenceProfile } from './server.preference-analysis.mjs';
const profile = buildPreferenceProfile('user-123', { force: true });
console.log(profile.patterns);
```

### Recommendations Not Personalized

**Symptoms**: Recommendations don't reflect user preferences

**Possible Causes**:
1. Preferences not built yet
2. No matching patterns for category
3. Preference use disabled

**Solution**:
```bash
# Enable preference use
RECOMMENDATION_USE_PREFERENCES=1

# Check profile
import { getPreferenceProfile } from './server.preference-analysis.mjs';
const profile = getPreferenceProfile('user-123');
console.log('Patterns:', profile.patterns);

# Increase confidence boost
RECOMMENDATION_CONFIDENCE_BOOST=0.25
```

---

## Examples

### Example 1: Complete Approval Flow

```javascript
// 1. Agent detects operation
const operation = 'deploy_to_production';

// 2. Assess risk
import { assessRisk } from './server.risk-assessment.mjs';
const risk = assessRisk({
  operation,
  context: { environment: 'production' },
});

// 3. Request approval if needed
if (risk.requiresApproval) {
  import { requestApproval } from './server.approval.mjs';

  const response = await requestApproval(operation, {
    task: 'Deploy version 2.0.0 to production',
    reasoning: 'User requested deployment',
    impact: risk.level,
    alternatives: ['Deploy to staging first', 'Schedule deployment'],
  }, {
    convId: 'conv-123',
  });

  if (response.decision === 'approve') {
    // Execute deployment
    console.log('Deployment approved');
  } else {
    console.log('Deployment rejected:', response.feedback);
  }
}

// 4. User provides feedback
import { submitFeedback } from './server.feedback.mjs';
submitFeedback('approval', {
  rating: 5,
  reasoning: 'Smooth approval process',
  context: { approvalId: response.requestId },
});
```

### Example 2: Learning from User Patterns

```javascript
// Simulate user making 5 similar decisions
import { submitFeedback } from './server.feedback.mjs';

for (let i = 0; i < 5; i++) {
  submitFeedback('decision', {
    rating: 5,
    tags: ['refactoring', 'code_quality'],
    context: { decisionId: `decision-${i}` },
  });
}

// Build preference profile
import { buildPreferenceProfile, getPatternsByCategory } from './server.preference-analysis.mjs';
const profile = buildPreferenceProfile('user-123');

// Check detected patterns
const patterns = getPatternsByCategory('decision_preference', 'user-123');
console.log('Detected patterns:', patterns);
// Output: User prefers refactoring decisions

// Generate recommendations using learned preferences
import { generateRecommendations } from './server.adaptive-recommendations.mjs';

const options = [
  { id: 'refactor', label: 'Refactor', tags: ['refactoring'], baseScore: 0.6 },
  { id: 'quick-fix', label: 'Quick Fix', tags: ['quick'], baseScore: 0.7 },
];

const result = generateRecommendations('decision_preference', options, {
  userId: 'user-123',
});

console.log('Top recommendation:', result.topRecommendation);
// Output: 'refactor' (boosted by user preference)
```

---

## Summary

The Collaborative Intelligence system provides a comprehensive framework for human-AI collaboration:

- **T301-T303**: Approval workflows with risk assessment
- **T304-T306**: Decision checkpoints and confidence calibration
- **T307**: Feedback collection and storage
- **T308**: User preference pattern analysis
- **T309**: Adaptive recommendation system
- **T310**: ContextLog integration for analytics

All components are fully tested, documented, and production-ready.

For additional support, see:
- [ADR-0003: Collaborative Intelligence](../adr/adr-0003-collaborative-intelligence.md)
- [Autonomous Agent Documentation](./phases/)
- [ContextLog Documentation](../contextlog/)
