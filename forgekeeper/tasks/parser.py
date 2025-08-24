from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
import re

try:
    import yaml  # type: ignore
except Exception as exc:  # pragma: no cover - dependency missing
    raise ImportError("Missing dependency: pyyaml") from exc

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)


@dataclass
class ChecklistTask:
    """Serializable representation of a single checklist task."""

    description: str
    priority: int
    status: str  # "todo", "in_progress", "needs_review", "done", "blocked"
    section: str
    lines: List[str]

    def to_dict(self) -> dict:
        return {
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
        }


@dataclass
class Task:
    """Structured representation of a roadmap task with frontmatter."""

    id: str
    title: str
    status: str
    epic: str | None = None
    owner: str | None = None
    labels: List[str] | None = None
    body: str = ""


class Section:
    """Container for a group of tasks under a Markdown heading."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.header_lines: List[str] = []
        self.tasks: List[ChecklistTask] = []
        self.footer_lines: List[str] = []


SECTION_PRIORITY = {"Active": 0, "Backlog": 1, "Completed": 2}


def _extract_section_name(header: str) -> str:
    if "Active" in header:
        return "Active"
    if "Backlog" in header:
        return "Backlog"
    if "Completed" in header:
        return "Completed"
    return header.lstrip("#").strip()


def parse_task_file(path: Path) -> tuple[List[str], List[Section], Dict[str, Section]]:
    """Parse ``tasks.md`` into structured sections and tasks."""

    preamble: List[str] = []
    sections: List[Section] = []
    section_by_name: Dict[str, Section] = {}

    if not path.is_file():
        return preamble, sections, section_by_name

    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    current: Optional[Section] = None
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("## "):
            name = _extract_section_name(stripped)
            current = Section(name)
            current.header_lines.append(line)
            i += 1
            while i < len(lines) and lines[i].strip() == "":
                current.header_lines.append(lines[i])
                i += 1
            sections.append(current)
            section_by_name[name] = current
            continue
        if current is None:
            preamble.append(line)
            i += 1
            continue
        if stripped.startswith("- ["):
            block = [line]
            i += 1
            while i < len(lines) and lines[i].startswith("  "):
                block.append(lines[i])
                i += 1
            while i < len(lines) and lines[i].strip() == "":
                block.append(lines[i])
                i += 1
            if "[x]" in block[0]:
                status = "done"
            elif "[~]" in block[0]:
                status = "in_progress"
            elif "[?]" in block[0]:
                status = "needs_review"
            elif "[!]" in block[0]:
                status = "blocked"
            else:
                status = "todo"
            text = block[0].split("]", 1)[1].strip()
            priority = SECTION_PRIORITY.get(current.name, 99)
            task = ChecklistTask(text, priority, status, current.name, block)
            current.tasks.append(task)
            continue
        current.footer_lines.append(line)
        i += 1
    return preamble, sections, section_by_name


def serialize(preamble: List[str], sections: List[Section]) -> str:
    """Serialize sections back into Markdown text."""

    lines: List[str] = list(preamble)
    for section in sections:
        lines.extend(section.header_lines)
        for task in section.tasks:
            if task.status == "done":
                prefix = "- [x]"
            elif task.status == "in_progress":
                prefix = "- [~]"
            elif task.status == "needs_review":
                prefix = "- [?]"
            elif task.status == "blocked":
                prefix = "- [!]"
            else:
                prefix = "- [ ]"
            rest = task.lines[0].split("]", 1)[1]
            task.lines[0] = prefix + rest
            lines.extend(task.lines)
        lines.extend(section.footer_lines)
    return "\n".join(lines).rstrip() + "\n"


def save(path: Path, preamble: List[str], sections: List[Section]) -> None:
    """Write parsed sections back to ``tasks.md``."""

    path.write_text(serialize(preamble, sections), encoding="utf-8")


def parse_tasks_md(path: str) -> List[Task]:
    """Parse YAML-frontmatter ``tasks.md`` into a list of ``Task`` objects."""

    text = Path(path).read_text(encoding="utf-8")
    tasks: List[Task] = []
    idx = 0
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            break
        fm_text = m.group(1)
        fm = yaml.safe_load(fm_text) or {}
        start, end = m.span()
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end : (next_m.start() if next_m else len(text))].strip()
        tasks.append(
            Task(
                id=str(fm.get("id")),
                title=(fm.get("title", "") or "").strip(),
                status=(fm.get("status", "todo") or "").strip(),
                epic=fm.get("epic"),
                owner=fm.get("owner"),
                labels=fm.get("labels") or [],
                body=body,
            )
        )
        idx = end
    return tasks
