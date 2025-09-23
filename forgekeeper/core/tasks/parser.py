"""Markdown task parsing helpers for the unified runtime."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
import re

import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)


@dataclass
class ChecklistTask:
    description: str
    priority: int
    status: str
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
    id: str
    title: str
    status: str
    epic: Optional[str] = None
    owner: Optional[str] = None
    labels: Optional[List[str]] = None
    body: str = ""


class Section:
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
            status = "todo"
            if "[x]" in block[0]:
                status = "done"
            elif "[~]" in block[0]:
                status = "in_progress"
            elif "[?]" in block[0]:
                status = "needs_review"
            elif "[!]" in block[0]:
                status = "blocked"
            text = block[0].split("]", 1)[1].strip()
            priority = SECTION_PRIORITY.get(current.name, 99)
            current.tasks.append(ChecklistTask(text, priority, status, current.name, block))
            continue
        current.footer_lines.append(line)
        i += 1
    return preamble, sections, section_by_name


def serialize(preamble: List[str], sections: List[Section]) -> str:
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
    path.write_text(serialize(preamble, sections), encoding="utf-8")


def parse_tasks_md(path: str) -> List[Task]:
    text = Path(path).read_text(encoding="utf-8")
    tasks: List[Task] = []
    idx = 0
    while True:
        match = FRONTMATTER_RE.search(text, idx)
        if not match:
            break
        fm_text = match.group(1)
        fm = yaml.safe_load(fm_text) or {}
        start, end = match.span()
        next_match = FRONTMATTER_RE.search(text, end)
        body = text[end : (next_match.start() if next_match else len(text))].strip()
        tasks.append(
            Task(
                id=str(fm.get("id", "")),
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


__all__ = [
    "ChecklistTask",
    "Section",
    "SECTION_PRIORITY",
    "parse_task_file",
    "serialize",
    "save",
    "parse_tasks_md",
]
