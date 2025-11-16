# SAPL (Safe Auto-PR Loop)

**Status**: ✅ Implemented
**Priority**: High
**Date**: 2025-11-04

**📖 New to SAPL?** See the **[SAPL User Guide](../guides/SAPL_USER_GUIDE.md)** for practical examples and how-to instructions.

This document is the technical/API reference. For usage instructions, start with the user guide.

---

## Overview

SAPL (Safe Auto-PR Loop) enables **safe, automated PR creation** from TGT task suggestions. It provides:

- **Allowlist-based safety**: Only docs, config, and tests can be modified
- **Dry-run preview**: See exactly what will change before creating PR
- **Full audit trail**: Every action logged to ContextLog
- **Kill-switch**: Disable instantly via environment variable
- **Optional auto-merge**: Merge when CI passes (disabled by default)

---

## Quick Start

### 1. Enable SAPL

```bash
# In .env
AUTO_PR_ENABLED=1           # Enable SAPL
AUTO_PR_DRYRUN=1            # Dry-run mode (default - safe)
AUTO_PR_AUTOMERGE=0         # No auto-merge (default - safe)
```

### 2. Install gh CLI

```bash
# macOS
brew install gh

# Linux
# See: https://github.com/cli/cli#installation

# Authenticate
gh auth login
```

### 3. Test Preview (Always Safe)

```bash
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["README.md", "docs/test.md"],
    "title": "docs: update documentation",
    "body": "Auto-generated documentation update from TGT task"
  }'
```

### 4. Create PR (Dry-Run First)

With `AUTO_PR_DRYRUN=1` (default), this returns a preview:

```bash
curl -X POST http://localhost:3000/api/auto_pr/create \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["README.md"],
    "title": "docs: update README",
    "body": "Auto-generated update"
  }'
```

To actually create the PR, set `AUTO_PR_DRYRUN=0`.

---

## Architecture

### Safety Layers

1. **Allowlist Filtering**
   - Only safe file patterns allowed
   - Blocked files rejected before any git operations
   - Default allowlist: docs, config files, tests only

2. **Dry-Run Mode (Default)**
   - Preview shows exactly what will change
   - No git operations until explicitly enabled
   - Returns diff, file list, commit message

3. **ContextLog Audit**
   - Every PR creation logged
   - Includes files, branch, PR URL, timestamp
   - Queryable via `/api/ctx/tail`

4. **Kill-Switch**
   - Set `AUTO_PR_ENABLED=0` to disable instantly
   - All endpoints return error when disabled
   - No git operations when disabled

---

## API Reference

### GET /api/auto_pr/status

Get SAPL configuration and status.

**Response**:
```json
{
  "ok": true,
  "enabled": true,
  "dryRun": true,
  "allowlist": [
    "README.md",
    "docs/**/*.md",
    "*.example",
    "tests/**/*.mjs"
  ],
  "labels": ["auto-pr", "safe", "documentation"],
  "autoMerge": false
}
```

---

### POST /api/auto_pr/preview

Preview PR creation (always safe, no git operations).

**Request**:
```json
{
  "files": ["README.md", "docs/api/new-api.md"],
  "title": "docs: add new API documentation",
  "body": "Auto-generated from TGT task #123"
}
```

**Response**:
```json
{
  "ok": true,
  "preview": {
    "previewId": "01HQXYZ...",
    "dryRun": true,
    "enabled": true,
    "currentBranch": "main",
    "proposedBranch": "auto-pr/add-new-api-documentation-2025-11-04T12-34-56",
    "title": "docs: add new API documentation",
    "body": "Auto-generated from TGT task #123",
    "labels": ["auto-pr", "safe", "documentation"],
    "files": {
      "total": 2,
      "allowed": 2,
      "blocked": 0,
      "allowedFiles": ["README.md", "docs/api/new-api.md"],
      "blockedFiles": []
    },
    "diffs": {
      "README.md": "diff --git a/README.md b/README.md\n...",
      "docs/api/new-api.md": "diff --git a/docs/api/new-api.md b/docs/api/new-api.md\n..."
    },
    "stats": {
      "filesChanged": 2,
      "linesAdded": 120,
      "linesRemoved": 5
    },
    "allowlist": ["README.md", "docs/**/*.md", ...],
    "autoMerge": false,
    "warnings": []
  }
}
```

