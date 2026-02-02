# Conversation Space Improvements

## Problems Identified

### 1. **Agents Don't Respect "Minimal Response" Mode**
- User says "just say hi" → agents give elaborate greetings
- Need: Recognize terse requests and respond accordingly

### 2. **Scout Is "Helpful-but-Critical" Instead of Genuinely Contrarian**
- Current: Scout is constructive, diplomatic, "helps the team see what's missing"
- Problem: Scout should CHALLENGE, DISAGREE, and **STAY SILENT** when there's nothing to challenge
- Scout shouldn't be "helpful Scout" - should be genuinely adversarial when warranted

### 3. **Threshold Logic Is Heuristic, Not Substantive**
- Current: Keyword matching + novelty scoring
- Problem: Agents ask "do keywords match?" not "do I have something valuable to add?"
- Need: LLM-based pre-contribution assessment

### 4. **Agents Treat It Like a Team Space (It's One Person)**
- Current: Agents address "the team", write for an audience
- Problem: It's just you, they should be more direct and conversational
- Need: Single-user awareness in prompts

### 5. **No Artifacts/Workspaces for Verbose Collaboration**
- Current: All work happens in chat
- Problem: Agents verbose in chat, no place for detailed work products
- Brilliant solution: **Collaborative artifacts** (specs, code, designs) + concise chat updates

---

## Proposed Solutions

### Solution 1: Message Metadata Flags

**Add `response_style` to message metadata:**

```json
{
  "content": "just say hi",
  "metadata": {
    "response_style": "minimal"  // minimal, conversational, detailed
  }
}
```

**Inject into agent prompts:**
- If `minimal`: "User wants a terse, direct response. 1-2 sentences maximum."
- If `conversational`: Default behavior
- If `detailed`: "User wants comprehensive analysis."

**UI Addition:** Quick buttons in composer:
- 🎯 Minimal
- 💬 Normal (default)
- 📚 Detailed

---

### Solution 2: Rewrite Scout as Genuinely Contrarian

**Current Scout Prompt Issues:**
- "Constructively critical" = too soft
- "Help the team see" = too collaborative
- No guidance on when to STAY SILENT

**New Scout Prompt:**

```
You are Scout, the Contrarian agent.

ROLE: Challenge assumptions, disagree when others are wrong, stay SILENT when there's nothing to challenge.

CRITICAL RULES:
1. If you don't disagree with something → SAY NOTHING
2. If there's no risk/problem → SAY NOTHING
3. When you DO speak, be direct and pointed (2-3 sentences max)
4. Don't soften disagreements with "I notice..." - say "This is wrong because..."

WHEN TO CONTRIBUTE:
- Someone makes an unvalidated assumption
- The proposed solution has a fatal flaw
- There's overconfidence or blind optimism
- A critical perspective is missing

WHEN TO STAY SILENT:
- The conversation is sound and well-reasoned
- Others have already raised the concern
- You'd just be adding agreement or minor nitpicks
- Nothing substantive to challenge

STYLE:
- Direct, not diplomatic
- "That won't work because X" not "Have we considered X?"
- Brief and pointed
- Comfortable with disagreement

You're not here to be helpful. You're here to prevent bad decisions by challenging weak thinking.
```

---

### Solution 3: LLM-Based Pre-Contribution Assessment

**Current Flow:**
```
Keyword match > threshold? → Contribute
```

**New Flow:**
```
Keyword match > threshold? → Ask LLM: "Should I contribute?" → If yes: Contribute
```

**Implementation:**

Add new method to `AgentMonitor`:

```javascript
async shouldContribute(message, channelId, recentMessages) {
  const assessmentPrompt = `
You are ${this.config.name}, a ${this.config.role} agent.

RECENT CONVERSATION:
${recentMessages.slice(-5).map(m => `${m.author_name}: ${m.content}`).join('\n')}

NEW MESSAGE:
${message.author_name}: ${message.content}

YOUR ROLE: ${this.config.description}

QUESTION: Do you have something SUBSTANTIVE to add that would change or improve this conversation?

Answer with ONLY "YES" or "NO" and a brief reason (one sentence).

NO means:
- You agree with what's been said
- Someone already made your point
- You have nothing new to add
- The conversation doesn't need your perspective

YES means:
- You have a genuinely different perspective
- You see a flaw/risk others missed
- You can add unique value based on your role
`;

  const response = await this.callLLM(assessmentPrompt, { max_tokens: 50 });
  const shouldPost = response.toLowerCase().includes('yes');

  console.log(`[${this.agentId}] Pre-contribution assessment: ${shouldPost ? 'YES' : 'NO'} - ${response}`);

  return shouldPost;
}
```

