"""Spec-Kit tool registrations for Forgekeeper."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

from forgekeeper.core.artifacts import Artifact, Ticket
from forgekeeper.tools.patch_caps import apply_unified_diff

from ..speckit.adapter import SpecRepoReader, SpecRepoWriter
from ..speckit.mapper import artifacts_to_spec, spec_to_artifacts
from ..speckit.models import ReviewDoc
from ..speckit.verify import verify_repo
from . import ToolRegistry


def _resolve_root(params: Mapping[str, Any]) -> Path:
    root = Path(params.get("root", ".")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _serialize_artifact(value: Artifact) -> dict[str, Any]:
    return {"path": value.path, "body": value.body, "metadata": dict(value.metadata)}


def _serialize_ticket(ticket: Ticket) -> dict[str, Any]:
    return {
        "id": ticket.id,
        "title": ticket.title,
        "path": ticket.path,
        "inputs": list(ticket.inputs),
        "constraints": list(ticket.constraints),
        "acceptance_tests": list(ticket.acceptance_tests),
        "artifacts": list(ticket.artifacts),
    }


def _deserialise_artifacts(payload: Mapping[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    spec_payload = payload.get("spec:root")
    if isinstance(spec_payload, Mapping):
        data["spec:root"] = Artifact(
            path=str(spec_payload.get("path", "spec/spec.md")),
            body=str(spec_payload.get("body", "")),
            metadata=dict(spec_payload.get("metadata", {})),
        )
    plan_payload = payload.get("plan:root")
    if isinstance(plan_payload, Mapping):
        data["plan:root"] = Artifact(
            path=str(plan_payload.get("path", "plan/plan.md")),
            body=str(plan_payload.get("body", "")),
            metadata=dict(plan_payload.get("metadata", {})),
        )
    tickets_payload = payload.get("tickets", [])
    tickets: list[Ticket] = []
    for item in tickets_payload:
        if isinstance(item, Mapping):
            tickets.append(
                Ticket(
                    id=str(item.get("id", "task")),
                    title=str(item.get("title", "")),
                    path=str(item.get("path", "tasks/task.md")),
                    inputs=list(item.get("inputs", [])),
                    constraints=list(item.get("constraints", [])),
                    acceptance_tests=list(item.get("acceptance_tests", [])),
                    artifacts=list(item.get("artifacts", [])),
                )
            )
    data["tickets"] = tickets
    return data


def tool_init(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    templates = {
        "spec/spec.md": """# Product Specification\n\nDescribe the product goals and outcomes.\n\n## Invariants\n- Bootstrap task must complete without errors.\n\n## Glossary\n- Spec-Kit: Structured planning framework.\n\n## Interfaces\n- Core Workflow\n\n## Acceptance Tests\n- Verify bootstrap task succeeds.\n""",
        "spec/glossary.md": "# Glossary\n\n- Spec-Kit: Structured planning framework.\n",
        "spec/invariants.md": "# Invariants\n\n- Maintain repository stability during bootstrap.\n",
        "plan/plan.md": """# Delivery Plan\n\nOutline implementation phases.\n\n## Interfaces\n- Core Workflow\n\n## Invariants\n- Plan remains aligned with spec goals.\n\n## Acceptance Tests\n- Plan reviewed by peers.\n""",
        "plan/interfaces.md": """# Interfaces\n\n## Core Workflow\n\nCoordinates initial setup activities.\n\n### Acceptance Tests\n- Bootstrap task completes successfully.\n\n### Related Tasks\n- 001-bootstrap\n\n### Artifacts\n- spec/spec.md\n- plan/plan.md\n""",
        "tasks/001-bootstrap.md": """---\nid: 001-bootstrap\ntitle: Bootstrap repository\ninputs:\n  - Spec skeleton\nconstraints:\n  - Keep changes minimal\nacceptance_tests:\n  - Spec and plan files exist\nartifacts:\n  - spec/spec.md\n  - plan/plan.md\n---\n\nEstablish the baseline Spec-Kit structure.\n""",
        "eval/README.md": "# Evaluation\n\nDocument evaluation strategies here.\n",
        "adr/README.md": "# Architecture Decisions\n\nRecord ADRs in this directory.\n",
    }
    gitkeep_paths = ["reviews/.gitkeep", "impl/notes/.gitkeep"]
    created: list[str] = []

    for relative, content in templates.items():
        path = root / relative
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            created.append(relative)

    for relative in gitkeep_paths:
        path = root / relative
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("", encoding="utf-8")
            created.append(relative)

    return {
        "ok": True,
        "created": sorted(created),
        "message": "Initialized Spec-Kit skeleton." if created else "Spec-Kit skeleton already present.",
    }


