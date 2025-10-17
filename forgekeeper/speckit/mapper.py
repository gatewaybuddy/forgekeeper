"""Mapping helpers between Spec-Kit docs and Forgekeeper artefacts."""

from __future__ import annotations

from typing import Iterable

from forgekeeper.core.artifacts import Artifact, Ticket

from .models import PlanDoc, SpecDoc, TaskDoc


def spec_to_artifacts(spec: SpecDoc, plan: PlanDoc, tasks: Iterable[TaskDoc]) -> dict[str, object]:
    tickets = [
        Ticket(
            id=task.id,
            title=task.title,
            path=task.path,
            inputs=list(task.inputs),
            constraints=list(task.constraints),
            acceptance_tests=list(task.acceptance_tests),
            artifacts=list(task.artifacts),
        )
        for task in tasks
    ]

    spec_meta = spec.model_dump()
    plan_meta = plan.model_dump()

    spec_meta["body_md"] = spec.body_md
    plan_meta["body_md"] = plan.body_md

    return {
        "spec:root": Artifact(path=spec.path, body=spec.body_md, metadata=spec_meta),
        "plan:root": Artifact(path=plan.path, body=plan.body_md, metadata=plan_meta),
        "tickets": tickets,
    }


def artifacts_to_spec(artifacts: dict[str, object]) -> tuple[SpecDoc, PlanDoc, list[TaskDoc]]:
    spec_art = artifacts.get("spec:root")
    plan_art = artifacts.get("plan:root")
    ticket_items = artifacts.get("tickets", [])

    if isinstance(spec_art, Artifact):
        data = dict(spec_art.metadata or {})
        data.setdefault("path", spec_art.path)
        data["body_md"] = spec_art.body
        spec = SpecDoc(**data)
    else:
        spec = SpecDoc()

    if isinstance(plan_art, Artifact):
        data = dict(plan_art.metadata or {})
        data.setdefault("path", plan_art.path)
        data["body_md"] = plan_art.body
        plan = PlanDoc(**data)
    else:
        plan = PlanDoc()

    tasks: list[TaskDoc] = []
    for ticket in ticket_items:
        if isinstance(ticket, Ticket):
            task = TaskDoc(
                path=ticket.path or f"tasks/{ticket.id}.md",
                id=ticket.id,
                title=ticket.title,
                inputs=list(ticket.inputs),
                constraints=list(ticket.constraints),
                acceptance_tests=list(ticket.acceptance_tests),
                artifacts=list(ticket.artifacts),
            )
            tasks.append(task)
        elif isinstance(ticket, dict):
            data = dict(ticket)
            data.setdefault("path", data.get("path", "tasks/task.md"))
            tasks.append(TaskDoc(**data))
    return spec, plan, tasks


__all__ = ["spec_to_artifacts", "artifacts_to_spec"]

