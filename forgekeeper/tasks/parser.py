from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class Task:
    """Serializable representation of a single task."""

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


class Section:
    """Container for a group of tasks under a Markdown heading."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.header_lines: List[str] = []
        self.tasks: List[Task] = []
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
            task = Task(text, priority, status, current.name, block)
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
