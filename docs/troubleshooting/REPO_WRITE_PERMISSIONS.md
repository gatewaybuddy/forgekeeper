# Repository Write Permissions - Troubleshooting Guide

## Problem: Agent Cannot Update Repository Files

**Symptom**: The autonomous agent or chat system fails to complete tasks that require updating repository files with errors like:
```
Error: path not allowed: frontend/src/components/MyComponent.tsx
```

**Root Cause**: Two issues prevent file writes:

### Issue 1: Restrictive Default Allowlist (FIXED)
The `write_repo_file` tool's default `REPO_WRITE_ALLOW` only permitted 2 files:
- `frontend/Dockerfile`
- `docker-compose.yml`

**Solution**: Expanded the allowlist in `.env` to include common development patterns.

### Issue 2: Exact String Matching Instead of Glob Patterns (FIXED)
Even with an expanded allowlist containing patterns like `docs/**/*.md`, the tool would reject files because it was using exact string matching instead of glob pattern matching.

**Solution**: Implemented proper glob matching in `frontend/tools/write_repo_file.mjs`

---

## Configuration

### Expand REPO_WRITE_ALLOW in .env

Add this to your `.env` file:

```bash
# =====================================================================
# 🔧 REPOSITORY WRITE ALLOWLIST (Local Dev)
# =====================================================================
REPO_WRITE_ALLOW=frontend/Dockerfile,docker-compose.yml,frontend/src/**/*.tsx,frontend/src/**/*.ts,frontend/src/**/*.jsx,frontend/src/**/*.js,frontend/src/**/*.mjs,frontend/src/**/*.css,frontend/src/**/*.json,frontend/tests/**/*.mjs,frontend/tests/**/*.js,frontend/tests/**/*.test.ts,frontend/tests/**/*.test.tsx,frontend/tools/**/*.mjs,frontend/core/**/*.mjs,frontend/package.json,frontend/vite.config.ts,frontend/tsconfig.json,docs/**/*.md,README.md,.env.example,forgekeeper/**/*.py,forgekeeper/**/*.mjs,scripts/**/*.sh,scripts/**/*.ps1,scripts/**/*.py,scripts/**/*.mjs,.github/**/*.yml,.github/**/*.yaml,tasks.md,CONTRIBUTING.md
```

### Restart Frontend

```bash
docker restart forgekeeper-frontend-1
```

---

## Glob Pattern Support

The `write_repo_file` tool now supports these glob patterns:

| Pattern | Meaning | Example Match |
|---------|---------|---------------|
| `*` | Any characters except `/` | `*.md` matches `README.md` |
| `**` | Zero or more path segments | `docs/**` matches `docs/api/guide.md` |
| `**/` | Zero or more directories | `docs/**/*.md` matches `docs/guide.md` and `docs/api/guide.md` |
| `/**` | Slash + anything | `src/**` matches `src/file.js` |
| Exact | Exact file path | `docker-compose.yml` matches only that file |

### Pattern Examples

```bash
# Match all markdown files in docs (any depth)
docs/**/*.md

# Match all TypeScript files in frontend/src
frontend/src/**/*.tsx
frontend/src/**/*.ts

# Match all test files
frontend/tests/**/*.mjs
frontend/tests/**/*.test.ts

# Match all Python files in forgekeeper
forgekeeper/**/*.py

# Match specific file
docker-compose.yml
```

---

## Testing

### Quick Test

Run the included test suite:

```bash
node test-repo-write-direct.mjs
```

Expected output:
```
======================================================================
🧪 DIRECT WRITE_REPO_FILE TOOL TEST
======================================================================
...
Total tests: 10
✅ Passed: 10
❌ Failed: 0

🎉 ALL TESTS PASSED!
Repository write permissions are configured correctly.
======================================================================
```

### Manual Test

Try asking the system to create a file:

```
"Create a test file at docs/TEST.md with the content 'Hello World'"
```

**Success indicators:**
- Tool call succeeds
- File appears in repository
- No "path not allowed" errors

**Failure indicators:**
- Error: "path not allowed: docs/TEST.md"
- Tool call fails
- File not created

---

## Test Results (2025-11-05)

Comprehensive testing verified all patterns work correctly:

### ✅ Allowed Patterns (Correctly Permitted)

| Pattern | Test File | Status |
|---------|-----------|--------|
| `docs/**/*.md` | `docs/TEST_WRITE_PERMISSIONS.md` | ✅ PASS |
| `frontend/src/**/*.tsx` | `frontend/src/components/TestWriteComponent.tsx` | ✅ PASS |
| `frontend/tests/**/*.mjs` | `frontend/tests/test-write-permissions.mjs` | ✅ PASS |
| `forgekeeper/**/*.py` | `forgekeeper/test_write.py` | ✅ PASS |
| `frontend/tools/**/*.mjs` | `frontend/tools/test_tool.mjs` | ✅ PASS |
| `scripts/**/*.sh` | `scripts/test-write.sh` | ✅ PASS |
| `docker-compose.yml` | `docker-compose.yml` | ✅ PASS |

