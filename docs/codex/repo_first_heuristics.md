# Repo‑First Exploration Heuristics (Codex Addendum)

Authored by: Codex
Date: 2025-11-03

When to Apply (Triggers)
- Task text suggests codebase analysis or repo review: “explore”, “analyze repo”, “summarize”, “readme”, “makefile”, “tests”, “build”, “run”.
- Reflection detects repeated directory reads with little progress.

Goals
- Time‑to‑first‑meaningful‑read under 10s (local).
- Produce a concise repository summary artifact (`docs/REPO_SUMMARY.md`).

Checklist (First 1–2 Iterations)
- read_dir '.' — confirm root layout
- read_file 'README.md' (fallbacks: 'forgekeeper/README.md', 'README_AUTONOMOUS.md')
- read_file 'Makefile' (if present)
- read_file 'pyproject.toml'
- read_file 'docker-compose.yml'
- read_file 'scripts/ensure_stack.sh' (exists in this repo)
- read_dir 'tests' → read_file a representative test (pytest or mjs)

Deliverable (Success Artifact)
- Write `docs/REPO_SUMMARY.md` using repo_summary_template.md.
  - Sections: Structure, Build & Run, Tests, Linting/Typecheck, Env/Secrets, Notable Scripts.

Stall Breakers
- If same tool repeats ≥3 times in 2 iterations (e.g., read_dir), force the above checklist next.
- If no file read succeeds within 1 iteration, jump directly to README → Makefile → tests.

Observability
- Record `first_meaningful_read_ms`: ms from session start to first successful read_file of any prioritized doc.
- Log `repo_first_applied: true` on the first iteration that uses this path.

