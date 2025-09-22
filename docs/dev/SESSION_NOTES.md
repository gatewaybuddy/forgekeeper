Session Notes

Summary
- Aligned Forgekeeper with a CLI‑first, self‑improving agent flow and reduced optional stack bloat.
- Added CLI‑only mode, Transformers fallback, scoped TypeScript checks, and first‑run prompts with optional saved preferences.
- Updated roadmap/tasks to reflect memory retrieval progress and added CLI‑only self‑repair tasks.
- Integrated GitHub automation: optional automatic PR creation after push via gh or REST API, with remote bootstrap and optional auto‑merge.

Decisions
- CLI‑first is opt‑in via flags/env; UI/backend can be brought up explicitly.
- Memory retrieval is “in progress” (FK‑401) with TF–IDF/ST foundations; sandbox (FK‑403) deferred.
- Automatic PR creation is opt‑in (AUTO_PR=true) and resilient (uses gh if present, REST otherwise).
- First‑run startup prompts can be saved to .forgekeeper or skipped each time.

Changes Made
- CLI mode and checks
  - CLI_ONLY env; TS checks disabled in CLI‑only or when Node missing; checks still run automatically for staged .ts/.tsx.
  - LLM_BACKEND=transformers fallback in forgekeeper/app/services/llm_router.py.
- Startup UX
  - scripts/start_local_stack.sh|.ps1: --cli-only/-CliOnly, first‑run prompts, save prefs to .forgekeeper/start_prefs.(env|json), --reset-prefs/-ResetPrefs.
  - start.ps1: forwards new flags.
- Roadmap/tasks
  - roadmap.yaml: FK‑401 → in_progress.
  - tasks.md: expanded FK‑401 AC; added FK‑409/FK‑410 (CLI‑only self‑repair for frontend/backend).
- GitHub automation
  - AUTO_PR, PR_BASE, AUTO_MERGE config flags.
  - git/commit_ops.py: create origin if missing via GIT_REMOTE_URL/GITHUB_REPOSITORY, retry with --set-upstream, auto‑create draft PR after push.
  - vcs/pr_api.py: gh or REST PR creation, labels from tasks.md, optional auto‑merge.
  - tools/gh_setup.md: setup instructions.

How To Use
- Start CLI‑only:
  - Bash: ./forgekeeper/scripts/start_local_stack.sh --cli-only
  - PowerShell: pwsh ./forgekeeper/start.ps1 -CliOnly
  - Reset prompts: --reset-prefs (Bash), -ResetPrefs (PS)
- Transformers fallback (no vLLM):
  - LLM_BACKEND=transformers USE_TINY_MODEL=true FK_DEVICE=cpu python -m forgekeeper
- Auto PR:
  - Ensure remote: set GIT_REMOTE_URL=https://github.com/<owner>/<repo>.git (auto‑creates origin) or configure git manually.
  - Auth: gh auth status (preferred) or set GH_TOKEN/GITHUB_TOKEN.
  - Enable: AUTO_PR=true PR_BASE=main AUTO_MERGE=true.

Next Steps
- Add sandbox flags/CLI and a short README section (FK‑403).
- Optional: directory‑scoped checks (run frontend build only if frontend/ changed).
- Decide default for AUTO_PR in .env.example (recommend off by default).

Transcript
- User: Review repo/docs for alignment to a self‑improving agent; note bloat/missing features; consider skipping UI/backend for CLI.
- Assistant: Assessed repo; identified alignment; called out optional bloat (gateway/UI), gaps (router fallback, CLI‑only mode, sandbox), and roadmap sync needs.
- User: Yes, please. (Proceed.)
- Assistant: Implemented CLI‑only mode, Transformers fallback, TS checks scoping, first‑run prompts/prefs; updated tasks/roadmap/docs.
- User: Add suggestions; prompt when no args and unsaved; flexibility for setup/run.
- Assistant: Added reset‑prefs, refined prompts/persistence; documented testing/sandbox behavior.
- User: Set up gh commands for automatic push/PR.
- Assistant: Added AUTO_PR, PR creation via gh/REST, remote bootstrap (GIT_REMOTE_URL), auto‑merge option; added tools/gh_setup.md.
- User: Summarize and make a transcript.
- Assistant: Provided summary, decisions, changes, how‑to, next steps, transcript.
