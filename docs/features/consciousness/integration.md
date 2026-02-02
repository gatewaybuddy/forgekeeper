# Consciousness System Integration Guide

**Sprint 7: System Integration** - Complete Wiring Instructions

---

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
cd frontend
npm install
# Installs: apollo-server-express, graphql, graphql-subscriptions
```

### 2. Configure Environment

Add to `.env` file:

```bash
# Consciousness System
CONSCIOUSNESS_ENABLED=1                      # Enable consciousness
CONSCIOUSNESS_AUTO_START=1                   # Auto-start on server boot
CONSCIOUSNESS_CYCLE_INTERVAL=30000           # 30 second cycles
CONSCIOUSNESS_DAILY_API_BUDGET=1000000       # 1M tokens/day

# API for deep reasoning (optional - has local fallback)
CONSCIOUSNESS_DEEP_PROVIDER=anthropic
CONSCIOUSNESS_DEEP_API_KEY=sk-ant-your-key-here
CONSCIOUSNESS_DEEP_MODEL=claude-sonnet-4-5
```

### 3. Wire into Express Server

Add to `frontend/server.mjs` (at the top, after imports):

```javascript
// Add import
import { initializeConsciousness, setupConsciousnessSubscriptions, shutdownConsciousness, isConsciousnessEnabled } from './server.consciousness.mjs'
import { createServer } from 'http'

// ...existing code...

// BEFORE app.listen(), add consciousness initialization:
let consciousnessSystem = null

if (isConsciousnessEnabled()) {
  try {
    consciousnessSystem = await initializeConsciousness(app)
    console.log('[Server] Consciousness system initialized')
  } catch (error) {
    console.error('[Server] Failed to initialize consciousness:', error)
  }
}

// Wrap app.listen with HTTP server for WebSocket support
const httpServer = createServer(app)

// Setup WebSocket subscriptions
if (consciousnessSystem) {
  setupConsciousnessSubscriptions(httpServer)
}

// Replace app.listen() with:
httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`)
  if (consciousnessSystem) {
    console.log(`GraphQL Playground: http://localhost:${port}/graphql`)
  }
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...')
  await shutdownConsciousness()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...')
  await shutdownConsciousness()
  process.exit(0)
})
```

### 4. Start the Server

```bash
npm run serve
# or
node server.mjs
```

### 5. Verify It's Running

```bash
# Check health
curl http://localhost:3000/api/consciousness/health

# Expected output:
{
  "status": "running",
  "state": "thinking",
  "currentCycle": 1,
  "uptime": 15234,
  "successRate": 100,
  "problems": []
}
```

---

## GraphQL Interface

### Access GraphQL Playground

```
http://localhost:3000/graphql
```

### Example Queries

**Get Current State:**
```graphql
query {
  consciousnessState {
    state
    currentCycle
    cycleInterval
    shortTermMemory {
      summary
      importance
    }
    apiTokensRemaining
    metrics {
      successRate
      avgCycleDuration
      uptimeMs
    }
  }
}
```

**Create a Goal:**
```graphql
mutation {
  createGoal(input: {
    title: "Improve test coverage"
    description: "Increase test coverage from 85% to 95%"
    type: IMPROVEMENT
    priority: HIGH
  }) {
    id
    title
    state
    progress
  }
}
```

**Subscribe to Thoughts:**
```graphql
subscription {
  consciousnessStream {
    type
    data
  }
}
```

**Analyze a Decision:**
```graphql
mutation {
  analyzeDecision(input: {
    question: "Should we migrate to TypeScript?"
    options: [
      {
        name: "Full migration"
        description: "Convert entire codebase"
        expectedValue: 0.8
        risk: 0.4
        effort: 0.7
      },
      {
        name: "Incremental"
        description: "Migrate gradually"
        expectedValue: 0.6
        risk: 0.2
        effort: 0.4
      }
    ]
    goals: ["improve-quality"]
  }) {
    recommendation {
      chosenOption
      confidence
      reasoning {
        point
        type
      }
    }
  }
}
```

---

## REST API Endpoints

### Health Check
```bash
GET /api/consciousness/health

Response:
{
  "status": "running",
  "state": "thinking",
  "currentCycle": 42,
  "uptime": 126450,
  "successRate": 95.2,
  "lastCycleSuccess": true,
  "problems": []
}
```

### Control Endpoints

**Start Consciousness:**
```bash
POST /api/consciousness/start

