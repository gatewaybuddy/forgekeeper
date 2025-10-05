Option 2: PR Workflow (Workfile)
--------------------------------

Goal
- Allow the LLM (via server tools) to propose edits to the repository and open a GitHub PR for review.

High-level steps
1) Mount repo into frontend container (read/write):
   - compose: `- ./:/workspace:rw`
   - env: `TOOLS_FS_ROOT=/workspace`
2) Add tools (gated):
   - `write_repo_file(path, content)` — validate path under `/workspace`; size‑cap; create/overwrite.
   - `run_tests()` — spawn a configured test command (timeout, output truncation).
   - `git_commit(message)` — commit staged changes under a feature branch.
   - `git_push(branch)` — push to origin.
   - `gh_pr_create(base)` — create PR via GitHub CLI (preconfigured token).
3) Add allowlist + audit:
   - `TOOL_ALLOW=write_repo_file,run_tests,git_commit,git_push,gh_pr_create`
   - Append JSONL to `.forgekeeper/tools_audit.jsonl` with `{ ts, name, args, iter }`.
4) UI affordance (optional):
   - “Propose PR” button to show a diff preview and confirm.

Security
- Never expose `gh` token in logs; validate branch names; sanitize commit messages.
- Consider running tools under a non‑root user and read_only filesystem with explicit writable mounts.

Status
- Deferred. Implement Option 1 first (dynamic tools reloader). Re‑use the same audit and allowlist patterns.

