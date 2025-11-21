

# Forgekeeper Skills System

## Overview

The Skills system enables **autonomous skill loading and execution** in Forgekeeper. Skills are modular, reusable capabilities defined in markdown files that Claude automatically discovers and uses when relevant.

**Key Benefits:**
- **Autonomous**: Claude decides when to use skills based on context
- **Modular**: Each skill is self-contained with clear instructions
- **Reusable**: Skills work across all conversations once defined
- **Shareable**: Project skills are version-controlled for team use
- **Extensible**: Easy to add new skills without code changes

## Architecture

```
User Message
    ↓
Orchestrator
    ↓
Skills Injector ← Skills Registry ← Skills Loader
    ↓                    ↓              ↓
Analyze Message     Query Skills    Scan .claude/skills/
    ↓                    ↓              ↓
Find Relevant       Get Metadata    Parse SKILL.md
    ↓                    ↓              ↓
Inject into        Format for       YAML Frontmatter +
System Prompt      Prompt           Markdown Content
    ↓
LLM with Skills
```

## Components

### 1. Skills Loader (`frontend/skills/loader.mjs`)

Loads and parses skill definitions from `.claude/skills/` directory.

**Key Functions:**
- `loadSkill(skillPath)` - Load single skill from directory
- `scanSkillsDirectory(skillsDir)` - Scan directory for all skills
- `loadAllSkills(options)` - Load project + personal skills
- `searchSkillsByTags(skills, tags)` - Filter by tags
- `formatSkillForPrompt(skill)` - Format for LLM injection

**Skill Format:**
```markdown
---
name: skill-name
description: Brief description
tags: [tag1, tag2]
version: 1.0.0
author: name
---

# Skill Instructions
Markdown content with instructions...
```

### 2. Skills Registry (`frontend/skills/registry.mjs`)

Singleton registry managing loaded skills with hot-reload support.

**Features:**
- Centralized skill management
- File watching for hot-reload (500ms debounce)
- Skill queries and search
- Relevance scoring
- Statistics tracking

**API:**
```javascript
import { getRegistry } from './skills/registry.mjs';

const registry = getRegistry();
await registry.initialize();

// Query skills
const allSkills = registry.getAll();
const skill = registry.get('skill-name');
const tagged = registry.searchByTags(['testing']);
const relevant = registry.findRelevantSkills('write tests');

// Get stats
const stats = registry.getStats();
```

### 3. Skills Injector (`frontend/skills/injector.mjs`)

Injects relevant skills into conversation prompts.

**Injection Strategies:**
- `ALL`: Inject all available skills
- `RELEVANT`: Inject skills relevant to user message (default)
- `TAGGED`: Inject skills matching specific tags
- `NONE`: Disable skill injection

**Usage:**
```javascript
import { injectSkills } from './skills/injector.mjs';

const result = injectSkills(messages, {
  strategy: 'relevant',
  maxSkills: 5,
  minRelevanceScore: 3
});

// result.messages - Modified messages with skills
// result.skills - Injected skills
// result.skillNames - Names of injected skills
```

## Quick Start

### 1. Create a Skill

```bash
cd .claude/skills
mkdir my-skill
cat > my-skill/SKILL.md <<'EOF'
---
name: my-skill
description: Does something useful
tags: [category, use-case]
version: 1.0.0
author: your-name
---

# My Skill

## Overview
What this skill does...

## When to Use
- Scenario 1
- Scenario 2

## Instructions
### Step 1
Do this...

### Step 2
Do that...

## Examples
Example 1...
EOF
```

### 2. Verify Skill Loaded

```bash
curl http://localhost:3000/api/skills/status | jq '.skills[] | select(.name == "my-skill")'
```

### 3. Test Skill Usage

Send a message that should trigger your skill:
```
User: "Please help me with [task matching skill description]"
```

Check debug output for skills injection:
```json
{
  "debug": {
    "skills": {
      "count": 1,
      "names": ["my-skill"]
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# Enable/disable skills (default: 1)
SKILLS_ENABLED=1

# Hot-reload on file changes (default: 1)
SKILLS_HOT_RELOAD=1

# Reload debounce time in ms (default: 500)
SKILLS_RELOAD_DEBOUNCE=500

# Injection strategy: all, relevant, tagged, none (default: relevant)
SKILLS_STRATEGY=relevant

# Maximum skills to inject per conversation (default: 5)
SKILLS_MAX_INJECT=5
```

### Skill Directories

**Project Skills** (`.claude/skills/`):
- Shared with team
- Version controlled
- Project-specific conventions

