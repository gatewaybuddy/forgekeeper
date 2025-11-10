# Phase 3: Interactive Multi-Agent Chat - Implementation Plan

**Date**: November 9, 2025
**Status**: Planning Complete - Ready for Implementation
**Version**: 1.0

---

## Executive Summary

Transform the Forgekeeper multi-agent system from a "watch the logs" experience into a **collaborative chat interface** where the user participates in real-time conversations with agents. Agents can pause and ask for help when blocked, and users can provide guidance, credentials, and context during execution.

---

## Current State vs Future State

### Current (Phase 2.5)

```
User: "Clone github.com/user/private-repo"
→ Opens test-thought-world.html
→ Clicks "Run"
→ Watches Docker logs in terminal
→ Sees: Error 401 Unauthorized
→ Task fails
→ No way to provide credentials mid-execution
```

**Problems:**
- ❌ No real-time visibility in UI
- ❌ Can't interject when agents are stuck
- ❌ Agents give up instead of asking for help
- ❌ Docker logs required for debugging
- ❌ No way to provide missing information

### Future (Phase 3)

```
User: "Clone github.com/user/private-repo"
→ Opens thought-world chat
→ Sees real-time agent conversation:

🔨 Forge: I'll clone the repository...
🔭 Scout: ✓ Proceeding
🧵 Loom: Tool looks safe
⚒️ Anvil: Execute
🔧 System: ❌ Error 401

─── Iteration 2 ───

🔨 Forge: Clone failed - might be private
🔭 Scout: ⏸️ This repository is private.
          Do you have a GitHub token?
          [🔑 Provide Token] [⏭️ Skip]

👤 You: ghp_abc123xyz... [Send]

🔭 Scout: ✓ Token received, continuing...
🔨 Forge: Retrying with authentication...
🔧 System: ✓ Clone successful
⚒️ Anvil: ✓ Task complete
```

**Benefits:**
- ✅ Real-time visibility in chat UI
- ✅ Can provide help when agents ask
- ✅ Agents request missing information
- ✅ No Docker logs needed
- ✅ Collaborative problem-solving

---

## Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────┐
│                   Browser UI                         │
│  ┌─────────────────────────────────────────────┐   │
│  │  ConversationFeed (Chat Display)            │   │
│  │  - AgentMessage components                  │   │
│  │  - HumanMessage components                  │   │
│  │  - ToolExecutionCard components             │   │
│  │  - Auto-scroll & timestamps                 │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  HumanInputPrompt (When agents pause)       │   │
│  │  - Quick action buttons                     │   │
│  │  - Custom text input                        │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  AutonomyControl (Settings)                 │   │
│  │  - Level slider (1-10)                      │   │
│  │  - Approval threshold config                │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                       ↕ SSE (Server-Sent Events)
┌─────────────────────────────────────────────────────┐
│              Backend (Express + Node)                │
│  ┌─────────────────────────────────────────────┐   │
│  │  SSE Event Stream                           │   │
│  │  - forge_chunk, scout_chunk, etc.           │   │
│  │  - human_input_requested                    │   │
│  │  - tool_result, iteration_end               │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  requestHumanInput() (Pause Mechanism)      │   │
│  │  - Creates Promise, stores resolver         │   │
│  │  - Emits SSE event to UI                    │   │
│  │  - Waits for POST response                  │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Credential Manager                          │   │
│  │  - Load from .env.credentials               │   │
│  │  - Auto-retry on 401 errors                 │   │
│  │  - Save new credentials                     │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Autonomy Control                            │   │
│  │  - Check approval required                  │   │
│  │  - Risk level assessment                    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────────┐
│            Persistence Layer                         │
│  .forgekeeper/.env.credentials (gitignored)         │
│  .forgekeeper/conversations/*.jsonl                 │
│  .forgekeeper/agent_memory/ (future)                │
└─────────────────────────────────────────────────────┘
```

---

## Sprint 1: Core Chat + Credentials (Week 1)

### Day 1-2: Chat UI Foundation

#### 1. Create React Components

**File Structure:**
```
frontend/src/components/ThoughtWorldChat/
├── ConversationFeed.tsx       # Main chat container
├── AgentMessage.tsx            # Message bubbles
├── HumanMessage.tsx            # User responses
├── ToolExecutionCard.tsx       # Tool result display
├── IterationDivider.tsx        # Visual separator
├── HumanInputPrompt.tsx        # Interactive questions
├── QuickActionButtons.tsx      # [Provide Token] buttons
├── InputBar.tsx                # Text input + send
└── ConversationControls.tsx    # Pause/Resume/Settings
```

#### 2. Message Data Structure

```typescript
interface AgentMessage {
  id: string;
  timestamp: Date;
  iteration: number;
  agent: 'forge' | 'scout' | 'loom' | 'anvil' | 'system' | 'human';
  role: 'executor' | 'challenger' | 'verifier' | 'integrator' | 'tool' | 'user';
  content: string;
  status: 'thinking' | 'streaming' | 'complete' | 'waiting_human';
  elapsed?: number;

  // For human input requests
  humanInputRequest?: {
    question: string;
    context: Record<string, any>;
    suggestedActions: Array<{
      label: string;
      action: string;
      icon: string;
    }>;
    urgency: 'low' | 'medium' | 'high';
  };
}
```

#### 3. SSE Connection

```typescript
// In ConversationFeed.tsx
useEffect(() => {
  const eventSource = new EventSource('/api/thought-world/stream');

  eventSource.addEventListener('forge_chunk', (e) => {
    const data = JSON.parse(e.data);
    updateMessageContent('forge', data.content);
  });

  eventSource.addEventListener('scout_chunk', (e) => {
    const data = JSON.parse(e.data);
    updateMessageContent('scout', data.content);
  });

  eventSource.addEventListener('human_input_requested', (e) => {
    const data = JSON.parse(e.data);
    addMessage({
      agent: 'scout',
      status: 'waiting_human',
      humanInputRequest: {
        question: data.question,
        context: data.context,
        suggestedActions: data.suggestedActions
      }
    });
  });

  return () => eventSource.close();
}, []);
```

#### 4. Auto-Scroll

```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);
const [isAutoScroll, setIsAutoScroll] = useState(true);

useEffect(() => {
  if (isAutoScroll) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, isAutoScroll]);
```

**Deliverable:** Chat UI displays agent messages in real-time with auto-scroll.

---

### Day 3-4: Human-in-the-Loop Backend

#### 1. Request Human Input Function

```javascript
// In server.thought-world-tools.mjs

// Global map of pending inputs
const pendingHumanInputs = new Map();

/**
 * Pause execution and request human input
 * Returns a Promise that resolves when human responds
 */
async function requestHumanInput(question, context, suggestedActions) {
  const inputId = ulid();

  return new Promise((resolve, reject) => {
    // Store resolver
    pendingHumanInputs.set(inputId, {
      resolve,
      timestamp: Date.now()
    });

    // Emit event to UI
    onEvent('human_input_requested', {
      inputId,
      question,
      context,
      suggestedActions,
      timestamp: new Date().toISOString()
    });

    console.log(`[Human Input] Waiting for response to: ${inputId}`);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingHumanInputs.has(inputId)) {
        pendingHumanInputs.delete(inputId);
        console.log(`[Human Input] Timeout for: ${inputId}`);
        resolve({
          action: 'timeout',
          response: null,
          message: 'No response received - continuing with best guess'
        });
      }
    }, 300000); // 5 min
  });
}
```

#### 2. Human Response API Endpoint

```javascript
// In server.mjs

