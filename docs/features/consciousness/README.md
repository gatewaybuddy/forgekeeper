# Consciousness System Quick Start Guide

**5-Minute Setup** | **Zero Configuration Required** | **Autonomous by Default**

---

## Prerequisites

```bash
# Node.js 18+
node --version

# Forgekeeper installed
npm --prefix forgekeeper/frontend install
```

---

## 1. Basic Setup (30 seconds)

### Environment Variables (Optional)

Copy and customize:

```bash
# Add to your .env file
CONSCIOUSNESS_ENABLED=1
CONSCIOUSNESS_CYCLE_INTERVAL=30000  # 30 seconds

# API for deep reasoning (optional - has fallbacks)
CONSCIOUSNESS_DEEP_PROVIDER=anthropic
CONSCIOUSNESS_DEEP_API_KEY=sk-ant-your-key-here
```

**Note**: System works without API keys using local-only mode.

---

## 2. Start the System (10 seconds)

### Option A: Programmatic

```javascript
import { createConsciousnessOrchestrator } from './frontend/core/consciousness/consciousness-orchestrator.mjs'

// Create and start
const consciousness = await createConsciousnessOrchestrator()
await consciousness.start()

console.log('Consciousness active!')
```

### Option B: Server Integration

```javascript
// In your server.mjs
import { createConsciousnessOrchestrator } from './core/consciousness/consciousness-orchestrator.mjs'

const consciousness = await createConsciousnessOrchestrator()

// Add to GraphQL context
const context = {
  ...consciousness.getGraphQLContext()
}

// Start autonomous operation
await consciousness.start()
```

---

## 3. Verify It's Working (30 seconds)

### Watch the Logs

```bash
[ConsciousnessOrchestrator] Initialized successfully
[ConsciousnessEngine] Starting autonomous consciousness...
[ConsciousnessEngine] === Cycle 1 ===
[ConsciousnessEngine] Generated thought (contextLog): "Review recent context..."
[ConsciousnessEngine] Processed via rote tier (245ms)
[ConsciousnessEngine] Memory updated
[ConsciousnessEngine] Cycle 1 complete: 312ms (success)
```

### Query State (GraphQL)

```graphql
query {
  consciousnessState {
    state
    currentCycle
  }
}
```

Result:
```json
{
  "state": "thinking",
  "currentCycle": 1
}
```

---

## 4. Monitor in Real-Time (2 minutes)

### React Component

```tsx
import { ConsciousnessMonitor } from './components/ConsciousnessMonitor'

function App() {
  return <ConsciousnessMonitor />
}
```

### GraphQL Subscription

```graphql
subscription {
  cycleComplete {
    cycle
    duration
    success
  }
}
```

---

## 5. Common Operations

### Pause/Resume

```javascript
await consciousness.stop()
await consciousness.start()
```

### Get Statistics

```javascript
const stats = await consciousness.getStats()
console.log(stats.consciousness.successRate)
```

### Trigger Dream Manually

```graphql
mutation {
  triggerDream {
    memoriesConsolidated
  }
}
```

### Create a Goal

```graphql
mutation {
  createGoal(input: {
    title: "Improve response quality"
    type: IMPROVEMENT
    priority: HIGH
  }) {
    id
    title
  }
}
```

---

## What Happens Automatically

### Every 30 Seconds (Configurable)
- Generates autonomous thought
- Processes via two-tier inference
- Updates short-term memory
- Checks if dream needed
- Self-tunes parameters

### Every 10 Cycles
- Creates git save point
- Persists state to disk

### Every 24 Hours
- Triggers dream cycle
- Consolidates memories to LTM
- Detects biases
- Generates creative insights

### Every 7 Days
- Challenges all values
- Reviews bias patterns

---

## Troubleshooting

### "No thoughts generating"
✅ Check `CONSCIOUSNESS_ENABLED=1` in `.env`

### "API budget errors"
✅ System automatically falls back to local tier - no action needed

### "Dreams not triggering"
✅ Normal - requires 5+ cycles or memory pressure

### "High CPU usage"
✅ Reduce cycle frequency: `CONSCIOUSNESS_CYCLE_INTERVAL=60000`

---

## Advanced Configuration

### Adjust Cycle Timing

```env
CONSCIOUSNESS_CYCLE_INTERVAL=45000  # 45 seconds
CONSCIOUSNESS_CYCLE_MIN=15000       # Min 15s
CONSCIOUSNESS_CYCLE_MAX=300000      # Max 5min
```

### Memory Settings

```env
CONSCIOUSNESS_STM_SLOTS=5                    # Short-term slots
CONSCIOUSNESS_CONSOLIDATION_THRESHOLD=0.6    # LTM promotion threshold
```

### Dream Configuration

```env
CONSCIOUSNESS_DREAM_INTERVAL=12              # Every 12 hours
CONSCIOUSNESS_DREAM_MEMORY_PRESSURE=0.7      # Trigger at 70% STM capacity
```

### Value & Bias Protection

```env
CONSCIOUSNESS_MIN_INCIDENTS_FOR_VALUE=3      # Faster value formation
CONSCIOUSNESS_VALUE_CHALLENGE_INTERVAL=3     # Challenge every 3 days
```

---

## Useful Queries

### Get Active Goals

```graphql
query {
  goals(state: ACTIVE) {
    title
    progress
  }
}
```

### Get Detected Patterns

```graphql
query {
  patterns(minConfidence: 0.7) {
    type
    description
  }
}
```

### Get Learning Insights

```graphql
query {
  insights {
    type
    message
  }
}
```

### Get Recent Dreams

```graphql
query {
  dreamHistory(limit: 5) {
    timestamp
    memoriesConsolidated
    insightsGenerated
  }
}
```

---

## File Locations

### State Files (Auto-created)
```
.forgekeeper/
├── consciousness/
│   ├── state.json           # Current state
│   ├── goals.json           # Goal tracking
│   ├── learning.json        # Outcome learning
│   └── memory/              # Long-term memory
├── values.jsonl             # Value tracking
└── context_log/             # Event logs
```

### Git Save Points
```
.git/
└── refs/
    └── tags/
        ├── consciousness-cycle-50
        ├── consciousness-cycle-100
        └── ...
```

---

## Next Steps

1. ✅ **Monitor**: Open ConsciousnessMonitor UI
2. ✅ **Set Goals**: Create your first goal via GraphQL
3. ✅ **Review Patterns**: Check detected patterns
4. ✅ **Subscribe**: Watch real-time cycle events
5. ✅ **Customize**: Adjust settings to your needs

---

## Help

### Documentation
- `CONSCIOUSNESS_SYSTEM_COMPLETE.md` - Full system overview
- `SPRINT_1_COMPLETE.md` - Foundation details
- `SPRINT_2_COMPLETE.md` - Core consciousness
- GraphQL schema - Query available operations

### Logs
```bash
# Watch consciousness logs
tail -f logs/consciousness.log

# Check recent events
cat .forgekeeper/context_log/ctx-*.jsonl | tail -20
```

---

**You're Ready!** The system is now running autonomously. 🎉