**Personal Skills** (`~/.claude/skills/`):
- User-specific
- Available across all projects
- Not version controlled

## Skill Structure

### Required Files

```
my-skill/
├── SKILL.md              # Skill definition (required)
├── scripts/              # Helper scripts (optional)
│   └── helper.sh
├── templates/            # Templates (optional)
│   └── config.yaml
└── examples/             # Examples (optional)
    └── sample.txt
```

### SKILL.md Format

```markdown
---
name: skill-name          # Required: unique identifier (kebab-case)
description: Brief desc   # Required: one-line description
tags: [tag1, tag2]        # Optional: for discoverability
version: 1.0.0            # Optional: semver
author: name              # Optional: author name
enabled: true             # Optional: enable/disable (default: true)
---

# Skill Name

## Overview
Brief overview of what this skill accomplishes.

## When to Use
Clear scenarios when this skill should be invoked:
- Scenario 1
- Scenario 2

## Prerequisites
Any requirements:
- Tools needed
- Files that must exist
- Environment variables

## Instructions
Step-by-step instructions for Claude to follow:

### Step 1: Action Name
Detailed instructions...

### Step 2: Next Action
More instructions...

## Expected Output
What successful completion looks like.

## Error Handling
Common issues and how to resolve them.

## Examples
Concrete examples of skill usage.

## Resources
Helper scripts, templates, or references.

## Notes
Additional context or warnings.

## Version History
- **1.0.0** (YYYY-MM-DD): Initial release
```

## Creating Effective Skills

### Best Practices

1. **Clear Descriptions**: Make it obvious when to use the skill
   ```yaml
   description: Generate comprehensive unit tests for JavaScript/TypeScript code
   # vs
   description: Help with testing  # Too vague
   ```

2. **Specific Tags**: Use descriptive tags for better discovery
   ```yaml
   tags: [testing, vitest, unit-tests, integration-tests]
   # vs
   tags: [test]  # Too generic
   ```

3. **Step-by-Step Instructions**: Break down complex tasks
   ```markdown
   ### Step 1: Analyze the Code
   Read and understand the module exports...

   ### Step 2: Determine Test Scope
   Identify unit tests, integration tests, edge cases...
   ```

4. **Concrete Examples**: Show exactly how the skill works
   ```markdown
   ## Examples

   ### Example 1: Testing a Function
   User request: "Write tests for formatSkillForPrompt"

   Skill invocation:
   1. Read the function code
   2. Identify test cases
   3. Generate test file...
   ```

5. **Error Handling**: Document common issues
   ```markdown
   **Error**: Skill not triggering
   - **Cause**: Description doesn't match user's request
   - **Fix**: Update description to be more specific
   ```

### Anti-Patterns

❌ **Too Broad**:
```yaml
description: Help with coding tasks
tags: [code]
```

✅ **Specific**:
```yaml
description: Generate Forgekeeper task cards following project conventions
tags: [forgekeeper, planning, tasks, documentation]
```

❌ **Vague Instructions**:
```markdown
## Instructions
Do the thing that needs to be done.
```

✅ **Clear Steps**:
```markdown
## Instructions
### Step 1: Read tasks.md
Find the next available task ID by reading tasks.md...

### Step 2: Structure the Task Card
Follow this template: [detailed template]
```

## Relevance Scoring

The system scores skills for relevance based on:

1. **Name Match** (+10 points): Skill name appears in message
2. **Tag Match** (+5 points per tag): Tag appears in message
3. **Description Keywords** (+1 point per match): Description words in message

**Example:**
```
User message: "Help me write unit tests for the login function"

Skill: test-generation
- description: "Generate comprehensive unit tests..."
- tags: [testing, vitest, unit-tests]

Score calculation:
- "unit" in description: +1
- "tests" in description: +1
- "unit-tests" tag match: +5
- "testing" tag match: +5
Total: 12 points (highly relevant)
```

Only skills with score >= `minRelevanceScore` (default: 3) are injected.

## Monitoring

### Check Skills Status

```bash
curl http://localhost:3000/api/skills/status
```

Response:
```json
{
  "enabled": true,
  "stats": {
    "totalSkills": 3,
    "enabledSkills": 3,
    "disabledSkills": 0,
    "tags": {
      "forgekeeper": 1,
      "testing": 1,
      "planning": 1
    },
    "lastLoadTime": 1700000000000,
    "hotReloadEnabled": true,
    "initialized": true
  },
  "skills": [
    {
      "name": "forgekeeper-task-card",
      "description": "Create Forgekeeper task cards...",
      "tags": ["forgekeeper", "planning"],
      "version": "1.0.0",
      "enabled": true
    }
  ]
}
```