**Warnings**:
```json
{
  "warnings": [
    {
      "type": "blocked_files",
      "message": "2 file(s) blocked by allowlist",
      "files": ["src/server.mjs", "src/config.js"]
    },
    {
      "type": "disabled",
      "message": "SAPL is disabled (AUTO_PR_ENABLED=0)"
    },
    {
      "type": "no_files",
      "message": "No files to commit after allowlist filtering"
    }
  ]
}
```

---

### POST /api/auto_pr/create

Create PR (requires `AUTO_PR_ENABLED=1` and `AUTO_PR_DRYRUN=0`).

**Request**:
```json
{
  "files": ["README.md"],
  "title": "docs: update README",
  "body": "Auto-generated documentation update",
  "convId": "conv-123",
  "turnId": "turn-456",
  "sessionId": "sess-789"
}
```

**Response (Dry-Run Mode)**:
Returns same as `/api/auto_pr/preview`

**Response (Execution Mode)**:
```json
{
  "ok": true,
  "executionId": "01HQXYZ...",
  "branch": "auto-pr/update-readme-2025-11-04T12-34-56",
  "prUrl": "https://github.com/username/repo/pull/123",
  "steps": [
    { "step": "create_branch", "ok": true, "branch": "auto-pr/..." },
    { "step": "stage_files", "ok": true, "staged": 1 },
    { "step": "create_commit", "ok": true },
    { "step": "push_branch", "ok": true },
    { "step": "create_pr", "ok": true, "url": "https://..." },
    { "step": "enable_automerge", "ok": true }
  ],
  "files": {
    "allowed": ["README.md"],
    "blocked": []
  }
}
```

**Response (Error)**:
```json
{
  "ok": false,
  "error": "SAPL is disabled (AUTO_PR_ENABLED=0)",
  "executionId": "01HQXYZ..."
}
```

---

### GET /api/auto_pr/git/status

Get current git status (modified/untracked files).

**Response**:
```json
{
  "ok": true,
  "files": [
    {
      "path": "README.md",
      "staged": false,
      "unstaged": true,
      "untracked": false
    },
    {
      "path": "docs/new-file.md",
      "staged": false,
      "unstaged": false,
      "untracked": true
    }
  ]
}
```

---

### POST /api/auto_pr/validate

Validate files against allowlist (before creating PR).

**Request**:
```json
{
  "files": ["README.md", "src/server.mjs", "docs/api.md"]
}
```

**Response**:
```json
{
  "ok": true,
  "allowed": ["README.md", "docs/api.md"],
  "blocked": ["src/server.mjs"]
}
```

---

## Environment Variables

### Required

- **`AUTO_PR_ENABLED`** (default: `0`)
  - Set to `1` to enable SAPL
  - Kill-switch: set to `0` to disable instantly

### Safety Controls

- **`AUTO_PR_DRYRUN`** (default: `1`)
  - `1` = Dry-run mode (preview only, no git operations)
  - `0` = Execution mode (creates actual PRs)
  - **Recommendation**: Keep at `1` until tested

- **`AUTO_PR_AUTOMERGE`** (default: `0`)
  - `1` = Auto-merge when CI passes
  - `0` = Manual merge required
  - **Recommendation**: Keep at `0` for safety

### Configuration

- **`AUTO_PR_ALLOW`** (default: see below)
  - Comma-separated file patterns
  - Example: `README.md,docs/**/*.md,*.example`
  - Default: `README.md,docs/**/*.md,forgekeeper/.env.example,frontend/test/**/*.mjs`

- **`AUTO_PR_LABELS`** (default: `auto-pr,safe,documentation`)
  - Comma-separated PR labels
  - Applied to all auto-created PRs

---

## Default Allowlist

Safe file patterns (runtime code excluded):

