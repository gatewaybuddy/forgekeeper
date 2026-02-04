"""Spec-Kit repository verification helpers."""

from __future__ import annotations

from pathlib import Path

from .adapter import SpecRepoReader


def verify_repo(root: Path | str) -> dict[str, object]:
    reader = SpecRepoReader(root)
    spec = reader.read_spec()
    plan = reader.read_plan()
    tasks = reader.read_tasks()

    errors: list[str] = []

    if not spec.invariants:
        errors.append("spec/spec.md must contain at least one invariant.")

    task_by_id = {task.id: task for task in tasks}

    for interface in plan.interfaces:
        if not interface.acceptance_tests:
            errors.append(f"Interface '{interface.name}' must include acceptance tests.")
        if not interface.related_tasks:
            errors.append(f"Interface '{interface.name}' must reference at least one task.")
        else:
            missing = [ref for ref in interface.related_tasks if ref not in task_by_id and ref not in {t.path for t in tasks}]
            if missing:
                errors.append(
                    f"Interface '{interface.name}' references missing tasks: {', '.join(sorted(missing))}."
                )

    required_fields = ("inputs", "constraints", "acceptance_tests", "artifacts")
    for task in tasks:
        for field in required_fields:
            value = getattr(task, field)
            if not value:
                errors.append(f"Task {task.id} must include {field} entries.")

    summary = {
        "spec_invariants": len(spec.invariants),
        "plan_interfaces": len(plan.interfaces),
        "tasks": len(tasks),
    }

    return {"ok": not errors, "errors": errors, "summary": summary}


__all__ = ["verify_repo"]

