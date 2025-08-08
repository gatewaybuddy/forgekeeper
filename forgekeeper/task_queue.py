from __future__ import annotations

"""Simple task queue backed by ``tasks.md``."""

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterator, List, Optional


@dataclass
class Task:
    """Serializable representation of a single task."""

    description: str
    priority: int
    status: str  # "todo" or "done"
    section: str
    lines: List[str]

    def to_dict(self) -> dict:
        return {
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
        }


class Section:
    def __init__(self, name: str) -> None:
        self.name = name
        self.header_lines: List[str] = []
        self.tasks: List[Task] = []
        self.footer_lines: List[str] = []


class TaskQueue:
    """Parse and manage tasks in ``tasks.md``."""

    SECTION_PRIORITY = {"Active": 0, "Backlog": 1, "Completed": 2}

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.preamble: List[str] = []
        self.sections: List[Section] = []
        self._section_by_name: dict[str, Section] = {}
        self._parse()

    # ------------------------------------------------------------------
    # Parsing and serialization
    def _parse(self) -> None:
        if not self.path.is_file():
            return
        lines = self.path.read_text(encoding="utf-8").splitlines()
        i = 0
        current: Optional[Section] = None
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            if stripped.startswith("## "):
                name = self._extract_section_name(stripped)
                current = Section(name)
                current.header_lines.append(line)
                i += 1
                while i < len(lines) and lines[i].strip() == "":
                    current.header_lines.append(lines[i])
                    i += 1
                self.sections.append(current)
                self._section_by_name[name] = current
                continue
            if current is None:
                self.preamble.append(line)
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
                status = "done" if "[x]" in block[0] else "todo"
                text = block[0].split("]", 1)[1].strip()
                priority = self.SECTION_PRIORITY.get(current.name, 99)
                task = Task(text, priority, status, current.name, block)
                current.tasks.append(task)
                continue
            current.footer_lines.append(line)
            i += 1

    def _extract_section_name(self, header: str) -> str:
        if "Active" in header:
            return "Active"
        if "Backlog" in header:
            return "Backlog"
        if "Completed" in header:
            return "Completed"
        return header.lstrip("#").strip()

    def _serialize(self) -> str:
        lines: List[str] = list(self.preamble)
        for section in self.sections:
            lines.extend(section.header_lines)
            for task in section.tasks:
                prefix = "- [x]" if task.status == "done" else "- [ ]"
                rest = task.lines[0].split("]", 1)[1]
                task.lines[0] = prefix + rest
                lines.extend(task.lines)
            lines.extend(section.footer_lines)
        return "\n".join(lines).rstrip() + "\n"

    def save(self) -> None:
        self.path.write_text(self._serialize(), encoding="utf-8")

    # ------------------------------------------------------------------
    # Task helpers
    def list_tasks(self) -> List[Task]:
        tasks: List[Task] = []
        for name in ["Active", "Backlog", "Completed"]:
            section = self._section_by_name.get(name)
            if section:
                tasks.extend(section.tasks)
        return tasks

    def next_task(self) -> Optional[Task]:
        for task in self.list_tasks():
            if task.status == "todo" and task.priority < self.SECTION_PRIORITY["Completed"]:
                return task
        return None

    def get_task(self, description: str) -> Optional[Task]:
        for task in self.list_tasks():
            if task.description == description:
                return task
        return None

    def defer(self, task: Task) -> None:
        if task.section == "Backlog":
            return
        src = self._section_by_name.get(task.section)
        dst = self._section_by_name.get("Backlog")
        if src and dst:
            src.tasks.remove(task)
            task.section = "Backlog"
            task.priority = self.SECTION_PRIORITY["Backlog"]
            dst.tasks.append(task)
            self.save()

    def mark_done(self, task: Task) -> None:
        if task.section == "Completed":
            return
        src = self._section_by_name.get(task.section)
        dst = self._section_by_name.get("Completed")
        if src and dst:
            src.tasks.remove(task)
            task.section = "Completed"
            task.priority = self.SECTION_PRIORITY["Completed"]
            task.status = "done"
            dst.tasks.append(task)
            self.save()

    def task_by_index(self, index: int) -> Task:
        tasks = self.list_tasks()
        if index < 0 or index >= len(tasks):
            raise IndexError("task index out of range")
        return tasks[index]