def tool_sync_from_repo(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    reader = SpecRepoReader(root)
    artifacts = spec_to_artifacts(reader.read_spec(), reader.read_plan(), reader.read_tasks())
    serialised = {
        "spec:root": _serialize_artifact(artifacts["spec:root"]),
        "plan:root": _serialize_artifact(artifacts["plan:root"]),
        "tickets": [_serialize_ticket(ticket) for ticket in artifacts["tickets"]],
    }
    return {"ok": True, "artifacts": serialised}


def tool_sync_to_repo(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    payload = params.get("artifacts", {})
    if not isinstance(payload, Mapping):
        return {"ok": False, "error": "artifacts payload must be an object."}
    artefacts = _deserialise_artifacts(payload)
    spec, plan, tasks = artifacts_to_spec(artefacts)
    writer = SpecRepoWriter(root)
    writer.write_spec(spec)
    writer.write_plan(plan)
    writer.write_tasks(tasks)
    return {"ok": True, "message": "Repository synced from artifacts."}


def tool_verify(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    return verify_repo(root)


def tool_plan_generate(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    reader = SpecRepoReader(root)
    writer = SpecRepoWriter(root)
    spec = reader.read_spec()
    plan = reader.read_plan()
    if not plan.invariants:
        plan.invariants = list(spec.invariants)
    if not plan.acceptance_tests:
        plan.acceptance_tests = list(spec.acceptance_tests or ["Spec reviewed"])
    writer.write_plan(plan)
    return {
        "ok": True,
        "interfaces": [iface.model_dump() for iface in plan.interfaces],
        "message": "Plan refreshed from current spec.",
    }


def tool_tasks_expand(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    reader = SpecRepoReader(root)
    tasks = reader.read_tasks()
    return {"ok": True, "tasks": [task.model_dump() for task in tasks]}


def tool_impl_apply_patch(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    diff = params.get("diff", "")
    if not isinstance(diff, str) or not diff.strip():
        return {"ok": False, "error": "diff must be a non-empty unified diff string."}
    result = apply_unified_diff(diff, root)
    payload = {
        "ok": result.applied,
        "applied": result.applied,
        "message": result.message,
        "changed_files": result.changed_files,
        "changed_lines": result.changed_lines,
    }
    if result.rollback_path:
        payload["rollback_path"] = result.rollback_path
    if not result.applied:
        payload["error"] = result.message
    return payload


def tool_review_run(params: Mapping[str, Any]) -> dict[str, Any]:
    root = _resolve_root(params)
    review_payload = params.get("review", {})
    if not isinstance(review_payload, Mapping):
        return {"ok": False, "error": "review payload must be an object."}
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = str(review_payload.get("path", f"reviews/{timestamp}.md"))
    review = ReviewDoc(
        path=path,
        title=str(review_payload.get("title", "Review")),
        body_md=str(review_payload.get("body_md", "")),
        inputs=list(review_payload.get("inputs", [])),
        constraints=list(review_payload.get("constraints", [])),
        acceptance_tests=list(review_payload.get("acceptance_tests", [])),
        artifacts=list(review_payload.get("artifacts", [])),
        outcome=str(review_payload.get("outcome", "")),
    )
    writer = SpecRepoWriter(root)
    writer.write_reviews([review])
    return {"ok": True, "path": path, "message": "Review recorded."}


INIT_SCHEMA = {
    "type": "object",
    "properties": {
        "root": {"type": "string"},
    },
    "additionalProperties": False,
}


SYNC_SCHEMA = {
    "type": "object",
    "properties": {"root": {"type": "string"}},
    "additionalProperties": False,
}


SYNC_TO_SCHEMA = {
    "type": "object",
    "properties": {
        "root": {"type": "string"},
        "artifacts": {"type": "object"},
    },
    "required": ["artifacts"],
    "additionalProperties": False,
}


VERIFY_SCHEMA = SYNC_SCHEMA


PLAN_SCHEMA = SYNC_SCHEMA


TASKS_SCHEMA = SYNC_SCHEMA


PATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "root": {"type": "string"},
        "diff": {"type": "string"},
    },
    "required": ["diff"],
    "additionalProperties": False,
}


REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "root": {"type": "string"},
        "review": {"type": "object"},
    },
    "required": ["review"],
    "additionalProperties": False,
}


def register_speckit_tools(registry: ToolRegistry) -> None:
    registry.register_tool(
        namespace="speckit",
        name="init",
        description="Initialise a Spec-Kit skeleton in the repository.",
        input_schema=INIT_SCHEMA,
        handler=tool_init,
    )
    registry.register_tool(
        namespace="speckit",
        name="sync_from_repo",
        description="Read Spec-Kit documents from disk into the artifact store.",
        input_schema=SYNC_SCHEMA,
        handler=tool_sync_from_repo,
    )
    registry.register_tool(
        namespace="speckit",
        name="sync_to_repo",
        description="Write Spec-Kit artifacts back to the repository.",
        input_schema=SYNC_TO_SCHEMA,
        handler=tool_sync_to_repo,
    )
    registry.register_tool(
        namespace="speckit",
        name="verify",
        description="Verify Spec-Kit repository invariants.",
        input_schema=VERIFY_SCHEMA,
        handler=tool_verify,
    )
    registry.register_tool(
        namespace="speckit",
        name="plan_generate",
        description="Refresh plan artifacts from the specification.",
        input_schema=PLAN_SCHEMA,
        handler=tool_plan_generate,
    )
    registry.register_tool(
        namespace="speckit",
        name="tasks_expand",
        description="Expand plan epics into actionable tasks.",
        input_schema=TASKS_SCHEMA,
        handler=tool_tasks_expand,
    )
    registry.register_tool(
        namespace="speckit",
        name="impl_apply_patch",
        description="Apply a unified diff with patch caps and rollback support.",
        input_schema=PATCH_SCHEMA,
        handler=tool_impl_apply_patch,
    )
    registry.register_tool(
        namespace="speckit",
        name="review_run",
        description="Record a structured review outcome.",
        input_schema=REVIEW_SCHEMA,
        handler=tool_review_run,
    )


__all__ = [
    "register_speckit_tools",
    "tool_init",
    "tool_sync_from_repo",
    "tool_sync_to_repo",
    "tool_verify",
    "tool_plan_generate",
    "tool_tasks_expand",
    "tool_impl_apply_patch",
    "tool_review_run",
]