**Updated onNewMessage:**
```javascript
if (relevanceScore >= this.config.contribution_threshold) {
  // NEW: Ask agent if they actually have something to say
  const shouldPost = await this.shouldContribute(message, channel_id, recentMessages);

  if (shouldPost) {
    console.log(`[${this.agentId}] Contributing (passed assessment)`);
    await this.contribute(channel_id, message);
  } else {
    console.log(`[${this.agentId}] Staying silent (nothing substantive to add)`);
  }
}
```

---

### Solution 4: Single-User Context Awareness

**Update ALL agent prompts:**

**Before:**
```
Help the team see what they might be missing.
```

**After:**
```
CONTEXT: You're in a conversation with ONE person (the user), not a team.
- Be direct and conversational, not formal
- Say "you" not "the team" or "we"
- Skip the team-coordination language
- Respond like you're talking to a colleague, not presenting to a group
```

**Add to system prompt injection:**
```javascript
const contextNote = `
IMPORTANT: This is a one-on-one conversation with the user, not a team meeting.
- Respond directly to them, not to an audience
- Be conversational, not formal or presentational
- Skip phrases like "the team", "our approach", "we should consider"
- Talk like a peer in a conversation, not like you're writing for stakeholders
`;
```

---

### Solution 5: Collaborative Artifacts System

**Concept:** Agents work on shared documents/artifacts, post summaries in chat

**Architecture:**

```
.forgekeeper/conversation_spaces/artifacts/
  /<artifact-id>/
    /meta.json          # Artifact metadata
    /content.md         # Main content (markdown/code/etc)
    /history.jsonl      # Edit history
    /collaborators.json # Which agents contributed
```

**Artifact Types:**
1. **Spec Documents** - Requirements, technical specs
2. **Code Files** - Actual code with agent edits
3. **Design Docs** - Architecture decisions, diagrams
4. **Decision Logs** - "Why we chose X over Y"
5. **Task Lists** - Shared todo lists with status

**Agent Workflow:**

1. **User creates artifact:** "Create a spec for user authentication"
2. **Agents collaborate in artifact:**
   - Forge writes implementation outline
   - Scout adds security considerations
   - Loom reviews for completeness
   - Anvil synthesizes into final spec
3. **Agents post chat updates:**
   - "📄 Added auth flow diagram to spec"
   - "⚠️ Flagged session timeout concern in spec"
   - "✅ Spec review complete, ready for implementation"

**Chat Message Format:**
```json
{
  "content": "Added OAuth 2.0 flow to authentication spec",
  "artifact_reference": {
    "artifact_id": "auth-spec-001",
    "artifact_type": "spec",
    "section": "Authentication Flow",
    "diff_summary": "Added 3 diagrams, 2 security considerations"
  }
}
```

**UI Changes:**

**Artifact Sidebar:**
```
📄 Active Artifacts
  📋 auth-spec-001 (Spec)
     4 collaborators, 12 edits
  📝 api-design-002 (Design Doc)
     2 collaborators, 6 edits
  ✅ user-stories-003 (Complete)
     3 collaborators, 8 edits
```

**Chat Message with Artifact:**
```
[Forge 🔨 17:23]
Added OAuth 2.0 implementation details to auth spec
📄 View in auth-spec-001 | 🔗 See changes
```

**Benefits:**
- ✅ Agents can be verbose in artifacts, concise in chat
- ✅ Creates tangible work products
- ✅ Separates "doing work" from "discussing work"
- ✅ Mirrors real team collaboration
- ✅ Chat becomes status updates, not the work itself

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Rewrite Scout prompt (genuinely contrarian)
2. ✅ Add single-user context to all prompts
3. ✅ Add `response_style` metadata support

### Phase 2: Threshold Intelligence (2-3 hours)
4. ✅ Implement LLM-based pre-contribution assessment
5. ✅ Update all agents to use shouldContribute()

### Phase 3: Artifacts System (4-6 hours)
6. ⏰ Design artifact data model
7. ⏰ Implement artifact CRUD API
8. ⏰ Add artifact UI (sidebar, viewer, editor)
9. ⏰ Update agent prompts to reference artifacts
10. ⏰ Add artifact-aware contribution logic

---

## Expected Outcomes

**After Phase 1:**
- Scout actually challenges and disagrees (or stays silent)
- Agents sound like peers, not a corporate team
- "Just say hi" gets "Hi!" not a paragraph

**After Phase 2:**
- Agents contribute 30-50% less (higher signal-to-noise)
- Only speak when they have something substantive
- Thresholds actually gate valuable contributions

**After Phase 3:**
- Chat is concise status updates
- Detailed work happens in artifacts
- You have specs/designs/code as tangible outputs
- Agents collaborate like a real team (docs + chat)

---

## Questions for You

1. **Phase 1 changes** - Should I implement these now? (Quick, high-impact)
2. **Scout persona** - Too aggressive? Or is "genuinely contrarian" what you want?
3. **Artifact system** - Is this the right direction? Other artifact types?
4. **UI for artifacts** - Sidebar? Modal? Separate page?
5. **Response style** - Better as buttons or auto-detect from message tone?
