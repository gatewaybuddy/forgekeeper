# Release Process Guide

**How to create and publish Forgekeeper releases.**

This guide explains the automated release workflow for Forgekeeper maintainers.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Creating a Release](#creating-a-release)
- [Versioning Scheme](#versioning-scheme)
- [Release Workflow](#release-workflow)
- [Rollback Procedure](#rollback-procedure)
- [Troubleshooting](#troubleshooting)

---

## Overview

Forgekeeper uses an automated release workflow that:
- Triggers on version tags (`v*`)
- Runs full test suite
- Builds frontend and packages artifacts
- Creates GitHub release with changelog
- Publishes Docker images to GitHub Container Registry
- Generates release notes automatically

---

## Prerequisites

**Permissions required:**
- Write access to the repository
- Ability to push tags
- GitHub Container Registry access (automatic for repo collaborators)

**Local setup:**
```bash
# Ensure you're on main branch and up to date
git checkout main
git pull origin main

# Verify tests pass locally
npm --prefix forgekeeper/frontend run test
pytest tests/
```

---

## Creating a Release

### Method 1: Tag-Based Release (Recommended)

**Step 1: Choose version number**

Follow [semantic versioning](https://semver.org/):
- **Major** (v2.0.0): Breaking changes
- **Minor** (v1.1.0): New features, backwards compatible
- **Patch** (v1.0.1): Bug fixes, backwards compatible
- **Pre-release** (v1.0.0-beta.1): Testing releases

**Step 2: Update version in files (if applicable)**

```bash
# Update package.json if version is tracked there
nano forgekeeper/frontend/package.json
# Change "version": "1.0.0" to new version

# Update pyproject.toml if version is tracked there
nano forgekeeper/pyproject.toml
# Change version = "1.0.0" to new version
```

**Step 3: Commit version bumps (if made changes)**

```bash
git add forgekeeper/frontend/package.json forgekeeper/pyproject.toml
git commit -m "chore: bump version to v1.1.0"
git push origin main
```

**Step 4: Create and push tag**

```bash
# Create annotated tag
git tag -a v1.1.0 -m "Release v1.1.0: Add TGT and SAPL features"

# Push tag to trigger release workflow
git push origin v1.1.0
```

**Step 5: Monitor workflow**

1. Go to https://github.com/gatewaybuddy/forgekeeper/actions
2. Watch the "Release" workflow
3. Wait for all jobs to complete (~5-10 minutes)

**Step 6: Verify release**

1. Check https://github.com/gatewaybuddy/forgekeeper/releases
2. Verify release notes are generated
3. Verify Docker images are published

### Method 2: Manual Workflow Dispatch

**Use when:** You want to create a release without pushing a tag

**Steps:**
1. Go to https://github.com/gatewaybuddy/forgekeeper/actions
2. Select "Release" workflow
3. Click "Run workflow"
4. Enter version tag (e.g., `v1.1.0`)
5. Click "Run workflow"

---

## Versioning Scheme

### Semantic Versioning

Format: `vMAJOR.MINOR.PATCH[-PRERELEASE]`

**Examples:**
- `v1.0.0` - Major release
- `v1.1.0` - Minor update (new features)
- `v1.0.1` - Patch (bug fixes)
- `v1.0.0-beta.1` - Pre-release
- `v2.0.0-rc.1` - Release candidate

### When to Bump

**Major (v1.0.0 → v2.0.0):**
- Breaking API changes
- Removed features
- Incompatible database migrations
- Changed configuration format

**Minor (v1.0.0 → v1.1.0):**
- New features (TGT, SAPL, new tools)
- New API endpoints
- Enhanced functionality
- Backwards compatible changes

**Patch (v1.0.0 → v1.0.1):**
- Bug fixes
- Security patches
- Documentation updates
- Performance improvements (non-breaking)

**Pre-release (v1.1.0-beta.1):**
- Testing new features
- Release candidates
- Alpha/beta versions

---

## Release Workflow

### Workflow Jobs

#### 1. Validate
**What it does:**
- Extracts version from tag or input
- Validates version format (must match `v1.2.3` pattern)
- Fails fast if version is invalid

**Outputs:**
- `version`: Validated version string

#### 2. Build and Test
**What it does:**
- Runs in parallel for frontend and Python
- **Frontend**: typecheck, lint, build, test
- **Python**: install deps, run pytest
- Uploads frontend build artifacts

**Duration:** ~3-5 minutes

#### 3. Create Release
**What it does:**
- Generates changelog from git commits since last tag
- Creates installation instructions
- Links to documentation
- Creates GitHub release with:
  * Tag name
  * Generated release notes
  * CHANGELOG.txt artifact
  * Draft status (false for stable, true for pre-release)

**Changelog format:**
```markdown
# Release v1.1.0

## What's Changed

- feat(tgt): add telemetry-driven task generation
- feat(sapl): add safe auto-PR loop
- docs: add user guides for TGT and SAPL
- fix: resolve memory leak in thought-world sessions

## Installation

### Docker (Recommended)
...

### Manual
...

## Documentation

- README
- Quickstart Guide
- Contributing Guide
- TGT User Guide
- SAPL User Guide

**Full Changelog**: https://github.com/gatewaybuddy/forgekeeper/compare/v1.0.0...v1.1.0
```

#### 4. Build Docker
**What it does:**
- Builds frontend Docker image
- Pushes to GitHub Container Registry (ghcr.io)
- Tags with:
  * Exact version (e.g., `1.1.0`)
  * Major.minor (e.g., `1.1`)
  * Major (e.g., `1`)
  * `latest`
- Builds for multiple platforms (amd64, arm64)
- **Skipped for pre-releases** (beta, rc, alpha)

**Duration:** ~5-8 minutes

**Image location:**
```
ghcr.io/gatewaybuddy/forgekeeper/frontend:1.1.0
ghcr.io/gatewaybuddy/forgekeeper/frontend:1.1
ghcr.io/gatewaybuddy/forgekeeper/frontend:1
ghcr.io/gatewaybuddy/forgekeeper/frontend:latest
```

#### 5. Notify
**What it does:**
- Posts summary to workflow run
- Success: Links to release
- Failure: Points to logs

---

## Release Checklist

Before creating a release, verify:

- [ ] All tests pass locally (`npm run test`, `pytest tests/`)
- [ ] CHANGELOG or commit messages describe changes
- [ ] Breaking changes documented in commit messages or PR
- [ ] Version number follows semantic versioning
- [ ] Documentation updated for new features
- [ ] No critical known bugs in main branch
- [ ] Docker compose configuration works
- [ ] Frontend builds successfully (`npm run build`)

After release created:

- [ ] Verify release notes are accurate
- [ ] Test Docker image installation
- [ ] Verify documentation links work
- [ ] Announce release (if major/minor)
- [ ] Update any dependent projects

---

## Rollback Procedure

If a release has critical issues:

### Option 1: Delete Release and Tag (Before Users Install)

```bash
# Delete GitHub release (via UI or gh CLI)
gh release delete v1.1.0 --yes

# Delete local tag
git tag -d v1.1.0

# Delete remote tag
git push origin :refs/tags/v1.1.0

# Delete Docker images (if published)
# Go to: https://github.com/gatewaybuddy/forgekeeper/pkgs/container/forgekeeper%2Ffrontend
# Delete the version tag manually
```

### Option 2: Create Hotfix Release (If Users Already Installed)

```bash
# Create fix on main
git checkout main
git pull origin main

# Make fixes, commit
git add .
git commit -m "fix: critical issue in v1.1.0"
git push origin main

# Create patch release
git tag -a v1.1.1 -m "Hotfix: critical issue from v1.1.0"
git push origin v1.1.1

# Update v1.1.0 release notes with warning
# Edit release on GitHub, add:
# "⚠️ This release has a critical issue. Please upgrade to v1.1.1"
```

### Option 3: Mark Release as Pre-release

If not critical but not production-ready:

1. Go to https://github.com/gatewaybuddy/forgekeeper/releases
2. Edit the release
3. Check "Set as a pre-release"
4. Update description with warning
5. Create new stable release when ready

---

## Troubleshooting

### Workflow Fails on Validation

**Error:** `Invalid version format 'v1.1'`

**Cause:** Version doesn't match required format

**Fix:**
```bash
# Delete bad tag
git tag -d v1.1
git push origin :refs/tags/v1.1

# Create correct tag
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

### Tests Fail During Release

**Error:** Tests pass locally but fail in CI

**Cause:** Environment differences, missing dependencies

**Fix:**
1. Check workflow logs for specific test failures
2. Run tests with same Node/Python versions as CI
3. Fix failing tests
4. Delete release and tag
5. Fix on main, create new tag

### Docker Build Fails

**Error:** `failed to solve: failed to compute cache key`

**Cause:** Missing Dockerfile or build context issues

**Fix:**
1. Verify `forgekeeper/frontend/Dockerfile` exists
2. Check Docker build locally:
   ```bash
   cd forgekeeper/frontend
   docker build -t test-build .
   ```
3. Fix Dockerfile issues
4. Delete release and retry

### Docker Push Permission Denied

**Error:** `denied: permission_denied`

**Cause:** Insufficient permissions to push to ghcr.io

**Fix:**
1. Verify you're a repository collaborator
2. Check GitHub Package settings allow writes
3. Re-run workflow (sometimes transient)

### Changelog Empty or Incorrect

**Error:** Changelog shows no changes or wrong commits

**Cause:** Git history issues, incorrect tag range

**Fix:**
1. Verify previous tag exists: `git tag -l`
2. Manually generate changelog:
   ```bash
   git log v1.0.0..v1.1.0 --pretty=format:"- %s" --no-merges
   ```
3. Edit release notes manually on GitHub

### Release Created but Docker Skipped

**Behavior:** Release exists but no Docker images

**Cause:** Pre-release version (contains `-`)

**Explanation:** Docker build skips pre-releases automatically

**Fix:** If Docker images needed for pre-release:
1. Edit `.github/workflows/release.yml`
2. Remove `if: ${{ !contains(needs.validate.outputs.version, '-') }}`
3. Re-run workflow or create new tag

---

## Advanced: Pre-releases

### Beta Releases

```bash
# First beta
git tag -a v1.2.0-beta.1 -m "Beta 1 for v1.2.0"
git push origin v1.2.0-beta.1

# Second beta (after fixes)
git tag -a v1.2.0-beta.2 -m "Beta 2 for v1.2.0"
git push origin v1.2.0-beta.2

# Release candidate
git tag -a v1.2.0-rc.1 -m "Release candidate 1 for v1.2.0"
git push origin v1.2.0-rc.1

# Final release
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

**Notes:**
- Pre-releases are marked as such on GitHub
- Docker images are **not built** for pre-releases
- Users must opt-in to install pre-releases

---

## FAQ

**Q: Can I create a release from a branch other than main?**

A: No, the workflow assumes releases are from main. For testing, use pre-release versions on main.

**Q: How do I create a release for a hotfix branch?**

A: Merge hotfix to main first, then create tag from main. Or modify workflow to support branches.

**Q: What if I need to rebuild Docker images for an existing release?**

A: Re-run the "Build Docker" job from the Actions UI, or delete and recreate the tag.

**Q: Can I edit release notes after creation?**

A: Yes, go to the release on GitHub and click "Edit". Manual edits won't be overwritten.

**Q: How do I test the release workflow without creating a real release?**

A: Use a test tag like `v0.0.1-test.1` and delete it after. Or use workflow_dispatch with a test version.

---

## References

- [Semantic Versioning](https://semver.org/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Actions](https://docs.github.com/en/actions)

---

**Questions or issues?** Open an issue on GitHub.

**Last Updated:** 2025-11-14
