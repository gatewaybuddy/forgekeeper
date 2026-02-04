# Forgekeeper v2 - Developer Guide

## Quick Reference

### Architecture Layers

1. **Inference Layer** - LLM provider abstraction
2. **Workspace Layer** - Global Workspace Theory implementation
3. **Agent Layer** - Four specialized agents (Forge, Loom, Anvil, Scout)
4. **Orchestration Layer** - Main workflow loop

### Key Concepts

#### Global Workspace Theory (GWT)
- Shared workspace holds current state
- Agents propose updates competitively
- Attention mechanism selects winning proposal
- Token management keeps workspace under 4K tokens

#### Attention Mechanism
Proposals scored on:
- **Relevance** (40%) - Matches current focus
- **Novelty** (25%) - Not duplicate content
- **Confidence** (15%) - Agent's confidence
- **Empirical** (10%) - Tool results, Scout responses
- **Priority** (10%) - Challenges, urgent responses

#### Agent Specialization
- **Forge**: Executor (coding, tools) → Local Qwen
- **Loom**: Reviewer (quality, edge cases) → Sonnet
- **Anvil**: Synthesizer (consensus, final decisions) → Opus
- **Scout**: Challenger (anti-learned helplessness) → Sonnet

---

## Common Tasks

### Add a New Agent

1. Create agent file in `src/agents/`:
```typescript
import { BaseAgent } from './base.js';

export class MyAgent extends BaseAgent {
  readonly name = 'myagent';
  readonly role = 'specialist';

  protected getSystemPrompt(): string {
    return `You are MyAgent...`;
  }
}
```

2. Register in `src/agents/registry.ts`:
```typescript
export interface AgentRegistry {
  // ...existing agents
  myagent: MyAgent;
}

export function createAgents(router: ModelRouter): AgentRegistry {
  // ...existing agents
  const myagent = new MyAgent(
    router.getProviderForAgent('myagent'),
    router.getModelForAgent('myagent')
  );

  return { forge, loom, anvil, scout, myagent };
}
```

3. Add routing logic in `src/inference/router.ts`:
```typescript
getProviderForAgent(agentName: string): LLMProvider {
  switch (agentName) {
    // ...existing cases
    case 'myagent':
      return this.claude; // or this.localQwen
    default:
      return this.claude;
  }
}
```

### Add a New Proposal Type

1. Update `ProposalType` in `src/workspace/manager.ts`:
```typescript
export type ProposalType =
  | 'hypothesis'
  | 'decision'
  | 'focus'
  | 'tool_result'
  | 'challenge'
  | 'response'
  | 'my_new_type'; // Add here
```

2. Update `Proposal` interface if new fields needed:
```typescript
export interface Proposal {
  type: ProposalType;
  content: string;
  source: string;
  myNewField?: string; // Add here
}
```

3. Handle in `applyUpdate()` in `src/workspace/manager.ts`:
```typescript
switch (winner.type) {
  // ...existing cases
  case 'my_new_type':
    // Handle new type
    break;
}
```

4. Update `parseProposal()` validation in `src/agents/base.ts`:
```typescript
const validTypes = [
  'hypothesis',
  'decision',
  'focus',
  'tool_result',
  'challenge',
  'response',
  'my_new_type', // Add here
];
```

### Add a New Model Provider

1. Create provider file in `src/inference/`:
```typescript
import { LLMProvider, Message, CompletionOptions, CompletionResult, ProviderHealth } from './provider.js';

export class MyProvider extends LLMProvider {
  readonly name = 'myprovider';
  readonly models = ['model-1', 'model-2'];

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    // Implementation
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Implementation
  }

  estimateTokens(messages: Message[]): number {
    // Implementation
  }
}
```

2. Register in `src/inference/router.ts`:
```typescript
import { MyProvider } from './myprovider.js';

export class ModelRouter {
  private myProvider: MyProvider;

  constructor() {
    this.localQwen = new LocalQwenProvider();
    this.claude = new ClaudeProvider();
    this.myProvider = new MyProvider(); // Add here

    this.startHealthChecking();
  }

  // Update routing logic
  private selectProvider(taskType: TaskType): LLMProvider {
    switch (taskType) {
      case 'my_task_type':
        return this.myProvider;
      // ...
    }
  }
}
```

### Modify Attention Scoring