### Debug Skill Injection

Check the `/api/chat` response:
```json
{
  "debug": {
    "skills": {
      "count": 2,
      "names": ["test-generation", "forgekeeper-task-card"]
    }
  }
}
```

### View Logs

```bash
# Skills initialization
docker logs forgekeeper-frontend-1 | grep "\[Skills\]"

# Skill injection
docker logs forgekeeper-frontend-1 | grep "Injected.*skills"
```

## Troubleshooting

### Skill Not Loading

**Symptoms:** Skill doesn't appear in `/api/skills/status`

**Causes & Fixes:**
1. Invalid YAML frontmatter
   - Validate with online YAML checker
   - Ensure `---` delimiters are on their own lines

2. Missing required fields (name, description)
   - Add both fields to frontmatter

3. Directory not in `.claude/skills/`
   - Move skill to correct location
   - Avoid spaces in directory names

### Skill Not Being Injected

**Symptoms:** Skill exists but isn't injected into conversations

**Causes & Fixes:**
1. Relevance score too low
   - Add more specific tags
   - Update description to match user queries
   - Lower `minRelevanceScore` (not recommended)

2. Skills disabled
   - Check `SKILLS_ENABLED=1`
   - Check skill's `enabled: true` in frontmatter

3. Max skills limit reached
   - Increase `SKILLS_MAX_INJECT`
   - Make your skill more relevant than others

### Hot-Reload Not Working

**Symptoms:** Changes to SKILL.md don't take effect

**Causes & Fixes:**
1. Hot-reload disabled
   - Check `SKILLS_HOT_RELOAD=1`

2. File watcher not started
   - Check logs for watcher errors
   - Restart frontend server

3. Changes too rapid (within debounce)
   - Wait 500ms after last change
   - Increase `SKILLS_RELOAD_DEBOUNCE`

### Skill Instructions Not Followed

**Symptoms:** Claude doesn't follow skill instructions correctly

**Causes & Fixes:**
1. Instructions too vague
   - Make steps more specific
   - Add concrete examples
   - Include exact commands/code

2. Prerequisites not met
   - Document all prerequisites clearly
   - Check that required files/tools exist

3. Conflicting skills
   - Disable similar skills
   - Make skill descriptions more specific
   - Use unique tags

## Examples

### Example Skills in Project

1. **forgekeeper-task-card**
   - Location: `.claude/skills/forgekeeper-task-card/`
   - Purpose: Create task cards following project conventions
   - Tags: forgekeeper, planning, tasks, documentation

2. **test-generation**
   - Location: `.claude/skills/test-generation/`
   - Purpose: Generate comprehensive test suites
   - Tags: testing, quality, vitest, javascript

### Creating a Documentation Skill

```bash
mkdir -p .claude/skills/api-docs
cat > .claude/skills/api-docs/SKILL.md <<'EOF'
---
name: api-docs
description: Generate API documentation from JSDoc comments
tags: [documentation, api, jsdoc]
version: 1.0.0
author: team
---

# API Documentation Generation

## When to Use
- User asks to "document the API"
- New endpoints added without documentation
- JSDoc comments need to be compiled

## Instructions

### Step 1: Find API Endpoints
Use grep to find all endpoint definitions:
```bash
grep -r "app\.(get|post|put|delete)" frontend/server.mjs
```

### Step 2: Extract JSDoc
Read each endpoint file and extract JSDoc comments.

### Step 3: Generate Markdown
Create docs/api/endpoint-name.md with:
- Endpoint URL
- HTTP method
- Parameters (query, body)
- Response format
- Example requests
- Error codes

### Step 4: Update API Index
Add entry to docs/api/README.md

## Example
[Detailed example of API doc generation...]
EOF
```

## See Also

- [Skills Template](.claude/skills/TEMPLATE/SKILL.md) - Template for creating skills
- [Skills README](.claude/skills/README.md) - Quick reference in skills directory
- [Capability Expansion Plan](../planning/CAPABILITY_EXPANSION_PLAN.md) - Original planning document

## Contributing

To contribute a skill:

1. Create skill following best practices above
2. Test thoroughly with various prompts
3. Document all edge cases
4. Submit PR with clear description
5. Include examples of skill usage

## Version History

- **1.0.0** (2025-11-21): Initial Skills system release

---

**Last Updated**: 2025-11-21
**Status**: Sprint 3 Complete