```javascript
[
  'README.md',
  'docs/**/*.md',                  // All markdown in docs
  'forgekeeper/.env.example',      // Example env files
  'frontend/.env.example',
  '.env.example',
  'frontend/test/**/*.mjs',        // Test files
  'frontend/tests/**/*.mjs',
  'tests/**/*.mjs',
  'frontend/**/*.test.mjs',
  'frontend/**/*.spec.mjs',
  'package.json',                  // Package metadata
  'frontend/package.json',
  'tsconfig.json',                 // Config files
  'frontend/tsconfig.json',
]
```

**Pattern Matching**:
- `**` = Match any directory depth
- `*` = Match any characters except `/`
- `?` = Match single character

---

## Usage Examples

### Example 1: Update Documentation from TGT Task

```bash
# 1. Get TGT task suggestion
curl http://localhost:3000/api/tasks/suggest

# 2. Extract task details
# Task: "Update API documentation for /api/tasks endpoint"

# 3. Preview PR (always safe)
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["docs/api/tasks_api.md"],
    "title": "docs: update tasks API documentation",
    "body": "TGT suggested update based on recent code changes"
  }'

# 4. Review preview output

# 5. Create PR (if AUTO_PR_DRYRUN=0)
curl -X POST http://localhost:3000/api/auto_pr/create \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["docs/api/tasks_api.md"],
    "title": "docs: update tasks API documentation",
    "body": "TGT suggested update based on recent code changes"
  }'
```

---

### Example 2: Blocked Files Detection

```bash
# Attempt to modify runtime code (will be blocked)
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["src/server.mjs", "README.md"],
    "title": "fix: update server",
    "body": "Some changes"
  }'

# Response includes warnings:
{
  "preview": {
    "files": {
      "total": 2,
      "allowed": 1,
      "blocked": 1,
      "allowedFiles": ["README.md"],
      "blockedFiles": ["src/server.mjs"]
    },
    "warnings": [
      {
        "type": "blocked_files",
        "message": "1 file(s) blocked by allowlist",
        "files": ["src/server.mjs"]
      }
    ]
  }
}
```

---

### Example 3: Validate Before Creating

```bash
# Check which files are allowed BEFORE creating PR
curl -X POST http://localhost:3000/api/auto_pr/validate \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      "README.md",
      "docs/api.md",
      "src/server.mjs",
      "tests/test.mjs"
    ]
  }'

# Response:
{
  "ok": true,
  "allowed": ["README.md", "docs/api.md", "tests/test.mjs"],
  "blocked": ["src/server.mjs"]
}
```

---

## ContextLog Audit Events

Every PR creation is logged to ContextLog:

```json
{
  "id": "01HQXYZ...",
  "ts": "2025-11-04T12:34:56.789Z",
  "actor": "system",
  "act": "auto_pr",
  "conv_id": "conv-123",
  "files_total": 3,
  "files_allowed": 2,
  "files_blocked": 1,
  "branch": "auto-pr/update-docs-2025-11-04T12-34-56",
  "title": "docs: update documentation",
  "pr_url": "https://github.com/username/repo/pull/123",
  "auto_merge": false,
  "dry_run": false,
  "status": "success"
}
```

Query via:
```bash
curl 'http://localhost:3000/api/ctx/tail?n=50&act=auto_pr'
```

---

## Integration with TGT

SAPL is designed to work seamlessly with TGT (Telemetry-Driven Task Generation):

### Flow: TGT → SAPL → PR

1. **TGT generates task**:
   ```json
   {
     "id": "task-123",
     "type": "docs-gap",
     "title": "Update API documentation for /api/tasks",
     "suggestedFiles": ["docs/api/tasks_api.md"],
     "suggestedChanges": "Add missing endpoints..."
   }
   ```

2. **User clicks "Propose PR" in UI**:
   - UI calls `/api/auto_pr/preview`
   - Shows diff, file list, warnings

3. **User reviews preview**:
   - Checks allowed/blocked files
   - Reviews diff
   - Confirms commit message

4. **User clicks "Create PR"**:
   - UI calls `/api/auto_pr/create`
   - SAPL creates branch, commits, pushes, opens PR
   - Returns PR URL

