# Safe Auto‑PR Loop (SAPL)

This feature creates safe, low‑risk pull requests from the UI for allowlisted files only (docs, README, .env.example, tests). It is disabled by default and guarded by flags.

## Flags
- `AUTO_PR_ENABLED=1` — enable the API.
- `AUTO_PR_DRYRUN=0` — allow PR creation; when `1`, only previews are allowed.
- `AUTO_PR_ALLOW=README.md,docs/,forgekeeper/.env.example,frontend/test/` — comma list of allowed files/prefixes.
- `AUTO_PR_AUTOMERGE=1` (optional) — attempt `gh pr merge --merge --auto --delete-branch` after creation.
- `REPO_ROOT` — repo root inside the container (default `/workspace`).

## UI Flow
1. Open the Chat menu → Tasks…
2. Review suggestions; click “Propose PR” to open the preview panel.
3. Enter a title, body, and a comma‑separated file list (e.g., `README.md`).
4. Click Preview to see allowed vs blocked files.
5. With flags enabled (`AUTO_PR_ENABLED=1`, `AUTO_PR_DRYRUN=0`), “Create PR” becomes available.
6. Optionally add “Append text” to attach a short note to the first allowed file (useful for README/docs tweaks).

## API
- Preview: `POST /api/auto_pr/preview` → `{ ok, enabled, dryrun, preview:{title,body,files}, blocked }`
- Create: `POST /api/auto_pr/create` → `{ ok, branch, pr_url, pr_num }` (requires flags above)

## Audit
All PR creations are logged to ContextLog with `act=auto_pr` (branch, files, PR reference).