app.post('/api/thought-world/human-input/:sessionId/:inputId', (req, res) => {
  const { inputId } = req.params;
  const { response, action } = req.body;

  console.log(`[Human Input] Received response for ${inputId}:`, action);

  if (pendingHumanInputs.has(inputId)) {
    const { resolve } = pendingHumanInputs.get(inputId);
    pendingHumanInputs.delete(inputId);

    resolve({ action, response });

    res.json({ success: true, message: 'Input received' });
  } else {
    res.status(404).json({ error: 'Input request expired or not found' });
  }
});
```

#### 3. Integration in Scout Challenge

```javascript
async function runScoutChallenge(scoutConfig, forgeContent, forgeProposal, context, iteration, onEvent) {
  // ... existing logic ...

  const scoutResponse = extractJSON(scoutFullContent);

  // NEW: If Scout requests human input
  if (scoutResponse?.action === 'request_human_input') {
    console.log(`[Scout] Requesting human input: ${scoutResponse.question}`);

    const humanResponse = await requestHumanInput(
      scoutResponse.question,
      scoutResponse.context,
      scoutResponse.suggested_actions
    );

    console.log(`[Scout] Human responded with: ${humanResponse.action}`);

    // Add human response to context
    context.conversationHistory.push({
      role: 'human',
      content: humanResponse.response,
      action: humanResponse.action,
      iteration
    });

    // Record in metrics
    scoutMetrics.recordHumanIntervention({
      question: scoutResponse.question,
      response: humanResponse.response,
      action: humanResponse.action,
      iteration
    });

    // Continue with human's guidance
    return {
      approved: true,
      reasoning: `Human provided: ${humanResponse.response}`,
      humanContext: humanResponse,
      escalated: false
    };
  }

  // ... rest of logic ...
}
```

#### 4. Update Scout Prompt

Add to `.forgekeeper/thought_world/prompts/v2/scout.txt`:

```
## When to Request Human Help

You should ask the human for help when:
1. **Authentication errors** (401, 403) - Ask for tokens/credentials
2. **Private resources** - Ask for access or alternative approach
3. **Missing information** - Ask for clarification
4. **Ambiguous requirements** - Ask for preference
5. **Risk assessment** - Ask before destructive operations

## How to Request Help

Use this JSON format:
{
  "action": "request_human_input",
  "question": "This repository is private. Do you have a GitHub access token?",
  "context": {
    "error": "401 Unauthorized",
    "repo": "user/private-repo",
    "attempted_action": "git clone"
  },
  "suggested_actions": [
    { "label": "Provide Token", "action": "provide_github_token", "icon": "🔑" },
    { "label": "Try SSH", "action": "try_ssh", "icon": "🔐" },
    { "label": "Skip This", "action": "skip", "icon": "⏭️" }
  ],
  "urgency": "high"
}

The human will respond and you can continue with their guidance.
```

**Deliverable:** Agents can pause execution, request human input, and resume after receiving response.

---

### Day 5: Credential Management

#### 1. Credential Storage Structure

```bash
# .forgekeeper/.env.credentials (gitignored)

