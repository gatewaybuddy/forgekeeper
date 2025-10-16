# Spec-Kit Tooling

Forgekeeper exposes a Spec-Kit workflow through the `speckit.*` tool namespace. The
tools follow a `spec → plan → tasks → impl → review` lifecycle and exchange JSON
payloads so agents can coordinate structured work.

## Available tools

| Tool | Purpose |
| --- | --- |
| `speckit.init` | Create the Spec-Kit folder layout with starter documents. |
| `speckit.sync_from_repo` | Read Spec-Kit markdown files into artifact payloads. |
| `speckit.sync_to_repo` | Persist artifacts back to the repository. |
| `speckit.verify` | Check invariants, interfaces, and task completeness. |
| `speckit.plan_generate` | Refresh the plan document and interfaces from the current spec. |
| `speckit.tasks_expand` | Return the expanded task inventory for ticket selection. |
| `speckit.impl_apply_patch` | Apply a unified diff with patch caps (≤3 files, ≤250 lines) and rollback archive. |
| `speckit.review_run` | Capture structured review notes and outcomes. |

All handlers return JSON responses such as:

```json
{
  "ok": true,
  "created": ["spec/spec.md"],
  "message": "Initialized Spec-Kit skeleton."
}
```

Errors surface as `{"ok": false, "error": "message"}` payloads.

## Typical workflow

1. `speckit.init` – bootstrap the repository structure (idempotent).
2. `speckit.sync_from_repo` – load the current spec, plan, and tasks into memory.
3. `speckit.plan_generate` – propagate new spec context into the delivery plan and interfaces.
4. `speckit.tasks_expand` – choose tickets (≤90 minute units) to execute.
5. `speckit.impl_apply_patch` – apply code changes via unified diffs (honouring patch caps).
6. `speckit.verify` – ensure invariants, interface coverage, and task completeness.
7. `speckit.review_run` – record the outcome of the implementation review.

## Retrieval guidance

- Retrieve only artifacts relevant to the active ticket.
- Always surface the invariants connected to the chosen interfaces.
- Include symbol spans directly referenced by the task or review to minimise churn.

