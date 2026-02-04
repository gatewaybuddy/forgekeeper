"""Read/write helpers for Spec-Kit repositories."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable, Iterator

from .models import PlanDoc, PlanInterface, ReviewDoc, SpecDoc, TaskDoc

SECTION_TITLES = {
    "invariants": "Invariants",
    "glossary": "Glossary",
    "interfaces": "Interfaces",
    "inputs": "Inputs",
    "constraints": "Constraints",
    "acceptance_tests": "Acceptance Tests",
    "artifacts": "Artifacts",
    "outcome": "Outcome",
}

SECTION_ORDER = [
    "invariants",
    "glossary",
    "interfaces",
    "inputs",
    "constraints",
    "acceptance_tests",
    "artifacts",
    "outcome",
]


def _normalise_section_name(title: str) -> str:
    key = title.strip().lower()
    key = key.replace(" ", "_")
    key = key.replace("-", "_")
    if key == "acceptance_tests":
        return "acceptance_tests"
    if key == "acceptance_test":
        return "acceptance_tests"
    if key == "glossary":
        return "glossary"
    if key == "interfaces":
        return "interfaces"
    if key == "constraints":
        return "constraints"
    if key == "inputs":
        return "inputs"
    if key == "artifacts":
        return "artifacts"
    if key == "outcome":
        return "outcome"
    if key == "invariants":
        return "invariants"
    return key


def _split_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {"body": []}
    current = "body"
    for line in text.splitlines():
        if line.startswith("## "):
            current = _normalise_section_name(line[3:])
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}


def _parse_list(section: str) -> list[str]:
    items: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            items.append(stripped[2:].strip())
    return items


def _parse_glossary(section: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    for item in _parse_list(section):
        if ":" in item:
            term, definition = item.split(":", 1)
            entries[term.strip()] = definition.strip()
        else:
            entries[item] = ""
    return entries


def _render_bullet_list(items: Iterable[str]) -> list[str]:
    lines: list[str] = []
    for item in items:
        if item:
            lines.append(f"- {item}")
    return lines


def _render_glossary(entries: dict[str, str]) -> list[str]:
    lines: list[str] = []
    for term in sorted(entries.keys()):
        definition = entries[term]
        if definition:
            lines.append(f"- {term}: {definition}")
        else:
            lines.append(f"- {term}")
    return lines


def _render_doc(doc: SpecDoc | PlanDoc | ReviewDoc) -> str:
    lines: list[str] = []
    if doc.title:
        lines.append(f"# {doc.title}")
        lines.append("")
    if doc.body_md:
        lines.extend(doc.body_md.strip().splitlines())
        lines.append("")
    for field in SECTION_ORDER:
        value = getattr(doc, field, None)
        if not value:
            continue
        title = SECTION_TITLES.get(field, field.replace("_", " ").title())
        lines.append(f"## {title}")
        if field == "glossary":
            lines.extend(_render_glossary(value))
        elif field in {"invariants", "inputs", "constraints", "acceptance_tests", "artifacts"}:
            lines.extend(_render_bullet_list(value))
        elif field == "interfaces":
            names = []
            for item in value:
                if hasattr(item, "name"):
                    names.append(getattr(item, "name"))
                else:
                    names.append(str(item))
            lines.extend(_render_bullet_list(names))
        else:
            lines.extend(value.strip().splitlines())
        lines.append("")
    while lines and lines[-1] == "":
        lines.pop()
    lines.append("")
    return "\n".join(lines)


def _parse_doc(path: Path) -> tuple[str, dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    title = ""
    remaining = text
    lines = text.splitlines()
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip()
        remaining = "\n".join(lines[1:])
    sections = _split_sections(remaining)
    return title, sections


def _parse_plan_interfaces(path: Path) -> list[PlanInterface]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    interfaces: list[PlanInterface] = []
    current: PlanInterface | None = None
    section: str | None = None
    for line in text.splitlines():
        if line.startswith("## "):
            if current is not None:
                interfaces.append(current)
            name = line[3:].strip()
            current = PlanInterface(name=name)
            section = "body"
            continue
        if current is None:
            continue
        if line.startswith("### "):
            header = _normalise_section_name(line[4:])
            section = header
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if section == "body":
            current.description = (current.description + "\n" + stripped).strip()
        elif section == "acceptance_tests":
            if stripped.startswith("- "):
                current.acceptance_tests.append(stripped[2:].strip())
        elif section == "related_tasks":
            if stripped.startswith("- "):
                current.related_tasks.append(stripped[2:].strip())
        elif section == "artifacts":
            if stripped.startswith("- "):
                current.artifacts.append(stripped[2:].strip())
    if current is not None:
        interfaces.append(current)
    return interfaces


def _render_plan_interfaces(interfaces: Iterable[PlanInterface]) -> str:
    lines = ["# Interfaces", ""]
    for interface in interfaces:
        lines.append(f"## {interface.name}")
        lines.append("")
        if interface.description:
            lines.extend(interface.description.strip().splitlines())
            lines.append("")
        if interface.acceptance_tests:
            lines.append("### Acceptance Tests")
            lines.extend(_render_bullet_list(interface.acceptance_tests))
            lines.append("")
        if interface.related_tasks:
            lines.append("### Related Tasks")
            lines.extend(_render_bullet_list(interface.related_tasks))
            lines.append("")
        if interface.artifacts:
            lines.append("### Artifacts")
            lines.extend(_render_bullet_list(interface.artifacts))
            lines.append("")
    while lines and lines[-1] == "":
        lines.pop()
    lines.append("")
    return "\n".join(lines)


@dataclass(slots=True)
class _TaskFrontMatter:
    meta: dict[str, object]
    body: str


def _parse_task_front_matter(text: str) -> _TaskFrontMatter:
    if not text.startswith("---"):
        return _TaskFrontMatter(meta={}, body=text)
    end = text.find("\n---", 3)
    if end == -1:
        return _TaskFrontMatter(meta={}, body=text)
    header = text[3:end].strip().splitlines()
    body = text[end + 4 :].lstrip("\n")
    meta: dict[str, object] = {}
    current_key: str | None = None
    for raw in header:
        if not raw.strip():
            continue
        if raw.startswith("  - ") and current_key:
            meta.setdefault(current_key, []).append(raw[4:].strip())
            continue
        if ":" in raw:
            key, value = raw.split(":", 1)
            key = key.strip()
            value = value.strip()
            current_key = key
            if value:
                meta[key] = value
            else:
                meta[key] = []
        else:
            current_key = None
    return _TaskFrontMatter(meta=meta, body=body)


def _render_task(task: TaskDoc) -> str:
    lines = ["---"]
    lines.append(f"id: {task.id}")
    if task.title:
        lines.append(f"title: {task.title}")
    lines.append("inputs:")
    lines.extend(f"  - {item}" for item in task.inputs)
    lines.append("constraints:")
    lines.extend(f"  - {item}" for item in task.constraints)
    lines.append("acceptance_tests:")
    lines.extend(f"  - {item}" for item in task.acceptance_tests)
    lines.append("artifacts:")
    lines.extend(f"  - {item}" for item in task.artifacts)
    lines.append("---")
    if task.body_md:
        lines.append("")
        lines.extend(task.body_md.strip().splitlines())
    lines.append("")
    return "\n".join(lines)


class SpecRepoReader:
    """Read Spec-Kit artefacts from a repository."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)

    def _resolve(self, relative: str) -> Path:
        return self.root / relative

    def read_spec(self) -> SpecDoc:
        path = self._resolve("spec/spec.md")
        if not path.exists():
            return SpecDoc()
        title, sections = _parse_doc(path)
        spec = SpecDoc(title=title)
        spec.body_md = sections.get("body", "")
        if "invariants" in sections:
            spec.invariants = _parse_list(sections["invariants"])
        if "glossary" in sections:
            spec.glossary = _parse_glossary(sections["glossary"])
        for key in ("interfaces", "inputs", "constraints", "acceptance_tests", "artifacts", "outcome"):
            if key in sections:
                if key == "outcome":
                    spec.outcome = sections[key]
                else:
                    setattr(spec, key, _parse_list(sections[key]))
        return spec

    def read_plan(self) -> PlanDoc:
        path = self._resolve("plan/plan.md")
        plan = PlanDoc()
        if not path.exists():
            return plan
        title, sections = _parse_doc(path)
        plan.title = title
        plan.body_md = sections.get("body", "")
        if "invariants" in sections:
            plan.invariants = _parse_list(sections["invariants"])
        if "glossary" in sections:
            plan.glossary = _parse_glossary(sections["glossary"])
        for key in ("inputs", "constraints", "acceptance_tests", "artifacts", "outcome"):
            if key in sections:
                if key == "outcome":
                    plan.outcome = sections[key]
                else:
                    setattr(plan, key, _parse_list(sections[key]))
        if "interfaces" in sections:
            plan.interfaces = [
                PlanInterface(name=name)
                for name in _parse_list(sections["interfaces"])
            ]
        interface_path = self._resolve("plan/interfaces.md")
        detailed_interfaces = _parse_plan_interfaces(interface_path)
        if detailed_interfaces:
            # Merge existing names to preserve ordering
            existing = {i.name: i for i in detailed_interfaces}
            merged: list[PlanInterface] = []
            seen: set[str] = set()
            for iface in plan.interfaces:
                if iface.name in existing:
                    merged.append(existing[iface.name])
                    seen.add(iface.name)
                else:
                    merged.append(iface)
            for iface in detailed_interfaces:
                if iface.name not in seen:
                    merged.append(iface)
            plan.interfaces = merged
        return plan

    def read_tasks(self) -> list[TaskDoc]:
        tasks_dir = self._resolve("tasks")
        if not tasks_dir.exists():
            return []
        docs: list[TaskDoc] = []
        for path in sorted(tasks_dir.rglob("*.md")):
            text = path.read_text(encoding="utf-8")
            parsed = _parse_task_front_matter(text)
            meta = parsed.meta
            task_id = str(meta.get("id", path.stem))
            title = str(meta.get("title", "")) if meta.get("title") else ""
            doc = TaskDoc(
                path=str(path.relative_to(self.root)),
                id=task_id,
                title=title,
                body_md=parsed.body.strip(),
            )
            for key in ("inputs", "constraints", "acceptance_tests", "artifacts"):
                value = meta.get(key, [])
                if isinstance(value, list):
                    setattr(doc, key, [str(v) for v in value])
                elif value:
                    setattr(doc, key, [str(value)])
            docs.append(doc)
        return docs

    def read_reviews(self) -> list[ReviewDoc]:
        reviews_dir = self._resolve("reviews")
        if not reviews_dir.exists():
            return []
        docs: list[ReviewDoc] = []
        for path in sorted(reviews_dir.rglob("*.md")):
            title, sections = _parse_doc(path)
            review = ReviewDoc(
                path=str(path.relative_to(self.root)),
                title=title,
                body_md=sections.get("body", ""),
            )
            for key in ("inputs", "constraints", "acceptance_tests", "artifacts", "outcome"):
                if key in sections:
                    if key == "outcome":
                        review.outcome = sections[key]
                    else:
                        setattr(review, key, _parse_list(sections[key]))
            docs.append(review)
        return docs


