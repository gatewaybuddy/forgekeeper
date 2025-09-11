GitHub CLI Setup

This project can create draft PRs automatically after pushing a branch when `AUTO_PR=true`.

Requirements
- A configured Git remote named `origin` pointing to your GitHub repo.
  - If missing, set `GIT_REMOTE_URL` in your environment (e.g., `https://github.com/<owner>/<repo>.git`). The agent will create `origin` automatically.
- Authentication: either GitHub CLI or a token.
  - GitHub CLI (preferred):
    - Install `gh` and run `gh auth status`.
    - Optionally disable interactive prompts in automations: `gh config set prompt disabled`.
  - Token (fallback for REST API):
    - Export one of: `GH_TOKEN` or `GITHUB_TOKEN`.

Enabling Auto PR
- Set `AUTO_PR=true` in your environment.
- Optionally set `PR_BASE` (default `main`) and `AUTO_MERGE=true` to enable auto-merge via `gh`.

Commands
- Draft PR creation uses `gh pr create --draft` when available; otherwise falls back to the GitHub REST API.
- Labels are applied using `tasks.md` metadata when a token is available.

