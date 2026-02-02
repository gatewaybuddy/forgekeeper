# Conversation Space - Multi-Agent Collaboration System

## Overview

The **Conversation Space** is Forgekeeper's next-generation multi-agent system that replaces the sequential Thought World with a natural, asynchronous conversation platform. Instead of forced round-robin turns, agents continuously monitor conversations and contribute based on relevance thresholds, creating organic collaboration patterns.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Agents](#agents)
4. [Getting Started](#getting-started)
5. [Usage Guide](#usage-guide)
6. [API Reference](#api-reference)
7. [Configuration](#configuration)
8. [Development](#development)
9. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### Natural Conversation Flow

Unlike traditional agent systems that use fixed turn-taking, Conversation Space agents:
- **Continuously listen** to all messages via event bus
- **Assess relevance** using keyword matching, context analysis, and @mentions
- **Contribute when threshold crossed** (each agent has different sensitivity)
- **Stream responses** in real-time via Server-Sent Events (SSE)

### Threshold-Based Contribution

Each agent has a **contribution threshold** (0.0-1.0):

```javascript
forge:  0.65  // Relatively willing to contribute
scout:  0.55  // Lower threshold = more interruptive (guardian role)
loom:   0.70  // More selective
anvil:  0.75  // Most selective (synthesis agent)
```

When a message is posted:
1. All agents calculate relevance score (0.0-1.0)
2. If score ≥ threshold → agent contributes
3. If score > 0.5 but < threshold → agent adds "tracking" reaction
4. If score > 0.3 → agent shows "thinking" indicator

### Persistent Context

Agents maintain **persistent context summaries** to prevent context window exhaustion:

```
.forgekeeper/conversation_spaces/agent_context/forge.json
```

Contains:
- Compressed narrative of conversation
- Key decisions
- Open questions
- Agent's previous contributions

Updates triggered by:
- 2+ hours since last update
- 15+ unread messages
- Key decision detected
- Agent about to contribute

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│ Browser (React UI at /conversation)                     │
│ - MessageFeed (SSE real-time updates)                   │
│ - MessageComposer (user input + metadata)               │
│ - AgentPresenceBar (agent status)                       │
└────────────────┬────────────────────────────────────────┘
                 │
      ┌──────────▼─────────────────┐
      │ Express Server (port 3000) │
      │ POST /api/conversation-... │
      │ GET  /api/conversation-... │
      │ SSE  /api/conversation-... │
      └──────────┬─────────────────┘
                 │
   ┌─────────────┼─────────────┐
   │             │             │
┌──▼──────┐ ┌───▼────┐ ┌──────▼─────┐
│ Message │ │Message │ │  Context   │
│ Store   │ │  Bus   │ │  Manager   │
│ (JSONL) │ │(Events)│ │(Summaries) │
└──┬──────┘ └───┬────┘ └──────┬─────┘
   │             │             │
   └─────────────┼─────────────┘
                 │
      ┌──────────▼──────────────┐
      │   Agent Monitors        │
      │ ┌────┬────┬─────┬─────┐│
      │ │Frg │Sct │Loom │Anvl ││
      │ └────┴────┴─────┴─────┘│
      └─────────────────────────┘
```

### Data Flow

1. **User posts** → POST `/api/conversation-space/channels/general/messages`
2. **Message stored** → Append to `general.jsonl` (atomic write)
3. **Event broadcast** → `MessageBus.emit('message_created')`
4. **Agents wake** → All 4 agents receive event simultaneously
5. **Relevance assessment** → Each calculates score independently
6. **Contribution decision** → If score ≥ threshold, agent generates response
7. **LLM streaming** → Response chunks broadcast via SSE
8. **UI update** → Browser receives chunks, updates in real-time

### Storage

**Messages**: `.forgekeeper/conversation_spaces/channels/{channelId}.jsonl`

```jsonl
{"id":"msg-01HQZT8J5K2M","channel_id":"general","author_type":"human","author_id":"rado","author_name":"Rado","author_avatar":"👤","content":"How should I structure this database?","created_at":"2025-12-13T10:30:00.000Z"}
{"id":"msg-01HQZT9K6L3N","channel_id":"general","author_type":"agent","author_id":"forge","author_name":"Forge","author_avatar":"🔨","content":"I recommend starting with a normalized schema...","created_at":"2025-12-13T10:30:02.500Z","agent_state":"complete","elapsed_ms":2450}
```

**Agent Context**: `.forgekeeper/conversation_spaces/agent_context/{agentId}.json`

```json
{
  "agent_id": "forge",
  "last_updated": "2025-12-13T10:30:00.000Z",
  "channels": {
    "general": {
      "summary": "Rado requested database schema advice. Discussed normalized vs denormalized approaches. Decision: Start with normalized schema for User, Post, Comment entities.",
      "key_decisions": [...],
      "my_previous_contributions": [...]
    }
  }
}
```

---

## Agents

### Forge (🔨 Executor)

**Role**: Provides concrete implementation guidance

**Threshold**: 0.65
**Keywords**: implement, build, code, execute, create, develop

**Behavior**:
- Suggests specific code implementations
- Provides step-by-step instructions
- Offers architectural patterns
- Shows code examples

**Example**: When user asks "How do I implement authentication?", Forge jumps in with JWT setup, middleware code, and security best practices.

---

### Scout (🔭 Guardian)

**Role**: Challenges assumptions and risks

**Threshold**: 0.55 (lower = more willing to interrupt)
**Keywords**: assumption, risk, challenge, verify

**Special Feature: Guardian Mode**

Detects patterns suggesting unexamined assumptions:

```javascript
unexamined_assumptions: /\b(obviously|clearly|of course|everyone knows)\b/
cooperative_masking:    /\b(sounds good|looks fine)\b.*\b(all|everyone)\b/
value_washing:          /\b(serves all|no tradeoffs|win-win)\b/
conflict_avoidance:     /\b(let's move on|doesn't matter|either way)\b/
```

**Example**: When Forge says "Obviously we should use MongoDB", Scout interjects: "What assumptions are we making about query patterns? Have we considered the consistency requirements?"

---

### Loom (🧵 Verifier)

**Role**: Reviews for correctness and quality

**Threshold**: 0.70
**Keywords**: verify, check, correct, accurate, review, validate

**Behavior**:
- Reviews code for bugs and edge cases
- Checks technical accuracy
- Validates logical consistency
- Ensures completeness

**Example**: After Forge suggests a database schema, Loom reviews: "Missing foreign key constraint on user_id. Consider adding indexes on commonly queried fields."

---

### Anvil (⚒️ Integrator)

**Role**: Synthesizes multi-agent discussions

**Threshold**: 0.75 (most selective)
**Keywords**: consensus, decide, synthesize, integrate, resolve

**Behavior**:
- Waits for multiple agents to contribute
- Identifies common ground
- Resolves conflicting suggestions
- Proposes integrated solutions

**Example**: After Forge, Scout, and Loom discuss database choices, Anvil synthesizes: "Based on the discussion, here's a balanced approach: Use PostgreSQL for normalized core data (addresses Scout's consistency concerns), with Redis caching (Forge's performance suggestion), and add comprehensive indexes (Loom's validation)."

---

## Getting Started

### Prerequisites

1. **LLM Backend Running** (one of):
   - llama.cpp on port 8001, OR
   - vLLM on port 8001, OR
   - External API (set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)

2. **Node Server**:
   ```bash
   cd frontend
   node server.mjs
   ```

3. **Frontend Dev Server** (optional, for development):
   ```bash
   cd frontend
   npm run dev
   ```

### Quick Start

1. **Open Conversation Space**:
   - Production: http://localhost:3000/conversation
   - Development: http://localhost:5173/conversation

2. **Post your first message**:
   ```
   Help me design a REST API for a blog platform
   ```

3. **Watch agents respond**:
   - Forge will likely propose endpoint structure
   - Scout might challenge authentication assumptions
   - Loom could review the design
   - Anvil will synthesize if multiple agents contribute

### Testing Without LLM

You can validate the infrastructure without LLM responses:

```bash
# Test message persistence
curl -X POST http://localhost:3000/api/conversation-space/channels/general/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'

# Check agent status
curl http://localhost:3000/api/conversation-space/status

# Test SSE connection
curl -N http://localhost:3000/api/conversation-space/stream/general
```

---

## Usage Guide

### Posting Messages

**Basic Message**:
```
What's the best way to handle API rate limiting?
```

**@Mention to Force Contribution**:
```
@forge can you show me a code example for JWT authentication?
```

This sets Forge's relevance score to 1.0, guaranteeing a response.

**With Assumption Transparency Metadata**:

Click "📋 Add Metadata" in the composer to add reasoning context:

- **Primary Optimization**: Performance
- **Assumed Constraints**: Must support 10k requests/sec
- **Tradeoffs Accepted**: Higher memory usage
- **Confidence**: Medium
- **Would Reconsider If**: Budget becomes an issue

This helps agents understand your decision-making context.

### Reading Messages

**Message States**:
- 💭 **Thinking**: Agent is assessing relevance (score > 0.3)
- ✍️ **Typing**: Agent is generating response (streaming)
- ✅ **Complete**: Agent finished (shows elapsed time)

**Viewing Metadata**:

Click "▶ Reasoning Transparency" to expand agent's decision context.

### Agent Presence Bar

Shows real-time agent status:
- **Online/Offline**: Whether agent is running
- **State**: Idle, Thinking, Contributing
- **Threshold**: Visual bar showing contribution threshold
- **Relevance**: Current relevance score (when thinking)

---

## API Reference

### POST /api/conversation-space/channels/:channelId/messages

Post a new message to a channel.

**Request**:
```json
{
  "content": "How should I structure this database?",
  "metadata": {
    "primary_optimization": "Query performance",
    "assumed_constraints": ["Read-heavy workload"],
    "confidence": "medium"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": {
    "id": "msg-01HQZT8J5K2M",
    "channel_id": "general",
    "author_type": "human",
    "content": "How should I structure this database?",
    "created_at": "2025-12-13T10:30:00.000Z"
  }
}
```

---

### GET /api/conversation-space/channels/:channelId/messages

Fetch recent messages from a channel.

**Query Parameters**:
- `limit`: Number of messages (default: 50)
- `since`: Message ID to fetch messages after

**Response**:
```json
{
  "success": true,
  "messages": [...],
  "count": 15
}
```

---

### GET /api/conversation-space/stream/:channelId (SSE)

Real-time event stream for a channel.

**Events**:

**message_created**:
```
event: message_created
data: {"channel_id":"general","message":{...}}
```

**agent_thinking**:
```
event: agent_thinking
data: {"agent_id":"forge","relevance_score":0.75}
```

**agent_contributing**:
```
event: agent_contributing
data: {"agent_id":"forge","message_id":"msg-..."}
```

**agent_chunk** (streaming content):
```
event: agent_chunk
data: {"agent_id":"forge","message_id":"msg-...","chunk":"text"}
```

**agent_complete**:
```
event: agent_complete
data: {"agent_id":"forge","message_id":"msg-...","elapsed_ms":2450}
```

---

### GET /api/conversation-space/status

Get overall system status.

**Response**:
```json
{
  "success": true,
  "status": "running",
  "agents": [
    {
      "id": "forge",
      "name": "Forge",
      "icon": "🔨",
      "role": "Executor",
      "running": true,
      "channels": ["general"],
      "threshold": 0.65,
      "state": "idle"
    }
  ],
  "channels": [...],
  "message_bus": {
    "listenerCount": 4,
    "totalEvents": 127
  }
}
```

---

## Configuration

### Agent Thresholds

Edit `frontend/server.agent-{name}.mjs`:

```javascript
contribution_threshold: 0.65  // 0.0-1.0
```

**Lower threshold** = more contributions = noisier but more helpful
**Higher threshold** = fewer contributions = quieter but more selective

### Domain Keywords

Edit agent file to change relevance keywords:

```javascript
domain_keywords: ['implement', 'build', 'code', 'execute', 'create']
```

### Guardian Mode Patterns (Scout)

Edit `frontend/server.agent-scout.mjs`:

```javascript
const triggers = {
  unexamined_assumptions: {
    pattern: /\b(obviously|clearly|of course)\b/,
    score: 0.75
  }
};
```

---

## Development

### File Structure

```
frontend/
├── server.conversation-space.mjs    # Main orchestrator
├── server.message-store.mjs         # JSONL persistence
├── server.message-bus.mjs           # EventEmitter pub/sub
├── server.agent-monitor.mjs         # Base agent class
├── server.agent-forge.mjs           # Forge specialization
├── server.agent-scout.mjs           # Scout with guardian mode
├── server.agent-loom.mjs            # Loom specialization
├── server.agent-anvil.mjs           # Anvil specialization
└── src/components/ConversationSpace/
    ├── ConversationSpace.tsx        # Main container
    ├── MessageFeed.tsx              # Real-time message display
    ├── MessageComposer.tsx          # User input
    ├── MessageBubble.tsx            # Individual message
    ├── AgentPresenceBar.tsx         # Agent status
    ├── types.ts                     # TypeScript definitions
    └── *.css                        # Styling
```

### Adding a New Agent

1. **Create agent file**: `frontend/server.agent-mynewagent.mjs`

```javascript
import { AgentMonitor } from './server.agent-monitor.mjs';

export class MyNewAgentMonitor extends AgentMonitor {
  constructor(channels) {
    super(
      'mynewagent',
      {
        name: 'MyNewAgent',
        icon: '🎯',
        color: '#ec4899',
        role: 'My Role',
        contribution_threshold: 0.60,
        domain_keywords: ['keyword1', 'keyword2']
      },
      channels
    );
  }

  buildPrompt(channelId, triggerMessage, recentMessages, summary) {
    return `You are MyNewAgent, specialized in...`;
  }
}
```

2. **Register in types.ts**:

```typescript
export type AgentId = 'forge' | 'scout' | 'loom' | 'anvil' | 'mynewagent';

export const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  // ... existing agents
  mynewagent: {
    id: 'mynewagent',
    name: 'MyNewAgent',
    icon: '🎯',
    color: '#ec4899',
    role: 'My Role',
    threshold: 0.60
  }
};
```

3. **Start agent in orchestrator** (`server.conversation-space.mjs`):

```javascript
import { MyNewAgentMonitor } from './server.agent-mynewagent.mjs';

const myNewAgentMonitor = new MyNewAgentMonitor(['general']);
await myNewAgentMonitor.start();
agentMonitors.set('mynewagent', myNewAgentMonitor);
```

---

## Troubleshooting

### Agents Not Responding

**Check LLM Backend**:
```bash
curl http://localhost:8001/v1/models
```

If 404 or connection refused:
- Ensure llama.cpp/vLLM is running
- Or set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`

**Check Agent Status**:
```bash
curl http://localhost:3000/api/conversation-space/status | jq '.agents'
```

Look for `"running": true`.

**Check Relevance Scores**:

Add console.log in `server.agent-monitor.mjs`:

```javascript
async onNewMessage(event) {
  const score = await this.assessRelevance(message, channel_id);
  console.log(`[${this.agentId}] Relevance: ${score.toFixed(2)} for: "${message.content}"`);
}
```

---

### SSE Connection Issues

**Browser Console**:
```javascript
Failed to connect to /api/conversation-space/stream/general
```

**Solutions**:
1. Check server is running on port 3000
2. Check CORS headers (should be allowed)
3. Check firewall/proxy settings
4. Try direct: `curl -N http://localhost:3000/api/conversation-space/stream/general`

---

### Messages Not Persisting

**Check JSONL File**:
```bash
cat .forgekeeper/conversation_spaces/channels/general.jsonl
```

**Permissions**:
```bash
ls -la .forgekeeper/conversation_spaces/channels/
```

Ensure Node process has write access.

---

### High Agent Activity (Too Noisy)

**Increase Thresholds**:

Edit agent files:
```javascript
contribution_threshold: 0.80  // Was 0.65
```

**Or Add Rate Limiting**:

In `server.agent-monitor.mjs`:
```javascript
// Skip if contributed in last 60 seconds
if (Date.now() - this.lastContributionTime < 60000) {
  return;
}
```

---

## Advanced Topics

### Multi-Channel Support

Currently supports single channel (`general`). To add channels:

1. **Create channel**:
```bash
curl -X POST http://localhost:3000/api/conversation-space/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","agents":["forge","loom"]}'
```

2. **Agents will auto-subscribe** to the new channel.

### Threaded Replies (Future)

Schema includes `thread_parent_id` for nested replies:

```json
{
  "thread_parent_id": "msg-01HQZT8J5K2M",
  "content": "Replying to the database question..."
}
```

UI support coming in Phase 2.

### External Connectors (Future)

Planned integrations:
- **Slack**: Bridge #general to Slack channel
- **Discord**: Bot presence in Discord server
- **Telegram**: Group chat integration

---

## Performance Considerations

### Message Volume

**JSONL Performance**:
- ✅ **< 10k messages**: Direct read, fast
- ⚠️ **10k-50k messages**: Use tail optimization
- ❌ **> 50k messages**: Consider SQLite migration

**LRU Cache**: Last 100 messages cached in memory per channel.

### Agent Processing

**Relevance Assessment**: ~1-5ms (keyword matching, no LLM)
**LLM Generation**: 500-5000ms (depending on model)

**Concurrent Responses**: Multiple agents can respond simultaneously without blocking.

---

## Comparison: Thought World vs Conversation Space

| Feature | Thought World (v1) | Conversation Space (v2) |
|---------|-------------------|-------------------------|
| **Agents** | 3 (Forge, Loom, Anvil) | 4 (+ Scout) |
| **Turn-Taking** | Round-robin (forced) | Threshold-based (natural) |
| **User Role** | Observer only | Full participant |
| **Concurrency** | Sequential | Parallel |
| **Storage** | Ephemeral (memory) | Persistent (JSONL) |
| **Real-Time** | Polling | SSE streaming |
| **Guardian** | No | Yes (Scout) |
| **Metadata** | Limited | Assumption Transparency |
| **Channels** | Single session | Multi-channel |

---

## Roadmap

### Phase 1 (Complete) ✅
- [x] Backend infrastructure
- [x] 4 agents with threshold logic
- [x] SSE streaming
- [x] React UI
- [x] JSONL persistence

### Phase 2 (Planned)
- [ ] Threaded replies
- [ ] Multi-channel UI
- [ ] User preferences (agent activity level)
- [ ] Approval workflows
- [ ] Reactions and voting

### Phase 3 (Future)
- [ ] External connectors (Slack, Discord)
- [ ] Semantic similarity (embeddings)
- [ ] Custom agents via UI
- [ ] Analytics dashboard

---

## Contributing

### Reporting Issues

Please include:
- Agent behavior (too active / too quiet)
- Relevance scores (check logs)
- LLM backend type (llama.cpp / vLLM / API)
- Example messages triggering unexpected behavior

### Suggesting Agents

Propose new agents with:
- **Role**: What problem does this agent solve?
- **Threshold**: How selective should it be?
- **Keywords**: What topics trigger relevance?
- **Special Logic**: Any unique behaviors?

---

## License

Part of Forgekeeper project. See main LICENSE file.

---

## Credits

**Architecture**: Based on Assumption Transparency Protocol and Guardian Pattern research

**Inspiration**: Collective intelligence, multi-agent systems, natural conversation dynamics

**Contributors**: Rado (design & implementation)

---

Last updated: 2025-12-13
