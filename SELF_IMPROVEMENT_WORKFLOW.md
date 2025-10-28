# Self-Improvement Workflow

The AI can now modify its own codebase, commit changes, and restart itself to implement improvements.

## Summary of Changes

### Tools Analysis
**Status**: ✅ Tools work correctly

- Model produces proper `<tool_call>{"name":"...","arguments":{...}}</tool_call>` XML format
- Frontend orchestrator correctly parses and executes tool calls
- Test confirmed tool usage works end-to-end

### New Capabilities Added

#### 1. Git Tools (6 tools)

**git_status** - Check repository status
```json
{
  "repo_path": "/workspace"  // optional, defaults to current directory
}
```

**git_diff** - View changes
```json
{
  "repo_path": "/workspace",  // optional
  "file_path": "frontend/server.mjs"  // optional, specific file
}
```

**git_add** - Stage files for commit
```json
{
  "repo_path": "/workspace",  // optional
  "files": ["."]  // required; use ["."] to stage all
}
```

**git_commit** - Create commit
```json
{
  "repo_path": "/workspace",  // optional
  "message": "feat: add self-improvement capabilities"  // required
}
```

**git_push** - Push to remote
```json
{
  "repo_path": "/workspace",  // optional
  "remote": "origin",  // optional, defaults to "origin"
  "branch": "main"  // optional, pushes current branch if not specified
}
```

**git_pull** - Pull from remote
```json
{
  "repo_path": "/workspace",  // optional
  "remote": "origin",  // optional
  "branch": "main"  // optional
}
```

#### 2. Restart Tool

**restart_frontend** - Restart container to reload code changes
```json
{}  // no parameters
```

## Self-Improvement Workflow

### Example: Fix a bug and deploy

1. **Analyze the Issue**
   ```
   User: "The reasoning box is empty. Can you investigate and fix it?"
   ```

2. **Check Current State**
   - Use `git_status` to see modified files
   - Use `read_file` to examine relevant code
   - Use `git_diff` to see what changed

3. **Make Changes**
   - Use `write_repo_file` to update code files
   - Make incremental, focused changes
   - Verify changes with `read_file`

4. **Test Locally** (optional)
   - Use `run_bash` to run tests
   - Verify the change works

5. **Commit Changes**
   ```
   git_add: {"files": ["."]}
   git_commit: {"message": "fix(frontend): improve reasoning box display logic"}
   ```

6. **Deploy Changes**
   ```
   restart_frontend: {}
   ```

   Wait ~10 seconds for container to restart.

7. **Push to Remote** (optional)
   ```
   git_push: {"remote": "origin"}
   ```

## Example Prompts

### Simple improvement
```
"I notice the tool usage documentation is outdated.
Please update CLAUDE.md with the new git tools and restart tool,
then commit and push your changes."
```

### Complex feature addition
```
"Add a new tool called 'run_tests' that executes pytest in the backend.
1. Create the tool file
2. Register it in tools/index.mjs
3. Test it works
4. Commit your changes
5. Restart the frontend
6. Push to the repo"
```

### Self-directed improvement
```
"Review your own tool implementations and identify opportunities for improvement.
Make 2-3 small improvements, test them, commit, and restart."
```

## Safety Guidelines

### What the AI Can Do
✅ Read any file in the repository
✅ Modify files via `write_repo_file` (allowlisted paths)
✅ Create git commits
✅ Push to configured remote (requires credentials)
✅ Restart the frontend container
✅ Run bash commands in the container

### What the AI Should NOT Do
❌ Force push to main/master
❌ Delete files without user confirmation
❌ Modify .env secrets
❌ Bypass security restrictions
❌ Make breaking changes without discussion

### Recommended Practices
1. **Make small, focused changes** - Easier to review and revert
2. **Test before committing** - Use `run_bash` to verify
3. **Write clear commit messages** - Follow conventional commits format
4. **Ask before major changes** - Get user approval for architecture changes
5. **Document as you go** - Update docs when adding features

## Current Configuration

### Repository Setup
- **Location**: `/workspace` (bind-mounted from host)
- **Git remote**: Configured (check with `git_status`)
- **Branch**: Check current with `git_status`

### Tool Permissions
- All git tools: ✅ Enabled
- Bash tool: ✅ Enabled (FRONTEND_ENABLE_BASH=1)
- PowerShell tool: ✅ Enabled (FRONTEND_ENABLE_POWERSHELL=1)
- Repo write: ✅ Enabled (FRONTEND_ENABLE_REPO_WRITE=1)

### Container Setup
- Frontend runs in Docker container
- Tools directory is bind-mounted (changes persist immediately)
- Server files need container restart to reload
- Restart takes ~10 seconds

## Troubleshooting

### "Permission denied" on git push
- Check git credentials are configured in container
- May need to use SSH keys or personal access token
- Test with: `run_bash: {"script": "git push --dry-run"}`

### Changes not taking effect
- Did you restart the container? `restart_frontend: {}`
- Check if file is bind-mounted or baked into image
- Bind-mounted: `tools/*.mjs` (immediate effect)
- Image-baked: `server*.mjs` (needs restart)

### Git conflicts
- Use `git_status` to see conflicts
- Resolve manually or ask user for guidance
- Can use `git_diff` to see conflict markers

### Tool not found after adding
- Verify it's registered in `tools/index.mjs`
- Restart frontend: `restart_frontend: {}`
- Check `/api/tools` endpoint to confirm it loaded

## Architecture Notes

### How Tools Work

1. **Tool Definition** (`frontend/tools/*.mjs`)
   - Export `def` object with OpenAI tool schema
   - Export `run(args)` function with implementation

2. **Registration** (`frontend/tools/index.mjs`)
   - Import tool module
   - Add to `TOOL_DEFS` array
   - Add to `REGISTRY` map

3. **Orchestration** (`frontend/server.orchestrator.mjs`)
   - Harmony protocol expects XML format:
     `<tool_call>{"name":"tool_name","arguments":{...}}</tool_call>`
   - Server parses tool calls, executes them, returns results
   - Model produces final answer after seeing results

4. **Execution** (`frontend/server.tools.mjs`)
   - Loads tools dynamically or from static import
   - Enforces TOOL_ALLOW allowlist if set
   - Returns results to orchestrator

### File Organization
```
frontend/
├── tools/
│   ├── index.mjs           # Tool registry
│   ├── git_status.mjs      # Git tools
│   ├── git_diff.mjs
│   ├── git_add.mjs
│   ├── git_commit.mjs
│   ├── git_push.mjs
│   ├── git_pull.mjs
│   ├── restart_frontend.mjs
│   └── ...
├── server.mjs               # Main server
├── server.orchestrator.mjs  # Tool orchestration
├── server.tools.mjs         # Tool loading
└── server.harmony.mjs       # Harmony protocol

forgekeeper/
└── __main__.py              # Python CLI
```

## Next Steps

Potential enhancements:
1. Add `git_clone` tool for cloning external repos
2. Add `git_branch` tool for branch management
3. Add `run_tests` tool for automated testing
4. Add `create_pr` tool using GitHub API
5. Add safeguards (dry-run mode, approval gates)
6. Add rollback capability (revert last N commits)

## Testing

To verify the workflow works:

```bash
# In the UI, ask the AI:
"Check the git status of the repository and show me what files have changed."

# Then ask it to make a small improvement:
"Add a comment to the top of frontend/server.mjs explaining what it does,
then commit the change with message 'docs: add server.mjs overview comment'."

# Verify it worked:
"Show me the git log to confirm the commit was created."
```

---

**Last Updated**: 2025-10-24
**Status**: Fully functional, tested end-to-end