5. **PR created**:
   - Labels: `auto-pr`, `safe`, `documentation`
   - Branch: `auto-pr/update-api-documentation-2025-11-04T12-34-56`
   - Auto-merge: Disabled (default)

---

## Safety Guarantees

### What SAPL Will NEVER Do

- ❌ Modify runtime code (src/, lib/, server files)
- ❌ Delete files
- ❌ Modify dependencies without review
- ❌ Run when `AUTO_PR_ENABLED=0`
- ❌ Auto-merge when `AUTO_PR_AUTOMERGE=0`
- ❌ Skip allowlist validation

### What SAPL ALWAYS Does

- ✅ Validate files against allowlist BEFORE any git operation
- ✅ Log every action to ContextLog
- ✅ Return preview in dry-run mode
- ✅ Create descriptive branch names
- ✅ Include "Generated with SAPL" in commit messages
- ✅ Apply safety labels to PRs

---

## Troubleshooting

### Error: "SAPL is disabled"

**Cause**: `AUTO_PR_ENABLED=0` or not set

**Fix**: Set `AUTO_PR_ENABLED=1` in `.env`

---

### Error: "gh CLI not installed"

**Cause**: GitHub CLI not available

**Fix**:
```bash
# macOS
brew install gh

# Linux
# See: https://github.com/cli/cli#installation

# Verify
gh --version
```

---

### Error: "No files to commit after allowlist filtering"

**Cause**: All requested files blocked by allowlist

**Fix**:
- Only request safe files (docs, config, tests)
- Or extend allowlist via `AUTO_PR_ALLOW`

---

### Warning: "N file(s) blocked by allowlist"

**Cause**: Some files are not in allowlist

**Action**: Review blocked files list, remove unsafe files from request

---

## Testing

### Unit Tests

```bash
npm test -- server.auto-pr.test.mjs
```

### Manual Testing

```bash
# 1. Check status
curl http://localhost:3000/api/auto_pr/status

# 2. Validate files
curl -X POST http://localhost:3000/api/auto_pr/validate \
  -H "Content-Type: application/json" \
  -d '{"files": ["README.md", "src/server.mjs"]}'

# 3. Preview (always safe)
curl -X POST http://localhost:3000/api/auto_pr/preview \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["README.md"],
    "title": "test: SAPL preview",
    "body": "Testing SAPL preview mode"
  }'

# 4. Git status
curl http://localhost:3000/api/auto_pr/git/status
```

---

## Configuration Examples

### Development (Safe)

```bash
AUTO_PR_ENABLED=1
AUTO_PR_DRYRUN=1           # Preview only
AUTO_PR_AUTOMERGE=0         # No auto-merge
AUTO_PR_LABELS=auto-pr,safe,docs
```

### Production (With Auto-Merge)

```bash
AUTO_PR_ENABLED=1
AUTO_PR_DRYRUN=0           # Execution mode
AUTO_PR_AUTOMERGE=1         # Auto-merge when CI passes
AUTO_PR_LABELS=auto-pr,safe,automated
AUTO_PR_ALLOW=README.md,docs/**/*.md,tests/**/*.mjs
```

### Custom Allowlist

```bash
AUTO_PR_ENABLED=1
AUTO_PR_ALLOW=README.md,docs/**,CHANGELOG.md,package.json,.env.example
```

---

## Future Enhancements

### Planned

- [ ] UI component for PR preview
- [ ] TGT integration (one-click "Create PR" button)
- [ ] Diff visualization in UI
- [ ] Rollback capability
- [ ] PR template support
- [ ] Multi-file diff preview

### Under Consideration

- [ ] Smart commit message generation from TGT task
- [ ] File conflict detection
- [ ] Branch cleanup after merge
- [ ] Statistics dashboard (PRs created, merged, rejected)

---

## References

- **Implementation**: `frontend/server.auto-pr.mjs`
- **API Routes**: `frontend/server.mjs` (lines 2490-2588)
- **Self-Improvement Plan**: `docs/planning/self_improvement_plan.md`
- **TGT Integration**: `docs/autonomous/tgt/README.md`

---

**Status**: ✅ Backend Complete
**Next**: UI components (TasksDrawer integration)
**Last Updated**: 2025-11-04