### ✅ Blocked Patterns (Correctly Rejected)

| Test File | Reason | Status |
|-----------|--------|--------|
| `package.json` | Not in allowlist | ✅ BLOCKED |
| `random-file.txt` | Not in allowlist | ✅ BLOCKED |
| `../outside.txt` | Path traversal | ✅ BLOCKED |

**Pass Rate**: 10/10 (100%)

---

## Security Considerations

### What's Protected

Even with expanded permissions, the system still blocks:

1. **Path traversal**: `../outside.txt` is rejected
2. **Arbitrary files**: Files not matching any pattern are rejected
3. **Root files**: `package.json` (root) is blocked
4. **Sandbox escape**: Cannot write outside `REPO_ROOT`

### Safe for Local Development

This configuration is **SAFE** for local development because:
- ✅ All changes tracked by git
- ✅ Running in isolated Docker containers
- ✅ Not exposed to network/production
- ✅ Changes can be reviewed before commit
- ✅ Specific patterns (not unlimited access)

### ⚠️ Production Warning

**DO NOT** use this broad allowlist in production. For production:

```bash
# Minimal production allowlist (example)
REPO_WRITE_ALLOW=frontend/Dockerfile,docker-compose.yml
```

Or disable entirely:
```bash
FRONTEND_ENABLE_REPO_WRITE=0
```

---

## Technical Details

### Implementation

The glob matching logic in `frontend/tools/write_repo_file.mjs` converts glob patterns to regex:

```javascript
function matchesGlob(filePath, pattern) {
  // Normalize path separators
  const normalizedPath = filePath.split(path.sep).join('/');
  const normalizedPattern = pattern.split(path.sep).join('/');

  // Convert glob to regex
  const regexPattern = normalizedPattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*\*\//g, '(?:(?:[^/]+/)*)') // **/ = zero or more dirs
    .replace(/\/\*\*/g, '(?:/(?:.*))?') // /** = slash + anything
    .replace(/\*\*/g, '.*') // ** = anything
    .replace(/\*/g, '[^/]*'); // * = anything except /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}
```

### Related Files

- **Tool Implementation**: `frontend/tools/write_repo_file.mjs`
- **Configuration**: `.env` (REPO_WRITE_ALLOW)
- **Example Config**: `.env.example`
- **Test Suite**: `test-repo-write-direct.mjs`

### Related Commits

- `6d44e62` - config: document REPO_WRITE_ALLOW configuration in .env.example
- `7a97145` - fix(tools): add glob pattern matching to write_repo_file tool
- `9f62ce6` - test: add direct test for write_repo_file glob patterns

---

## Common Issues

### Issue: "path not allowed" even with pattern in allowlist

**Check 1**: Verify pattern is correct
```bash
# In .env, check REPO_WRITE_ALLOW contains the pattern
echo $REPO_WRITE_ALLOW | grep "docs/\*\*/\*.md"
```

**Check 2**: Restart frontend after .env changes
```bash
docker restart forgekeeper-frontend-1
```

**Check 3**: Test glob matching
```bash
node test-repo-write-direct.mjs
```

### Issue: All writes fail

**Check 1**: Verify FRONTEND_ENABLE_REPO_WRITE is enabled
```bash
# In .env
FRONTEND_ENABLE_REPO_WRITE=1
```

**Check 2**: Check Docker environment
```bash
docker exec forgekeeper-frontend-1 printenv | grep REPO_WRITE
```

### Issue: Path traversal not blocked

**This is a critical security issue** - the tool should ALWAYS block paths like `../outside.txt`

**Verify**:
```bash
# Should see "path not allowed" error
node test-repo-write-direct.mjs | grep "../outside.txt"
```

If path traversal is not blocked, **do not use the tool** and report the bug.

---

## Verification Checklist

Before considering the issue resolved:

- [ ] `.env` contains expanded `REPO_WRITE_ALLOW`
- [ ] Frontend container restarted
- [ ] Test suite passes (10/10 tests)
- [ ] Manual file creation works
- [ ] Path traversal is blocked
- [ ] Arbitrary files are blocked
- [ ] Git tracks all changes

---

## Support

If issues persist:

1. Run the test suite: `node test-repo-write-direct.mjs`
2. Check logs: `/api/ctx/tail.json?n=1000`
3. Verify environment: `docker exec forgekeeper-frontend-1 printenv | grep REPO`
4. Review commits: `git log --oneline --grep="write_repo_file"`

---

**Last Updated**: 2025-11-05
**Test Status**: ✅ All tests passing (10/10)
**Version**: 1.0.0