Edit `src/workspace/attention.ts`:

```typescript
// Change weights
const WEIGHTS = {
  relevance: 0.5,  // Increased from 0.4
  novelty: 0.2,    // Decreased from 0.25
  confidence: 0.15,
  empirical: 0.1,
  priority: 0.05,  // Decreased from 0.1
};

// Add new scoring factor
export function calculateScore(proposal: Proposal, workspace: Workspace): number {
  let score = 0;

  score += calculateRelevance(proposal, workspace) * WEIGHTS.relevance;
  score += calculateNovelty(proposal, workspace) * WEIGHTS.novelty;
  score += (proposal.confidence || 0.5) * WEIGHTS.confidence;
  score += calculateEmpiricalBonus(proposal, workspace) * WEIGHTS.empirical;
  score += calculatePriorityBonus(proposal, workspace) * WEIGHTS.priority;
  score += calculateMyNewFactor(proposal, workspace) * 0.05; // New factor

  return Math.max(0, Math.min(1, score));
}

function calculateMyNewFactor(proposal: Proposal, workspace: Workspace): number {
  // Implementation
  return 0.5;
}
```

### Add Database Model

1. Edit `prisma/schema.prisma`:
```prisma
model MyNewModel {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  myField   String

  @@index([sessionId])
}

// Update Session model to include relation
model Session {
  // ...existing fields
  myNewModels MyNewModel[]
}
```

2. Generate migration:
```bash
npm run db:migrate
```

3. Use in code:
```typescript
import { prisma } from './utils/prisma.js';

await prisma.myNewModel.create({
  data: {
    sessionId,
    myField: 'value',
  },
});
```

---

## Debugging

### Enable Debug Logging

Edit `.env`:
```bash
LOG_LEVEL="debug"
```

### View Database

```bash
npm run db:studio
# Opens Prisma Studio at http://localhost:5555
```

### Inspect Workspace State

```typescript
import { WorkspaceManager } from './workspace/manager.js';

const manager = new WorkspaceManager();
const workspace = await manager.getCurrent(sessionId);

console.log('Focus:', workspace.currentFocus);
console.log('Hypotheses:', workspace.hypotheses);
console.log('Decisions:', workspace.decisions);
console.log('Token count:', workspace.tokenCount);
```

### Check Provider Health

```typescript
import { getRouter } from './inference/router.js';

const router = getRouter();
const health = await router.healthCheckAll();

console.log('Local Qwen:', health['local-qwen']);
console.log('Claude:', health['claude']);
```

### Trace Orchestration

Events are logged to the database:

```typescript
const events = await prisma.event.findMany({
  where: { sessionId },
  orderBy: { createdAt: 'asc' },
});

for (const event of events) {
  console.log(`[${event.iteration}] ${event.type} by ${event.actor}`);
  console.log(JSON.parse(event.data));
}
```

---

## Testing

### Unit Test Example

Create `src/workspace/attention.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateScore } from './attention.js';
import { Workspace, Proposal } from './manager.js';

describe('Attention Mechanism', () => {
  it('should score relevant proposals higher', () => {
    const workspace: Workspace = {
      currentFocus: 'implement user authentication',
      hypotheses: [],
      decisions: [],
      toolResults: new Map(),
      episodicMatches: [],
      pendingChallenges: [],
      tokenCount: 0,
      iteration: 0,
    };

    const relevantProposal: Proposal = {
      type: 'hypothesis',
      content: 'We should use JWT tokens for authentication',
      source: 'forge',
      confidence: 0.8,
    };

    const irrelevantProposal: Proposal = {
      type: 'hypothesis',
      content: 'The database needs optimization',
      source: 'forge',
      confidence: 0.8,
    };

    const relevantScore = calculateScore(relevantProposal, workspace);
    const irrelevantScore = calculateScore(irrelevantProposal, workspace);

    expect(relevantScore).toBeGreaterThan(irrelevantScore);
  });
});
```

Run tests:
```bash
npm test
```

### Integration Test Example