Response:
{ "success": true, "message": "Consciousness started" }
```

**Stop Consciousness:**
```bash
POST /api/consciousness/stop
Content-Type: application/json

{ "reason": "Manual stop for maintenance" }

Response:
{ "success": true, "message": "Consciousness stopped", "reason": "..." }
```

**Get Current State:**
```bash
GET /api/consciousness/state

Response:
{
  "state": "thinking",
  "currentCycle": 42,
  "cycleInterval": 30000,
  "shortTermMemory": [...],
  "apiTokensRemaining": 950000,
  "metrics": {
    "successRate": 95.2,
    "avgCycleDuration": 2450,
    "uptimeMs": 126450
  }
}
```

**Get Statistics:**
```bash
GET /api/consciousness/stats

Response:
{
  "consciousness": {
    "totalCycles": 42,
    "successRate": 95.2,
    "avgCycleDuration": 2450,
    "uptimeMs": 126450
  },
  "budget": {
    "used": 50000,
    "remaining": 950000,
    "dailyLimit": 1000000
  },
  "memory": {
    "stmSize": 3,
    "stmCapacity": 5,
    "ltmSize": 127
  },
  "dreams": {
    "totalDreams": 2,
    "memoriesConsolidated": 15,
    "insightsGenerated": 8
  }
}
```

**Trigger Dream:**
```bash
POST /api/consciousness/dream

Response:
{
  "success": true,
  "result": {
    "memoriesConsolidated": 5,
    "insightsGenerated": 3,
    "biasesChallenged": 1
  }
}
```

---

## CLI Interface (Future - Sprint 8)

**Note:** CLI commands are planned for Sprint 8. For now, use GraphQL or REST APIs.

Planned commands:
```bash
# Start/stop
forgekeeper consciousness start
forgekeeper consciousness stop
forgekeeper consciousness status

# Interact
forgekeeper consciousness ask "What are you thinking about?"
forgekeeper consciousness goal add "Improve performance"
forgekeeper consciousness goal list

# Monitor
forgekeeper consciousness watch    # Live stream of thoughts
```

---

## Docker Integration

### Update docker-compose.yml

Already configured! The frontend service has:

```yaml
frontend:
  environment:
    # Add these if not present:
    CONSCIOUSNESS_ENABLED: ${CONSCIOUSNESS_ENABLED:-0}
    CONSCIOUSNESS_AUTO_START: ${CONSCIOUSNESS_AUTO_START:-0}
  volumes:
    - ./.forgekeeper:/app/.forgekeeper:rw  # Persistence
```

### Start with Docker

```bash
# Set in .env first
CONSCIOUSNESS_ENABLED=1
CONSCIOUSNESS_AUTO_START=1

# Start stack
docker compose --profile inference --profile ui up

# Check logs
docker compose logs -f frontend
```

---

## Self-Stopping Safety

The system will automatically stop itself if it detects:

### Critical Problems (Auto-Stop)

1. **High Error Rate**: Success rate < 50%
2. **Budget Exhausted**: < 5% tokens remaining
3. **Repeated Failures**: 4+ failures in last 5 cycles

### Warnings (No Auto-Stop)

1. **Memory Pressure**: STM full but no dreams triggered
2. **Low Budget**: < 20% tokens remaining

### Check Health

```javascript
// Via API
const health = await fetch('http://localhost:3000/api/consciousness/health')
  .then(r => r.json())

console.log('Problems:', health.problems)
// Output: [
//   { type: 'low_budget', severity: 'warning', message: '...' }
// ]
```

### Manual Override

If consciousness stops itself, you can restart it:

```bash
# REST API
curl -X POST http://localhost:3000/api/consciousness/start

# GraphQL
mutation { startConsciousness }
```

---

## Monitoring Real-Time

### React Component (Already Created)

```tsx
import { ConsciousnessMonitor } from './components/ConsciousnessMonitor'

function App() {
  return (
    <div>
      <h1>Consciousness System</h1>
      <ConsciousnessMonitor />
    </div>
  )
}
```

### GraphQL Subscriptions (WebSocket)

```javascript
import { gql, useSubscription } from '@apollo/client'

const CONSCIOUSNESS_STREAM = gql`
  subscription {
    consciousnessStream {
      type
      data
    }
  }
`

