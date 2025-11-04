# Forgekeeper Delivery Guardrails

## Purpose
These guardrails provide a single source of truth for how autonomous and human contributors collaborate in this repository. All planning artifacts (roadmap, sprint plan, task board) reference this document instead of maintaining duplicate copies.

## Core Working Agreements
- **Smallest-change-first:** Ship the minimum surface area necessary. Split follow-up refactors into their own tasks when the change exceeds ~20 lines or crosses module boundaries.
- **Timebox:** Budget 4 hours of focused work per task. Stop and report blockers if a task will exceed the timebox.
- **Testing defaults:** Run smoke or unit tests by default. Integration or end-to-end coverage is only required when the task card explicitly calls it out.
- **Allowed touches:** Modify only the paths listed on the active task card. Propose a new task before adding dependencies or widening scope.
- **Feature flags:** Gate risky or user-facing changes behind a flag, defaulting to the safest behavior until the feature is ready.
- **Definition of Done:** Ensure acceptance checks pass, in-scope/out-of-scope boundaries are honored, rollback steps are identified, and the corresponding task card is updated before merge.

## Task Hygiene
- Every change must map to a task card in `tasks.md` (`Task ID: T#`).
- Task cards must include Goal, Scope, Out of Scope, Allowed Touches, Done When, and Test Level bullets.
- Follow-up work discovered during implementation should be captured as new task cards rather than appended ad hoc to the current task.

## Escalation & Reporting
- Document blockers or risks in the active planning log (see `docs/planning/` hub).
- Escalate policy or guardrail changes by proposing edits to this document and requesting review from the roadmap owner.

## Document Ownership
- The planning hub (`docs/planning/README.md`) links to this policy document.
- Roadmap and task documentation must reference this file rather than embedding copies of the guardrail text.
