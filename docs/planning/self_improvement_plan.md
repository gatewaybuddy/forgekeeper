# Self-Improvement Plan (TGT → SAPL → MIP)

Status: 2025-10-20 (US) — Prepared for next session pickup

## Executive Summary
We will enable Forgekeeper to improve itself safely and incrementally via:
- TGT — Telemetry‑Driven Task Generator (priority 1): convert ContextLog + metrics into actionable Task Cards.
- SAPL — Safe Auto‑PR Loop (priority 2): guarded, allowlisted changes (docs/config/tests/UI copy) with dry‑run preview and full auditing.
- MIP — Metrics‑Informed Prompting (priority 3): inject short developer notes based on recent continuation/error telemetry to reduce cut‑offs and fix fences.

## Why This Order
- TGT delivers value without code changes. SAPL builds on TGT output with strict blast‑radius controls. MIP yields immediate quality wins without model changes.

## Scope & Design (v1)

### 1) TGT — Telemetry‑Driven Task Generator
- Source: `.forgekeeper/context_log/*.jsonl` + `/metrics`.
- Heuristics (thresholds v1):
  - Continuations: ratio > 15% in last 60 min or > N/hour (by reason: short|punct|fence).
  - Errors: upstream/tool errors > X/hour.
  - Docs/UI gaps: recent feature toggles detected in events but missing from README/docs.
- Output: Task Cards with title, severity, evidence (counts + sample events), suggested fix, acceptance criteria.
- API: `GET /api/tasks/suggest?window_min=60` (flag‑gated)
- UI: “Tasks” drawer in Chat footer (list, copy Markdown, open in PR template).
- Flags: `TASKGEN_ENABLED=1`, `TASKGEN_WINDOW_MIN=60` (default 60).
- DoD:
  - Returns ≥1 task when we artificially spike continuations (local test).
  - UI renders tasks; “Copy as Markdown” works; unit tests for thresholding.

### 2) SAPL — Safe Auto‑PR Loop
- Tooling: add `open_pr` tool in `server.tools.mjs` (guarded) or a server endpoint that wraps gh.
- Safety:
  - Allowlist only: `README.md`, `docs/**/*.md`, `forgekeeper/.env.example`, `frontend/test/**/*.mjs`, select JSON (no runtime code by default).
  - Dry‑run preview (diff + commit message + file list) in UI; ContextLog audit event `act=auto_pr`.
  - Auto‑merge only when CI green; big kill‑switch env.
- Flow: From a TGT card → “Propose PR” → preview → “Create PR”.
- Flags: `AUTO_PR_ENABLED=1`, `AUTO_PR_ALLOW=comma,list`, `AUTO_PR_DRYRUN=1` (default), `AUTO_PR_AUTOMERGE=0` (default).
- DoD: Create and merge a docs/.env.example tweak PR via the UI, with full audit trail.

### 3) MIP — Metrics‑Informed Prompting
- Server adds a short developer/system hint for final turn when recent telemetry indicates trouble:
  - Examples: “Finish your sentence with terminal punctuation.”, “Close any open code fence (```), then stop.”
- Trigger: last 10 minutes continuations > threshold or dominated by `fence`/`punct` reason.
- Flags: `PROMPTING_HINTS_ENABLED=1`, `PROMPTING_HINTS_MINUTES=10`, `PROMPTING_HINTS_THRESHOLD=0.15`.
- DoD: With hints ON, continuation rate drops on test prompts; can toggle OFF cleanly.

## Risks & Mitigations
- Over‑suggesting tasks: start conservative; severity gating; easy suppression in UI.
- Auto‑PR scope creep: hard allowlist and dry‑run by default; ContextLog audit; easy flag off.
- Prompting side‑effects: hints are short and flagged; log when applied (ContextLog `act=hint_applied`).

## Acceptance Criteria (per track)
- TGT: Suggests reproducible tasks with evidence; UI copy works; thresholds unit‑tested.
- SAPL: From a TGT card, generate a preview and open a PR limited to allowlisted files.
- MIP: Measurable drop in continuations; sparkline reflects improvement; disable restores old behavior.

## Implementation Checklist
- [ ] TGT: backend module `frontend/server.taskgen.mjs` (pure ESM); tests for thresholding.
- [ ] TGT: `GET /api/tasks/suggest`; flag‑gated; returns `{ items: TaskCard[] }`.
- [ ] TGT: UI drawer component; copy Markdown; “Open PR” button (disabled until SAPL is on).
- [ ] SAPL: add safe `open_pr` helper (gh wrapper); dry‑run path; ContextLog audit.
- [ ] SAPL: UI preview (diff summary) and create PR; flags wired.
- [ ] MIP: server hint injection; flags; ContextLog `hint_applied` events; quick unit test.
- [ ] Docs: README “Self‑Improvement” section linking to this plan.

## Milestones
- Sprint A (now): TGT API + UI, docs; MIP behind a flag.
- Sprint B (next): SAPL (dry‑run + allowlist) + UI preview; demo PR from TGT.

## Tracking Flags
- `TASKGEN_ENABLED`, `TASKGEN_WINDOW_MIN`
- `AUTO_PR_ENABLED`, `AUTO_PR_ALLOW`, `AUTO_PR_DRYRUN`, `AUTO_PR_AUTOMERGE`
- `PROMPTING_HINTS_ENABLED`, `PROMPTING_HINTS_MINUTES`, `PROMPTING_HINTS_THRESHOLD`