# GitHub Credentials
GITHUB_TOKEN=ghp_abc123xyz...
GITHUB_TOKEN_SCOPE=github.com/*

# SSH Keys (path references)
SSH_KEY_PATH=~/.ssh/id_rsa
SSH_KEY_SCOPE=github.com,gitlab.com

# Docker Registry
DOCKER_REGISTRY_TOKEN=dckr_pat_...
DOCKER_REGISTRY_SCOPE=docker.io/*

# NPM
NPM_TOKEN=npm_...
NPM_TOKEN_SCOPE=registry.npmjs.org

# API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
```

#### 2. Credential Loader

```javascript
// server.credentials.mjs

import fs from 'fs/promises';
import dotenv from 'dotenv';

const CREDENTIALS_FILE = '.forgekeeper/.env.credentials';

export async function loadCredentials() {
  try {
    const envContent = await fs.readFile(CREDENTIALS_FILE, 'utf8');
    const parsed = dotenv.parse(envContent);

    // Group credentials by type
    const credentials = {
      github: {
        token: parsed.GITHUB_TOKEN,
        scope: parsed.GITHUB_TOKEN_SCOPE || 'github.com/*'
      },
      ssh: {
        keyPath: parsed.SSH_KEY_PATH,
        scope: parsed.SSH_KEY_SCOPE || '*'
      },
      docker: {
        token: parsed.DOCKER_REGISTRY_TOKEN,
        scope: parsed.DOCKER_REGISTRY_SCOPE || 'docker.io/*'
      },
      npm: {
        token: parsed.NPM_TOKEN,
        scope: parsed.NPM_TOKEN_SCOPE || 'registry.npmjs.org'
      }
    };

    console.log('[Credentials] Loaded from', CREDENTIALS_FILE);
    return credentials;

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Credentials] No credentials file found - will prompt when needed');
      return {};
    }
    throw error;
  }
}

export function matchCredential(url, credentials) {
  // Match GitHub
  if (url.includes('github.com')) {
    const githubCred = credentials.github;
    if (githubCred?.token) {
      return { type: 'bearer', value: githubCred.token };
    }
  }

  // Match Docker
  if (url.includes('docker.io') || url.includes('registry')) {
    const dockerCred = credentials.docker;
    if (dockerCred?.token) {
      return { type: 'bearer', value: dockerCred.token };
    }
  }

  // Match NPM
  if (url.includes('registry.npmjs.org')) {
    const npmCred = credentials.npm;
    if (npmCred?.token) {
      return { type: 'bearer', value: npmCred.token };
    }
  }

  return null;
}
```

#### 3. Auto-Retry with Credentials

```javascript
// In server.thought-world-tools.mjs

try {
  const toolStartTime = Date.now();
  const toolResult = await runTool(toolName, toolArgs);
  console.log(`[Tool] ${toolName} completed successfully in ${Date.now() - toolStartTime}ms`);

} catch (error) {
  // Check if it's an auth error
  if (isAuthError(error)) {
    console.log(`[Tool] Auth error for ${toolName}, checking credentials...`);

    // Try to find matching credential
    const cred = matchCredential(toolArgs.url || toolArgs.repo, context.credentials);

    if (cred) {
      console.log(`[Tool] Found credential, retrying with auth...`);

      // Retry with credential
      const retryArgs = injectCredential(toolArgs, cred);
      const retryResult = await runTool(toolName, retryArgs);

      console.log(`[Tool] Retry successful with credentials`);
      // Continue with retryResult...

    } else {
      // No credential found - ask human
      console.log(`[Tool] No matching credential, requesting from human...`);

      const humanResponse = await requestHumanInput(
        `${toolName} requires authentication. Do you have credentials for ${toolArgs.url}?`,
        {
          error: error.message,
          tool: toolName,
          url: toolArgs.url
        },
        [
          { label: '🔑 Provide Token', action: 'provide_token', icon: '🔑' },
          { label: '🔐 Use SSH', action: 'use_ssh', icon: '🔐' },
          { label: '⏭️ Skip', action: 'skip', icon: '⏭️' }
        ]
      );

      if (humanResponse.action === 'provide_token') {
        // Save token to .env.credentials for future use
        await saveCredential('github', humanResponse.response);

        // Retry with new token
        const retryArgs = { ...toolArgs, token: humanResponse.response };
        const retryResult = await runTool(toolName, retryArgs);
        // ...
      }
    }
  }
}

function isAuthError(error) {
  return (
    error.statusCode === 401 ||
    error.statusCode === 403 ||
    error.message?.includes('authentication') ||
    error.message?.includes('unauthorized') ||
    error.message?.includes('Permission denied')
  );
}

function injectCredential(args, cred) {
  if (cred.type === 'bearer') {
    return { ...args, token: cred.value };
  }
  if (cred.type === 'ssh') {
    return { ...args, sshKey: cred.value };
  }
  return args;
}
```

#### 4. Save Credential API

```javascript
// In server.mjs

app.post('/api/session/credentials', async (req, res) => {
  const { type, value, scope } = req.body;

  // Validate
  if (!type || !value) {
    return res.status(400).json({ error: 'Missing type or value' });
  }

  // Append to .env.credentials
  const envKey = `${type.toUpperCase()}_TOKEN`;
  const scopeKey = `${type.toUpperCase()}_TOKEN_SCOPE`;

  const envLine = `\n${envKey}=${value}\n${scopeKey}=${scope || '*'}\n`;

  await fs.appendFile('.forgekeeper/.env.credentials', envLine, 'utf8');

  console.log('[Credentials] Saved new credential:', type);

  res.json({ success: true, message: 'Credential saved' });
});
```

#### 5. Update .gitignore

```bash
# Add to .gitignore
.forgekeeper/.env.credentials
.forgekeeper/conversations/*.jsonl
.forgekeeper/agent_memory/
```

**Deliverable:** Credentials stored securely, auto-retry on auth errors, user can provide new credentials that persist.

---

## Sprint 2: Polish + Autonomy (Week 2)

### Day 1-2: Quick Action Buttons

#### 1. HumanInputPrompt Component

```tsx
interface HumanInputPromptProps {
  request: {
    question: string;
    suggestedActions: Array<{
      label: string;
      action: string;
      icon: string;
    }>;
  };
  onAction: (action: string, customResponse?: string) => void;
}

export function HumanInputPrompt({ request, onAction }: HumanInputPromptProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customResponse, setCustomResponse] = useState('');

  return (
    <div className="human-input-prompt">
      <div className="question">{request.question}</div>

      <div className="quick-actions">
        {request.suggestedActions.map(action => (
          <button
            key={action.action}
            onClick={() => onAction(action.action)}
            className="quick-action-btn"
          >
            <span>{action.icon}</span>
            {action.label}
          </button>
        ))}

        <button
          onClick={() => setShowCustomInput(!showCustomInput)}
          className="quick-action-btn custom"
        >
          💬 Custom Response
        </button>
      </div>

      {showCustomInput && (
        <div className="custom-input">
          <textarea
            value={customResponse}
            onChange={(e) => setCustomResponse(e.target.value)}
            placeholder="Type your custom response..."
          />
          <button onClick={() => onAction('custom', customResponse)}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
```

**Deliverable:** Quick action buttons for common responses.

---

### Day 3-4: Conversation History

#### 1. Save Conversations

```javascript
// In server.thought-world-tools.mjs

import fs from 'fs/promises';
import path from 'path';

const CONVERSATIONS_DIR = '.forgekeeper/conversations';

async function saveConversation(sessionId, messages, outcome) {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });

  const filename = `${sessionId}.jsonl`;
  const filepath = path.join(CONVERSATIONS_DIR, filename);

  const record = {
    sessionId,
    timestamp: new Date().toISOString(),
    task: context.task,
    iterations: iteration,
    outcome, // 'success' | 'failed' | 'escalated'
    messages: messages.map(msg => ({
      agent: msg.agent,
      content: msg.content,
      timestamp: msg.timestamp,
      iteration: msg.iteration
    }))
  };

  await fs.writeFile(filepath, JSON.stringify(record) + '\n', 'utf8');
  console.log(`[Conversations] Saved to ${filepath}`);
}
```

#### 2. Load Past Conversations

```javascript
// API endpoint
app.get('/api/conversations', async (req, res) => {
  const files = await fs.readdir(CONVERSATIONS_DIR);

  const conversations = await Promise.all(
    files
      .filter(f => f.endsWith('.jsonl'))
      .map(async (file) => {
        const content = await fs.readFile(
          path.join(CONVERSATIONS_DIR, file),
          'utf8'
        );
        return JSON.parse(content);
      })
  );

  // Sort by timestamp descending
  conversations.sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  res.json({ conversations });
});
```

**Deliverable:** Conversations saved to disk and can be viewed/replayed.

---

### Day 5: Autonomy Control

#### 1. Autonomy Configuration

```javascript
// In context object
const autonomyConfig = {
  level: 5, // 1-10 scale (default: 5 Balanced)

  // Derived from level - what requires human approval
  requireApprovalFor: {
    toolExecution: level <= 3,        // Low: ask before every tool
    fileWrites: level <= 5,           // Medium: ask before writes
    destructiveOps: level <= 8,       // High: ask before rm/drop/delete
    apiCalls: level <= 4,             // Ask before external API calls
    credentialUse: level <= 6,        // Ask before using credentials
    iterationContinue: level <= 2     // Ask before each iteration
  },

  // What always triggers escalation (always ask human)
  alwaysEscalate: [
    'auth_failure',      // Always ask for credentials
    'ambiguous_task',    // Always ask for clarification
    'risk_high',         // Always confirm risky operations
    'cost_high',         // Always confirm expensive operations
    'data_loss_risk'     // Always confirm potential data loss
  ]
};
```

#### 2. Approval Check Function

```javascript
async function checkApprovalRequired(actionType, actionDetails, autonomyConfig) {
  const { level, requireApprovalFor, alwaysEscalate } = autonomyConfig;

  // Always escalate certain situations
  if (alwaysEscalate.includes(actionDetails.riskLevel)) {
    return {
      required: true,
      reason: 'High risk - requires approval'
    };
  }

  // Check autonomy level threshold
  if (requireApprovalFor[actionType]) {
    return {
      required: true,
      reason: `Autonomy level ${level} requires approval for ${actionType}`
    };
  }

  // Approved automatically
  return { required: false };
}
```

#### 3. Risk Assessment

```javascript
function calculateRiskLevel(tool, args) {
  // Destructive operations
  if (['bash', 'powershell'].includes(tool)) {
    if (/rm|del|drop|truncate|delete/i.test(args.command)) {
      return 'high';
    }
  }

  // File writes outside sandbox
  if (tool === 'write_file' && !args.path.startsWith('.forgekeeper/sandbox/')) {
    return 'medium';
  }

  // External API calls
  if (tool === 'web_search' || tool === 'web_fetch') {
    return 'medium';
  }

  // Safe reads
  if (tool === 'read_file' || tool === 'dir') {
    return 'low';
  }

  return 'low';
}
```

#### 4. UI Component

```tsx
export function AutonomyControl() {
  const [level, setLevel] = useState(5);

  const labels = {
    1: 'Full Guidance - Approve every action',
    2: 'Supervised - Approve each iteration',
    3: 'Assisted - Approve writes & commands',
    4: 'Collaborative - Approve external calls',
    5: 'Balanced - Only pause when blocked', // Default
    6: 'Confident - Approve credentials use',
    7: 'Trusted - Only approve destructive ops',
    8: 'Advanced - Rarely ask',
    9: 'Expert - Almost never ask',
    10: 'Full Autonomous - Never ask (risky!)'
  };

  const handleChange = async (newLevel: number) => {
    setLevel(newLevel);

    // Update session config
    await fetch('/api/session/autonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: newLevel })
    });
  };

  return (
    <div className="autonomy-control">
      <label>Autonomy Level: {level}</label>
      <input
        type="range"
        min="1"
        max="10"
        value={level}
        onChange={(e) => handleChange(parseInt(e.target.value))}
      />
      <div className="autonomy-description">
        {labels[level]}
      </div>

      <details>
        <summary>What does this control?</summary>
        <ul>
          <li>Levels 1-3: High supervision, frequent pauses</li>
          <li>Levels 4-6: Balanced, pause for important decisions</li>
          <li>Levels 7-10: High autonomy, rare pauses</li>
        </ul>
        <p>
          <strong>Always paused for:</strong> Authentication failures,
          high-risk operations, ambiguous tasks
        </p>
      </details>
    </div>
  );
}
```

**Deliverable:** Configurable autonomy level with approval thresholds and risk assessment.

---

## Key Design Decisions

### 1. No Guide Agent (For Now)

**Decision:** Skip the 5th "Guide" agent in initial implementation.

**Reasoning:**
- Adds latency (extra LLM call on every human interaction)
- Increases complexity
- User prefers direct agent questions
- Can be added later if needed (Phase 4)

**Alternative:** Improve agent prompts to ask clearer questions directly.

---

### 2. Default Autonomy Level: 5 (Balanced)

**Decision:** Level 5 is the default.

**Reasoning:**
- Balanced between supervision and autonomy
- Agents work independently but pause when blocked
- Always asks for credentials (security)
- Always confirms destructive operations (safety)
- Good starting point - users can adjust

---

### 3. Credential Priority

**Decision:** Prioritize GitHub tokens, SSH keys, Docker tokens, NPM tokens.

**Storage:**
- `.forgekeeper/.env.credentials` (gitignored)
- Plain text for MVP (encryption in Phase 4)
- Scope-based matching (e.g., `github.com/*`)

**Auto-Retry:**
- On 401/403 errors, check for matching credential
- Retry automatically if found
- Ask human if not found
- Save new credentials for future use

---

### 4. Conversation Persistence

**Decision:** Save all conversations to JSONL files.

**Structure:**
```
.forgekeeper/conversations/
├── {sessionId}-2025-11-09-143201.jsonl
└── {sessionId}-2025-11-09-150432.jsonl
```

**Benefits:**
- Easy to parse and analyze
- Can build future features (replay, search, learning)
- Lightweight (no database needed yet)

---

## File Structure After Phase 3

```
/mnt/d/projects/codex/forgekeeper/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ThoughtWorldChat/
│   │   │       ├── ConversationFeed.tsx
│   │   │       ├── AgentMessage.tsx
│   │   │       ├── HumanMessage.tsx
│   │   │       ├── HumanInputPrompt.tsx
│   │   │       ├── QuickActionButtons.tsx
│   │   │       ├── AutonomyControl.tsx
│   │   │       └── ConversationControls.tsx
│   ├── server.credentials.mjs          # NEW
│   ├── server.thought-world-tools.mjs  # MODIFIED (human input)
│   └── server.mjs                       # MODIFIED (endpoints)
├── .forgekeeper/
│   ├── .env.credentials                # NEW (gitignored)
│   ├── conversations/                  # NEW
│   │   └── *.jsonl
│   └── thought_world/
│       └── prompts/v2/
│           └── scout.txt               # MODIFIED (ask for help)
├── .gitignore                          # MODIFIED
└── docs/
    └── PHASE3_INTERACTIVE_CHAT_PLAN.md # THIS FILE
```

---

## Testing Plan

### Manual Testing Checklist

#### Sprint 1: Chat + Credentials
- [ ] Open chat UI, see empty conversation
- [ ] Start task, see agents posting messages in real-time
- [ ] Trigger auth error (private repo), see Scout ask for token
- [ ] Provide token via quick action, see retry succeed
- [ ] Check `.forgekeeper/.env.credentials` has token
- [ ] Restart task with same repo, see auto-retry work
- [ ] Verify conversation saved to `.forgekeeper/conversations/`

#### Sprint 2: Polish + Autonomy
- [ ] Click quick action buttons, verify response sent
- [ ] Type custom response, verify sent correctly
- [ ] Set autonomy level to 3, verify more frequent pauses
- [ ] Set autonomy level to 7, verify fewer pauses
- [ ] View past conversations list
- [ ] Load past conversation and review messages

### Automated Testing

```javascript
// tests/phase3/test_human_input.mjs
describe('Human Input System', () => {
  it('should pause and wait for human response', async () => {
    const session = startSession('Test task');

    // Trigger human input request
    const promise = requestHumanInput('Need token?', {}, []);

    // Verify paused
    expect(session.status).toBe('waiting_human');

    // Simulate human response
    await respondToInput(session.id, 'ghp_token');

    // Verify resumed
    expect(await promise).toMatchObject({ action: 'custom' });
  });
});
```

---

## Rollout Strategy

### Phase 3A (Sprint 1) - Core Features
1. Deploy chat UI
2. Enable human-in-the-loop
3. Add credential management
4. Test with team
5. Gather feedback

### Phase 3B (Sprint 2) - Polish
1. Add quick actions
2. Implement conversation history
3. Add autonomy control
4. Iterate based on feedback

### Phase 3C (Future) - Advanced
1. Episodic memory integration
2. Multi-session management
3. Conversation search
4. Analytics dashboard

---

## Success Metrics

### User Experience
- ✅ Can see agent conversation in real-time
- ✅ Can provide help when agents are stuck
- ✅ Credentials persist between sessions
- ✅ No Docker logs needed for normal use

### Agent Effectiveness
- ✅ Task completion rate increases (vs Phase 2)
- ✅ Fewer failures due to missing credentials
- ✅ Faster iteration cycles (human unblocks faster)

### System Performance
- ✅ SSE latency < 100ms
- ✅ Human input response time < 2s
- ✅ Chat UI handles 100+ messages smoothly

---

## Future Enhancements (Phase 4+)

### 1. Guide Agent
5th agent that interfaces with human:
- Translates technical errors to human-friendly questions
- Suggests concrete actions
- Learns user preferences

### 2. Multi-Session Management
- Run multiple tasks in parallel
- Switch between sessions
- Session templates

### 3. Conversation Search
- Search past conversations by keyword
- Filter by outcome, agent, date
- Export to markdown/PDF

### 4. Credential Encryption
- Encrypt `.env.credentials` at rest
- Use system keychain (macOS Keychain, Windows Credential Manager)
- Support vault integration (HashiCorp Vault, AWS Secrets Manager)

### 5. Episodic Memory Integration
- Agents learn from past conversations
- Suggest solutions based on similar tasks
- Improve over time

### 6. Agent Learning Dashboard
- Visualize agent performance
- Track success rates by task type
- Identify common failure patterns

---

## Open Questions

1. **Skip Guide Agent?**
   - Decision: Yes, skip for Phase 3
   - Reasoning: User prefers direct agent questions, adds latency
   - Revisit: Phase 4 if questions are unclear

2. **Default Autonomy Level?**
   - Decision: Level 5 (Balanced)
   - Reasoning: Good balance, safe defaults
   - User can adjust per session

3. **Credential Encryption?**
   - Decision: Plain text in `.env.credentials` for MVP
   - Reasoning: Faster to implement, gitignored
   - Enhancement: Add encryption in Phase 4

4. **Conversation Retention?**
   - Decision: Keep all conversations indefinitely
   - Reasoning: Needed for episodic memory
   - Future: Add retention policy and cleanup

---

## References

- **Phase 2.5 Status**: `SCOUT_STATUS_LOGGING_ADDED.md`
- **Scout Integration**: `SCOUT_REAL_ISSUE_FIXED.md`
- **Scout UI**: `SCOUT_UI_INTEGRATION_FIX.md`
- **Architecture**: `docs/thought_world/agent-workflow.md`
- **Scout Agent**: `docs/thought_world/scout.md`
- **Scout Metrics**: `docs/thought_world/scout-metrics.md`

---

**Status**: Ready for implementation
**Next Step**: Begin Sprint 1 - Chat UI Foundation
**Estimated Timeline**: 2 weeks (2 sprints of 5 days each)
**Priority**: High - Enables real user collaboration with agents