class SpecRepoWriter:
    """Write Spec-Kit artefacts back to disk with stable ordering."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)

    def _resolve(self, relative: str) -> Path:
        return self.root / relative

    def write_spec(self, spec: SpecDoc) -> Path:
        path = self._resolve(spec.path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(_render_doc(spec), encoding="utf-8")
        return path

    def write_plan(self, plan: PlanDoc) -> tuple[Path, Path]:
        plan_path = self._resolve(plan.path)
        plan_path.parent.mkdir(parents=True, exist_ok=True)
        plan_path.write_text(_render_doc(plan), encoding="utf-8")
        interface_path = self._resolve("plan/interfaces.md")
        interface_path.parent.mkdir(parents=True, exist_ok=True)
        interface_path.write_text(_render_plan_interfaces(plan.interfaces), encoding="utf-8")
        return plan_path, interface_path

    def write_tasks(self, tasks: Iterable[TaskDoc]) -> list[Path]:
        written: list[Path] = []
        for task in tasks:
            path = self._resolve(task.path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_render_task(task), encoding="utf-8")
            written.append(path)
        return written

    def write_reviews(self, reviews: Iterable[ReviewDoc]) -> list[Path]:
        written: list[Path] = []
        for review in reviews:
            path = self._resolve(review.path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_render_doc(review), encoding="utf-8")
            written.append(path)
        return written