Create `src/orchestrator/workflow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRouter } from '../inference/router.js';
import { createAgents } from '../agents/registry.js';
import { Orchestrator } from './workflow.js';

describe('Orchestrator', () => {
  it('should complete orchestration loop', async () => {
    const router = getRouter();
    const agents = createAgents(router);
    const orchestrator = new Orchestrator(agents);

    const result = await orchestrator.orchestrate({
      userMessage: 'Test task',
      maxIterations: 3,
    });

    expect(result.sessionId).toBeDefined();
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.metrics.integrationScore).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Performance Optimization

### Reduce API Costs

1. **Use local inference** for coding tasks:
```bash
PREFER_LOCAL_INFERENCE="true"
```

2. **Lower max iterations**:
```bash
MAX_ITERATIONS="5"
```

3. **Use Haiku for simple tasks** - edit router.ts to prefer Haiku

### Reduce Latency

1. **Parallel proposals** already enabled by default
2. **Lower temperature** for faster responses:
```typescript
temperature: 0.0 // in agent calls
```

3. **Reduce max tokens**:
```bash
# In provider calls
maxTokens: 1024  // instead of 2048
```

### Manage Memory

1. **Reduce workspace capacity**:
```bash
MAX_WORKSPACE_TOKENS="2000"  # from 4000
```

2. **Lower limits**:
```bash
MAX_HYPOTHESES="3"   # from 5
MAX_DECISIONS="5"    # from 10
```

3. **Aggressive pruning** - edit `pruning.ts` to prune earlier

---

## Common Patterns

### Error Handling

```typescript
try {
  const result = await orchestrator.orchestrate(options);
} catch (error) {
  if (error instanceof PrismaClientKnownRequestError) {
    // Database error
    logger.error({ error }, 'Database error');
  } else if (error instanceof Error && error.message.includes('API')) {
    // API error
    logger.error({ error }, 'API error');
  } else {
    // Unknown error
    logger.error({ error }, 'Unknown error');
  }
}
```

### Retries

```typescript
async function orchestrateWithRetry(options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await orchestrator.orchestrate(options);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Concurrent Sessions

```typescript
const sessions = ['session1', 'session2', 'session3'];

const results = await Promise.all(
  sessions.map(sessionId =>
    orchestrator.orchestrate({
      sessionId,
      userMessage: 'Task for ' + sessionId,
    })
  )
);
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./dev.db` | Database connection string |
| `LOCAL_QWEN_URL` | `http://127.0.0.1:8080` | Local inference endpoint |
| `PREFER_LOCAL_INFERENCE` | `true` | Prefer local over API |
| `ANTHROPIC_API_KEY` | - | Claude API key |
| `OPENAI_API_KEY` | - | OpenAI API key (fallback) |
| `PORT` | `4000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `debug` | Logging level |
| `MAX_WORKSPACE_TOKENS` | `4000` | Workspace capacity |
| `MAX_HYPOTHESES` | `5` | Max hypotheses |
| `MAX_DECISIONS` | `10` | Max decisions |
| `MAX_TOOL_RESULTS` | `10` | Max tool results |
| `MAX_ITERATIONS` | `10` | Max orchestration loops |
| `PARALLEL_PROPOSALS` | `true` | Parallel agent calls |
| `OPUS_MODEL` | `claude-opus-4-5-20251101` | Opus model name |
| `SONNET_MODEL` | `claude-sonnet-4-5-20250929` | Sonnet model name |
| `HAIKU_MODEL` | `claude-haiku-4-5-20250815` | Haiku model name |
| `ENABLE_EXTENDED_THINKING` | `true` | Extended thinking for Opus |
| `MAX_THINKING_TOKENS` | `10000` | Thinking budget |

---

## Troubleshooting

### "Prisma Client not generated"
```bash
npm run db:generate
```

### "DATABASE_URL environment variable not found"
```bash
cp .env.example .env
```

### "Local Qwen unavailable"
- Check if llama.cpp server is running
- Verify `LOCAL_QWEN_URL` is correct
- Router will fall back to Claude automatically

### "API key error"
- Set `ANTHROPIC_API_KEY` in `.env`
- Verify key is valid

### "Token limit exceeded"
- Reduce `MAX_WORKSPACE_TOKENS`
- Lower `MAX_HYPOTHESES` and `MAX_DECISIONS`
- Check pruning is working

---

## Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **Pino Logging**: https://getpino.io
- **Zod Validation**: https://zod.dev
- **TypeScript**: https://www.typescriptlang.org
- **Anthropic API**: https://docs.anthropic.com

---

**Last Updated**: 2026-02-01
