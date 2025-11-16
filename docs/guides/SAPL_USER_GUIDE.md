# SAPL User Guide: Safe Auto-PR Loop

**Automate safe pull requests for documentation, tests, and configuration updates.**

SAPL (Safe Auto-PR Loop) lets you create pull requests directly from Forgekeeper's task suggestions. It's designed to be safe by default—only docs, tests, and config files can be modified, and you always see a preview before anything happens.

---

## Table of Contents

- [What is SAPL?](#what-is-sapl)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Using SAPL from the UI](#using-sapl-from-the-ui)
- [Configuration](#configuration)
- [Real-World Examples](#real-world-examples)
- [Safety Features](#safety-features)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

---

## What is SAPL?

**SAPL (Safe Auto-PR Loop)** automatically creates pull requests from task suggestions, with multiple safety layers to prevent accidental changes to production code.

### How It Works

```
1. TGT detects issue (e.g., missing docs)
2. You click "Propose PR" in Tasks drawer
3. SAPL shows preview (files, diff, stats)
4. You review and click "Create PR"
5. SAPL creates branch, commits, pushes, opens PR
6. PR is ready for review with safety labels
```

### Why Use SAPL?

**Without SAPL:**
- Manually create branch for each doc/test update
- Write commit messages from scratch
- Remember to add proper labels
- Push and open PR through GitHub UI
- Risk forgetting safety checks

**With SAPL:**
- One-click PR creation from task cards
- Auto-generated commit messages from task context
- Automatic safety labels and branch naming
- Always shows preview before creating
- Built-in allowlist prevents unsafe changes

### When to Use SAPL

**Perfect for:**
- ✅ Documentation updates (README, API docs, guides)
- ✅ Test file additions/improvements
- ✅ Configuration file updates (.env.example, package.json)
- ✅ Example files and templates

**NOT for:**
- ❌ Production code changes (src/, lib/, server files)
- ❌ Dependency updates requiring testing
- ❌ Database migrations
- ❌ Infrastructure changes

---

## Quick Start

### Prerequisites

- [ ] **GitHub CLI (gh)** installed and authenticated
- [ ] **Git** configured with your name and email
- [ ] **Forgekeeper** running locally
- [ ] **TGT enabled** (optional but recommended)

**Install GitHub CLI:**

```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
sudo apt install gh

# Linux (other)
# See: https://github.com/cli/cli#installation

# Windows
winget install GitHub.cli

# Authenticate
gh auth login
```

### 1. Enable SAPL (Safe Mode)

Edit your `.env` file:

```bash
# Enable SAPL
AUTO_PR_ENABLED=1

# Dry-run mode (preview only, no actual PRs)
AUTO_PR_DRYRUN=1

# No auto-merge (safe default)
AUTO_PR_AUTOMERGE=0

# Allowed file patterns (safe defaults)
AUTO_PR_ALLOW=README.md,docs/**/*.md,*.example,tests/**/*.mjs

# PR labels
AUTO_PR_LABELS=auto-pr,safe,documentation
```

### 2. Restart Forgekeeper

```bash
# Restart to load new config
docker compose restart frontend

# Or restart full stack
python -m forgekeeper ensure-stack
```

### 3. Verify Setup

```bash
# Check SAPL status
curl http://localhost:3000/api/auto_pr/status

# Should show:
{
  "ok": true,
  "enabled": true,
  "dryRun": true,      # Safe mode
  "autoMerge": false,  # No auto-merge
  "allowlist": [...]
}
```

### 4. Test with Preview (Always Safe)

**Option A: From UI**
1. Open Forgekeeper at `http://localhost:3000`
2. Click "Tasks" drawer
3. Find a task or create one
4. Click "📝 Propose PR"
5. Review the preview modal

**Option B: From API**

```bash
# Make a small change to README.md first
echo "\n## Test" >> README.md

# Preview the PR
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["README.md"],
    "title": "docs: test SAPL preview",
    "body": "Testing SAPL preview functionality"
  }'
```

You'll see:
- Which files will be included/blocked
- Full diff of changes
- Statistics (files changed, lines added/removed)
- Any warnings

**This is always safe** - no git operations happen in preview mode!

---

## How It Works

### The SAPL Workflow

#### Step 1: Task Detection (TGT)

TGT analyzes telemetry and creates a task:

```
🟡 MEDIUM: Missing documentation for new endpoint

Evidence:
- New endpoint: POST /api/thought-world/start
- No matching docs in docs/api/
- Feature added 2 days ago

Suggested Fix:
- Add docs/api/thought_world_api.md
- Include endpoint description, parameters, examples
```

#### Step 2: Propose PR (You)

Click "📝 Propose PR" on the task card.

SAPL analyzes current git state:
- Finds modified/untracked files
- Filters against allowlist
- Generates diff for each file
- Calculates statistics

#### Step 3: Preview (SAPL)

Shows PR preview modal with:

**Header:**
- Branch name: `auto-pr/add-thought-world-docs-2025-11-14T15-30-45`
- Labels: `auto-pr`, `safe`, `documentation`

**File Validation:**
- ✅ 1 allowed file(s)
- ❌ 0 blocked file(s)
- Files: `docs/api/thought_world_api.md`

**Statistics:**
- Files changed: 1
- Lines added: 145
- Lines removed: 0

**Diff:**
```diff
diff --git a/docs/api/thought_world_api.md b/docs/api/thought_world_api.md
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/docs/api/thought_world_api.md
@@ -0,0 +1,145 @@
+# Thought World API
+
+## POST /api/thought-world/start
...
```

**Warnings:**
- None (all files allowed, safe to proceed)

####Step 4: Create PR (You)

Click "Create PR" button.

**In Dry-Run Mode (`AUTO_PR_DRYRUN=1`):**
- Shows the same preview again
- No git operations
- Safe to click repeatedly

**In Execution Mode (`AUTO_PR_DRYRUN=0`):**
SAPL executes these steps:

1. **Create branch**: `auto-pr/add-thought-world-docs-...`
2. **Stage files**: Only allowed files added
3. **Create commit**: With generated message
4. **Push branch**: To your fork/origin
5. **Create PR**: Using GitHub CLI (`gh pr create`)
6. **(Optional) Enable auto-merge**: If configured

#### Step 5: PR Created (SAPL)

Result:
- ✅ PR opened at `https://github.com/username/repo/pull/123`
- ✅ Labels applied: `auto-pr`, `safe`, `documentation`
- ✅ Branch: `auto-pr/add-thought-world-docs-2025-11-14T15-30-45`
- ✅ Commit message: Generated from task context
- ✅ Logged to ContextLog for audit

You review the PR on GitHub like any other PR, then merge when ready.

---

## Using SAPL from the UI

### Tasks Drawer Integration

**Location:** Footer → "Tasks" button

#### 1. Find or Create a Task

**From TGT (automatic):**
- TGT analyzes telemetry
- Generates task cards automatically
- Tasks appear in drawer

**Manual (for testing):**
- Make changes to allowed files (docs, tests)
- Create a task card manually (or just use git status)

#### 2. Propose PR

Click "📝 Propose PR" button on a task card.

**SAPL analyzes:**
- Current git status (modified/untracked files)
- Filters files by allowlist
- Generates diff for preview

**PR Preview Modal opens** with 4 sections:

##### Section 1: Header

```
Propose Pull Request
Branch: auto-pr/update-api-docs-2025-11-14T15-30-45
Labels: auto-pr, safe, documentation
```

##### Section 2: File Validation

**Allowed files** (green checkmarks):
```
✅ docs/api/tasks_api.md
✅ README.md
✅ tests/api/tasks.test.mjs
```

**Blocked files** (red X, if any):
```
❌ frontend/server.mjs (not in allowlist)
❌ src/core/agent.ts (not in allowlist)
```

**Stats:**
```
✅ 3 allowed | ❌ 2 blocked
```

##### Section 3: Statistics

```
Files changed: 3
Lines added: +127
Lines removed: -5
```

##### Section 4: Diff Viewer

For each allowed file:

```diff
docs/api/tasks_api.md
─────────────────────
diff --git a/docs/api/tasks_api.md b/docs/api/tasks_api.md
index abc123..def456 100644
--- a/docs/api/tasks_api.md
+++ b/docs/api/tasks_api.md
@@ -1,6 +1,10 @@
 # Tasks API

+## Overview
+
+The Tasks API provides endpoints for managing task cards...
+
 ## Endpoints
```

**Diff highlighting:**
- 🟢 Green background: Added lines (`+`)
- 🔴 Red background: Removed lines (`-`)
- Gray text: Context lines
- Gray background: File headers

#### 3. Review and Create

**Review checklist:**
- ✅ All files are allowed (no blocked files)
- ✅ Diff looks correct (no unexpected changes)
- ✅ Statistics make sense
- ✅ No warnings

**Click "Create PR":**

**In Dry-Run Mode:**
- Modal shows same preview
- Message: "Dry-run mode enabled. No PR created."
- Safe to test

**In Execution Mode:**
- Progress indicator shows:
  - Creating branch...
  - Staging files...
  - Creating commit...
  - Pushing branch...
  - Creating PR...
- Success: PR URL displayed
- Link to view PR on GitHub

#### 4. View PR on GitHub

Click the PR URL or visit GitHub.

**PR details:**
- **Title**: From task or preview
- **Body**: Task description + evidence + fix
- **Labels**: `auto-pr`, `safe`, `documentation`
- **Branch**: `auto-pr/update-api-docs-...`
- **Files**: Only allowed files included

**PR footer:**
```
🤖 Generated with SAPL (Safe Auto-PR Loop)

From task: TGT-123
Telemetry: High continuation rate in /api/tasks
```

---

## Configuration

### Safety Levels

**Level 1: Disabled (Default)**
```bash
AUTO_PR_ENABLED=0  # SAPL completely disabled
```
Use when: First time setup, debugging issues

**Level 2: Dry-Run (Recommended for Testing)**
```bash
AUTO_PR_ENABLED=1
AUTO_PR_DRYRUN=1   # Preview only, no git operations
AUTO_PR_AUTOMERGE=0
```
Use when: Testing SAPL, verifying allowlist, learning workflow

**Level 3: Execution Mode (Careful)**
```bash
AUTO_PR_ENABLED=1
AUTO_PR_DRYRUN=0   # Creates actual PRs
AUTO_PR_AUTOMERGE=0  # Manual merge required
```
Use when: Confident in allowlist, ready to create real PRs

**Level 4: Full Automation (Use with Extreme Caution)**
```bash
AUTO_PR_ENABLED=1
AUTO_PR_DRYRUN=0
AUTO_PR_AUTOMERGE=1  # Auto-merges when CI passes
```
Use when: Very confident, excellent CI coverage, well-tested allowlist

### Allowlist Configuration

**Default allowlist** (safe for most projects):

```bash
AUTO_PR_ALLOW=README.md,docs/**/*.md,forgekeeper/.env.example,frontend/test/**/*.mjs,frontend/tests/**/*.mjs,tests/**/*.mjs,frontend/**/*.test.mjs,frontend/**/*.spec.mjs,package.json,frontend/package.json,tsconfig.json,frontend/tsconfig.json
```

**Pattern syntax:**
- `README.md` - Exact file match
- `docs/**/*.md` - All `.md` files in `docs/` (any depth)
- `tests/**/*.mjs` - All `.mjs` files in `tests/` (any depth)
- `*.example` - All files ending in `.example`
- `**/*.test.mjs` - All test files anywhere

**Custom allowlist examples:**

**Only README:**
```bash
AUTO_PR_ALLOW=README.md
```

**All documentation:**
```bash
AUTO_PR_ALLOW=README.md,docs/**/*.md,CONTRIBUTING.md,CHANGELOG.md
```

**Docs + Tests:**
```bash
AUTO_PR_ALLOW=docs/**/*.md,tests/**/*.js,tests/**/*.mjs,**/*.test.js
```

**Docs + Tests + Config:**
```bash
AUTO_PR_ALLOW=docs/**/*.md,tests/**,*.example,.env.example,package.json,tsconfig.json
```

### PR Customization

**Labels:**
```bash
AUTO_PR_LABELS=auto-pr,safe,documentation,tgt-generated
```

All PRs get these labels. Useful for:
- Filtering in GitHub (`label:auto-pr`)
- CODEOWNERS rules
- Branch protection rules
- Statistics/analytics

**Branch naming:**
Branch names are auto-generated:
```
auto-pr/{task-slug}-{timestamp}
```

Examples:
- `auto-pr/update-api-docs-2025-11-14T15-30-45`
- `auto-pr/add-tests-for-tgt-2025-11-14T16-45-12`
- `auto-pr/fix-typo-in-readme-2025-11-14T17-22-33`

---

## Real-World Examples

### Example 1: Fix Documentation Gap (TGT → SAPL)

**Scenario:** You added a new API endpoint but forgot to document it.

**Step 1: TGT Detection**

After 1 hour of usage, TGT analyzes and creates:

```
🟡 MEDIUM: Missing documentation for new endpoint

Evidence:
- New endpoint: GET /api/tasks/analytics
- Endpoint added in commit abc123 (1 day ago)
- No matching documentation in docs/api/
- 15 requests to this endpoint in past hour

Suggested Fix:
- Create docs/api/tasks_api.md
- Document endpoint parameters, response format
- Add usage examples
- Link from docs/README.md

Files to create/modify:
- docs/api/tasks_api.md (new)
- docs/README.md (update index)
```

**Step 2: You Write the Docs**

```bash
# Create the new docs file
cat > docs/api/tasks_api.md <<EOF
# Tasks API Analytics

## GET /api/tasks/analytics

Returns aggregate statistics for task generation.

### Parameters

None

### Response

\`\`\`json
{
  "ok": true,
  "stats": {
    "generated": 42,
    "approved": 28,
    "dismissed": 14
  }
}
\`\`\`
EOF

# Update docs index
echo "- [Tasks Analytics API](api/tasks_api.md)" >> docs/README.md
```

**Step 3: Propose PR**

1. Open Tasks drawer
2. Find the task card
3. Click "📝 Propose PR"

**Preview shows:**
```
Files: 2
✅ docs/api/tasks_api.md (new file)
✅ docs/README.md (modified)

Changes:
+ 45 lines added
- 0 lines removed

No warnings
```

**Step 4: Create PR**

Click "Create PR" → SAPL creates:

```
Title: docs: add Tasks Analytics API documentation
Branch: auto-pr/add-tasks-analytics-docs-2025-11-14T15-30-45
Labels: auto-pr, safe, documentation

Body:
Adds missing documentation for GET /api/tasks/analytics endpoint.

From TGT task: Missing documentation for new endpoint

Evidence:
- Endpoint added 1 day ago in commit abc123
- 15 requests logged in past hour
- No matching docs found

🤖 Generated with SAPL (Safe Auto-PR Loop)
```

**Step 5: Review and Merge**

- CI runs (tests pass)
- Review the PR (looks good)
- Merge via GitHub UI
- TGT task auto-updates to "completed"

**Result:** Documentation gap fixed in ~5 minutes with full audit trail.

### Example 2: Add Test Coverage

**Scenario:** TGT detects a feature without tests.

**TGT Task:**
```
🟠 HIGH: No test coverage for new feature

Evidence:
- New feature: Thought World sessions
- Files added: frontend/src/components/ThoughtWorldPanel.tsx
- No corresponding test file found
- Code coverage: 0% for this component

Suggested Fix:
- Create frontend/src/components/__tests__/ThoughtWorldPanel.test.tsx
- Add tests for:  * Rendering
  * Start session flow
  * Stream handling
  * Error states
```

**You write tests:**

```typescript
// frontend/src/components/__tests__/ThoughtWorldPanel.test.tsx
import { render, screen } from '@testing-library/react';
import ThoughtWorldPanel from '../ThoughtWorldPanel';

describe('ThoughtWorldPanel', () => {
  it('renders start button', () => {
    render(<ThoughtWorldPanel />);
    expect(screen.getByText('Start Session')).toBeInTheDocument();
  });

  it('shows loading state when starting', async () => {
    // ... test implementation
  });

  // ... more tests
});
```

**Propose PR via SAPL:**

Preview:
```
✅ frontend/src/components/__tests__/ThoughtWorldPanel.test.tsx (new)
+ 87 lines added
```

PR created:
```
Title: test: add test coverage for ThoughtWorldPanel
Labels: auto-pr, safe, tests
```

**Result:** Test coverage improved with minimal overhead.

### Example 3: Update Configuration File

**Scenario:** You added new environment variables but didn't update `.env.example`.

**TGT Task:**
```
🟡 MEDIUM: Missing env vars in .env.example

Evidence:
- New env vars detected in code:
  * THOUGHT_WORLD_ENABLED
  * THOUGHT_WORLD_MAX_DEPTH
- Not present in .env.example
- Could confuse new contributors

Suggested Fix:
- Add new variables to .env.example
- Include comments explaining usage
```

**You update .env.example:**

```bash
# Thought World Mode
THOUGHT_WORLD_ENABLED=0           # Enable thought world simulations
THOUGHT_WORLD_MAX_DEPTH=5         # Maximum simulation depth
```

**SAPL creates PR:**

```
Title: chore: add Thought World env vars to .env.example
Files: .env.example
+ 3 lines added
Labels: auto-pr, safe, configuration
```

Quick merge, no confusion for new contributors.

### Example 4: Blocked Files Protection

**Scenario:** You accidentally try to include production code in a SAPL PR.

**You modify multiple files:**
```bash
# Safe files
echo "## New section" >> docs/README.md

# Unsafe files (accidentally)
echo "// debug code" >> frontend/server.mjs
```

**Propose PR:**

SAPL preview shows:
```
✅ 1 allowed file(s)
❌ 1 blocked file(s)

Allowed:
✅ docs/README.md

Blocked:
❌ frontend/server.mjs (not in allowlist)

⚠️ Warning: 1 file(s) blocked by allowlist
Cannot create PR with blocked files
```

**"Create PR" button is disabled** with message:
```
Cannot create PR: blocked files detected
Remove blocked files or extend allowlist
```

**Action:** Revert `server.mjs` changes, keep only docs changes.

**Result:** Prevented unsafe PR automatically.

---

## Safety Features

### 1. Allowlist-Based Filtering

**How it works:**
- Every file is checked against allowlist BEFORE any git operation
- Blocked files are rejected immediately
- UI shows exactly which files are blocked and why
- No way to bypass allowlist (hardcoded safety)

**Default safe patterns:**
- `docs/**/*.md` - All documentation
- `**/*.test.mjs` - All test files
- `*.example` - Example/template files
- `README.md`, `CONTRIBUTING.md`, etc.

**Never allowed by default:**
- `src/**/*.js` - Source code
- `server.mjs`, `app.js` - Server files
- `*.config.js` - Runtime config
- `node_modules/**` - Dependencies

### 2. Dry-Run Mode (Default)

**Behavior:**
- `AUTO_PR_DRYRUN=1` (default)
- All git operations skipped
- Full preview shown
- Safe to click "Create PR" repeatedly
- No branches created, no commits made

**When to disable:**
- Only after testing with dry-run
- Only when confident in allowlist
- Only for docs/tests/config

### 3. ContextLog Audit Trail

**Every SAPL action is logged:**

```json
{
  "actor": "system",
  "act": "auto_pr",
  "branch": "auto-pr/update-docs-...",
  "files_allowed": ["README.md"],
  "files_blocked": [],
  "pr_url": "https://github.com/.../pull/123",
  "dry_run": false,
  "timestamp": "2025-11-14T15:30:45Z"
}
```

**Query logs:**
```bash
curl 'http://localhost:3000/api/ctx/tail?act=auto_pr&n=50'
```

### 4. Kill-Switch

**Instant disable:**
```bash
AUTO_PR_ENABLED=0
```

**Effects:**
- All SAPL endpoints return error
- UI shows "SAPL disabled" message
- No git operations possible
- Existing PRs unaffected

**Use when:**
- Debugging issues
- Testing other features
- Temporarily pausing automation

### 5. No Auto-Merge by Default

**Default:**
```bash
AUTO_PR_AUTOMERGE=0
```

**Behavior:**
- All PRs require manual review
- Even if CI passes, no auto-merge
- You must click "Merge" on GitHub

**When to enable:**
- Very high confidence
- Excellent CI coverage (unit + integration + E2E)
- Well-tested allowlist
- Monitoring in place

### 6. Safety Labels

**All SAPL PRs get labels:**
```
auto-pr       - Created by SAPL
safe          - Only safe files modified
documentation - (or tests, config, etc.)
```

**Benefits:**
- Easy to filter: `is:pr label:auto-pr`
- Branch protection rules can target these
- CODEOWNERS can auto-assign reviewers
- Statistics: how many auto-PRs created

---

## Advanced Usage

### Integration with TGT

**Seamless workflow:**

1. **TGT detects issue** → Creates task card
2. **You fix issue** → Edit files locally
3. **Click "Propose PR"** → SAPL analyzes
4. **Review preview** → Check diff
5. **Create PR** → SAPL automates git workflow
6. **Merge on GitHub** → Task auto-updates to completed

**Task-to-PR mapping:**

TGT task includes:
```json
{
  "id": "task-123",
  "title": "Update API docs",
  "suggestedFiles": ["docs/api/tasks_api.md"],
  "suggestedChanges": "Add missing endpoints..."
}
```

SAPL uses this for:
- PR title (from task title)
- PR body (from task description + evidence)
- File hints (suggested files)
- Commit message (contextual)

### Custom Allowlist Patterns

**Extend allowlist for specific needs:**

**Allow specific directories:**
```bash
AUTO_PR_ALLOW=docs/**,examples/**,fixtures/**
```

**Allow by file extension:**
```bash
AUTO_PR_ALLOW=**/*.md,**/*.example,**/*.test.js
```

**Allow specific files anywhere:**
```bash
AUTO_PR_ALLOW=README.md,**/README.md,CHANGELOG.md
```

**Complex pattern:**
```bash
AUTO_PR_ALLOW=docs/**/*.{md,txt},tests/**/*.{js,mjs},*.example,package.json
```

### Batch Operations

**Multiple tasks → Multiple PRs:**

If you have 5 doc tasks from TGT:

```bash
# For each task:
1. Fix issue
2. Propose PR via SAPL
3. Create PR

# Result: 5 separate PRs, each focused
```

**Benefits:**
- Easier to review (small, focused PRs)
- Can merge independently
- Clear audit trail per change

### API Usage (Advanced)

**Programmatic PR creation:**

```bash
# 1. Make changes
echo "## New section" >> docs/README.md

# 2. Validate files
curl -X POST http://localhost:3000/api/auto_pr/validate \
  -H "Content-Type: application/json" \
  -d '{"files": ["docs/README.md"]}'

# 3. Preview
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["docs/README.md"],
    "title": "docs: add new section",
    "body": "Adds section about...",
    "convId": "conv-123",
    "sessionId": "sess-456"
  }'

# 4. Create (if AUTO_PR_DRYRUN=0)
curl -X POST http://localhost:3000/api/auto_pr/create \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["docs/README.md"],
    "title": "docs: add new section",
    "body": "Adds section about..."
  }'
```

---

## Troubleshooting

### "SAPL is disabled"

**Error message:**
```json
{
  "ok": false,
  "error": "SAPL is disabled (AUTO_PR_ENABLED=0)"
}
```

**Cause:** `AUTO_PR_ENABLED=0` or not set

**Fix:**
1. Edit `.env`
2. Set `AUTO_PR_ENABLED=1`
3. Restart: `docker compose restart frontend`
4. Verify: `curl http://localhost:3000/api/auto_pr/status`

---

### "GitHub CLI not installed or not authenticated"

**Error:** `gh: command not found` or `gh auth status` fails

**Fix:**

```bash
# Install gh CLI
brew install gh  # macOS
# See: https://github.com/cli/cli#installation for other OSes

# Authenticate
gh auth login

# Follow prompts:
# - Choose GitHub.com
# - Protocol: HTTPS
# - Authenticate with browser or token

# Verify
gh auth status
```

---

### "No files to commit after allowlist filtering"

**Error:**
```json
{
  "ok": false,
  "error": "No files to commit after allowlist filtering",
  "files": {
    "allowed": [],
    "blocked": ["src/server.mjs", "src/app.js"]
  }
}
```

**Cause:** All files you modified are blocked by allowlist

**Fix:**

**Option A:** Only modify allowed files (docs, tests, config)

**Option B:** Extend allowlist (careful!):
```bash
# Add specific patterns to allowlist
AUTO_PR_ALLOW=docs/**,src/utils/**/*.helper.js

# Or be more permissive (not recommended)
AUTO_PR_ALLOW=**/*.md,**/*.test.js,src/**/*.js
```

**Recommendation:** Stick to docs/tests/config for SAPL. Use normal PRs for code.

---

### "Blocked files detected"

**Warning in preview:**
```
⚠️ Warning: 2 file(s) blocked by allowlist
Files: src/server.mjs, frontend/app.tsx
```

**Cause:** You modified both safe (docs) and unsafe (code) files

**Fix:**

**Option A:** Unstage/revert blocked files:
```bash
# Revert unsafe files
git checkout src/server.mjs frontend/app.tsx

# Keep only safe files
# Now propose PR again
```

**Option B:** Create two PRs:
1. SAPL PR for docs/tests
2. Manual PR for code changes

---

### Dry-run mode won't create PR

**Behavior:** "Create PR" shows preview again instead of creating

**Cause:** `AUTO_PR_DRYRUN=1` (safe default)

**Fix (if intentional):**
1. Edit `.env`
2. Set `AUTO_PR_DRYRUN=0`
3. Restart: `docker compose restart frontend`
4. **Verify allowlist is correct first!**
5. Create PR

**Fix (if unintentional):**
- Keep dry-run mode
- Use it to test and validate
- Only disable when confident

---

### PR created but not visible on GitHub

**Possible causes:**

**1. Pushed to wrong remote:**
```bash
# Check remotes
git remote -v

# Should show your fork/origin
origin  https://github.com/YOUR_USERNAME/forgekeeper.git
```

**2. Wrong repository:**
```bash
# Verify gh is authenticated to correct account
gh auth status

# Check which repo you're in
gh repo view
```

**3. Branch pushed but PR creation failed:**
```bash
# Check if branch exists on remote
gh pr list --head auto-pr/your-branch-name

# If branch exists but no PR, create manually:
gh pr create --head auto-pr/your-branch-name \
  --title "Your title" \
  --body "Your description"
```

---

### Auto-merge not working

**Behavior:** PR created but doesn't auto-merge even when CI passes

**Cause:**

**1. Auto-merge disabled (default):**
```bash
AUTO_PR_AUTOMERGE=0
```

**Fix:** Set to `1` (carefully!)

**2. Branch protection rules:**
- Required reviews not met
- Required status checks failing
- Admin privileges required

**Fix:** Update branch protection rules or use manual merge

**3. Insufficient permissions:**
```bash
gh auth status
```

Must have write access to repository

---

## API Reference

For complete API documentation, see [docs/sapl/README.md](../sapl/README.md).

**Quick reference:**

```bash
# Get SAPL status
GET /api/auto_pr/status

# Validate files against allowlist
POST /api/auto_pr/validate
Body: {"files": ["README.md", "src/app.js"]}

# Preview PR (always safe)
POST /api/auto_pr/preview
Body: {"files": [...], "title": "...", "body": "..."}

# Create PR (dry-run or execution depending on config)
POST /api/auto_pr/create
Body: {"files": [...], "title": "...", "body": "..."}

# Get current git status
GET /api/auto_pr/git/status
```

---

## Next Steps

### Master the Workflow

1. **Start with dry-run mode** (`AUTO_PR_DRYRUN=1`)
2. **Create 3-5 test PRs** for docs/tests
3. **Verify allowlist works** as expected
4. **Enable execution mode** (`AUTO_PR_DRYRUN=0`)
5. **Monitor first 10 PRs** carefully
6. **Optionally enable auto-merge** (when very confident)

### Integrate with TGT

If TGT is enabled:

1. **Let TGT run** for a few days
2. **Review generated tasks**
3. **Fix issues TGT detects**
4. **Use SAPL to create PRs** for safe fixes
5. **Watch the loop work**: TGT detects → You fix → SAPL creates PR → Merge → Done

### Advanced Configuration

Once comfortable:

- Customize allowlist for your project
- Set up CODEOWNERS for auto-pr PRs
- Create GitHub Actions for additional validation
- Add custom labels for categorization
- Track SAPL metrics (PRs created, merged, time-to-merge)

---

## Further Reading

- [SAPL Technical Reference](../sapl/README.md) - API docs, architecture, safety layers
- [TGT User Guide](TGT_USER_GUIDE.md) - Telemetry-driven task generation
- [ContextLog ADR](../contextlog/adr-0001-contextlog.md) - Audit trail format
- [GitHub CLI Docs](https://cli.github.com/manual/) - gh command reference

---

**Questions or feedback?** Open an issue on GitHub or check the [troubleshooting section](#troubleshooting).

**Last Updated:** 2025-11-14