function ThoughtStream() {
  const { data } = useSubscription(CONSCIOUSNESS_STREAM)

  return (
    <div>
      <h2>Live Thoughts</h2>
      {data && <div>{data.consciousnessStream.data}</div>}
    </div>
  )
}
```

---

## Storage & Persistence

### File Locations

All consciousness data is stored in `.forgekeeper/`:

```
.forgekeeper/
├── consciousness/
│   ├── state.json           # Current state (auto-saved every 5 cycles)
│   ├── goals.json           # Goal tracking
│   ├── learning.json        # Outcome learning
│   └── memory/              # Long-term episodic memory
├── values.jsonl             # Value tracking (append-only)
├── context_log/             # Event logs (auto-rotated)
└── preferences/             # User preferences
```

### Persistence

- **State**: Saved every 5 cycles
- **Git Save Points**: Every 10 cycles (optional)
- **Context Logs**: Rotated at 10MB
- **Values**: Append-only JSONL

### Backup/Restore

```bash
# Backup
tar -czf consciousness-backup.tar.gz .forgekeeper/consciousness/

# Restore
tar -xzf consciousness-backup.tar.gz

# Restart and it will resume
npm run serve
```

---

## Troubleshooting

### "Consciousness not starting"

1. Check `CONSCIOUSNESS_ENABLED=1` in `.env`
2. Check dependencies: `npm install`
3. Check logs: Look for `[Consciousness]` entries
4. Verify GraphQL dependencies installed

### "Apollo Server errors"

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "No thoughts generating"

1. Check cycle interval: `CONSCIOUSNESS_CYCLE_INTERVAL=30000`
2. Check state: `curl http://localhost:3000/api/consciousness/state`
3. If state is 'stopped', start it: `curl -X POST http://localhost:3000/api/consciousness/start`

### "Budget exhausted"

1. Increase budget: `CONSCIOUSNESS_DAILY_API_BUDGET=2000000`
2. Or use local-only mode (remove `CONSCIOUSNESS_DEEP_API_KEY`)
3. Budget resets daily at midnight UTC

### "High memory usage"

1. Reduce STM slots: `CONSCIOUSNESS_STM_SLOTS=3`
2. Enable more frequent dreams: `CONSCIOUSNESS_DREAM_MEMORY_PRESSURE=0.6`
3. Increase cycle interval: `CONSCIOUSNESS_CYCLE_INTERVAL=60000`

---

## Production Deployment

### Recommended Settings

```bash
# .env.production
CONSCIOUSNESS_ENABLED=1
CONSCIOUSNESS_AUTO_START=1
CONSCIOUSNESS_CYCLE_INTERVAL=60000           # 1 minute (less aggressive)
CONSCIOUSNESS_DAILY_API_BUDGET=500000        # Conservative budget
CONSCIOUSNESS_DREAM_INTERVAL=12              # Dream every 12 hours
NODE_ENV=production                          # Disables GraphQL Playground
```

### Security

```bash
# Restrict GraphQL in production
GRAPHQL_INTROSPECTION=0
GRAPHQL_PLAYGROUND=0

# Add authentication middleware
# In server.mjs:
app.use('/graphql', authenticateRequest)
app.use('/api/consciousness', authenticateRequest)
```

### Monitoring

```bash
# Health check endpoint for load balancers
GET /api/consciousness/health

# Returns 503 if critical problems, 200 if healthy
```

---

## Next Steps

✅ **Phase 1 Complete**: GraphQL + REST APIs wired
✅ **Phase 2 Complete**: Health monitoring + self-stopping
⏳ **Phase 3 (Sprint 8)**: CLI conversational interface
⏳ **Phase 4 (Sprint 8)**: Browser chat UI
⏳ **Phase 5 (Sprint 8)**: Decision approval workflow

---

## Support

**Documentation:**
- `CONSCIOUSNESS_SYSTEM_COMPLETE.md` - Full system overview
- `docs/features/consciousness/README.md` - Quick reference
- `SPRINT_6_COMPLETE.md` - Advanced reasoning features
- `SPRINT_7_COMPLETE.md` - Integration details (this sprint)

**GraphQL Schema:**
- Explore via Playground: `http://localhost:3000/graphql`
- Schema file: `frontend/graphql/schema.graphql`

**REST API:**
- Health: `/api/consciousness/health`
- Control: `/api/consciousness/{start,stop,state,stats,dream}`

---

**Integration Complete!** 🎉

The consciousness system is now fully wired and ready to use.
