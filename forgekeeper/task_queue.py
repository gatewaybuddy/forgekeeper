"""Task queue backed by ``tasks.md`` with episodic memory weighting.

Tasks are primarily ordered by priority markers in the task file.  At
construction the queue loads episodic memory summaries from
``.forgekeeper/memory/episodic.jsonl`` and derives a *memory weight* for each
task: every recorded failure increases the weight while each success decreases
it.  The queue orders tasks by the combined score ``priority + memory_weight``,
so repeatedly failing items drift back and successful ones bubble up.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import json
import re
import yaml


@dataclass
class Task:
    """Serializable representation of a single task."""

    description: str
    priority: int
    status: str  # "todo", "in_progress", "needs_review", or "done"
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
    """Parse and manage tasks in ``tasks.md``.

    Parameters
    ----------
    path:
        Optional path to the ``tasks.md`` file. When omitted, the file at the
        repository root is used.
    """

    SECTION_PRIORITY = {"Active": 0, "Backlog": 1, "Completed": 2}
    DEFAULT_PATH = Path(__file__).resolve().parents[1] / "tasks.md"

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else self.DEFAULT_PATH
        self.preamble: List[str] = []
        self.sections: List[Section] = []
        self._section_by_name: dict[str, Section] = {}
        self._parse()
        self.memory_stats: Dict[str, Dict[str, int]] = self._load_memory_summaries()

    def refresh_memory(self) -> None:
        """Reload episodic memory summaries from disk."""
        self.memory_stats = self._load_memory_summaries()

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

    def save(self) -> None:
        self.path.write_text(self._serialize(), encoding="utf-8")

    # ------------------------------------------------------------------
    # Task helpers
    def _load_memory_summaries(self) -> Dict[str, Dict[str, int]]:
        """Load episodic memory success/failure counts keyed by task ID or title."""
        mem_path = self.path.parent / ".forgekeeper" / "memory" / "episodic.jsonl"
        if not mem_path.is_file():
            return {}
        summary: Dict[str, Dict[str, int]] = {}
        for line in mem_path.read_text(encoding="utf-8").splitlines():
            try:
                data = json.loads(line)
            except Exception:
                continue
            key = str(data.get("task_id") or data.get("title") or "").strip()
            if not key:
                continue
            status = str(data.get("status", ""))
            stats = summary.setdefault(key, {"success": 0, "failure": 0})
            if "success" in status or status == "committed":
                stats["success"] += 1
            elif (
                "fail" in status
                or "error" in status
                or status == "no-file"
            ):
                stats["failure"] += 1
        return summary

    def list_tasks(self) -> List[Task]:
        tasks: List[Task] = []
        for name in ["Active", "Backlog", "Completed"]:
            section = self._section_by_name.get(name)
            if section:
                tasks.extend(section.tasks)
        return tasks

    def next_task(self) -> Optional[dict]:
        """Return next task from YAML front-matter in ``tasks.md``.

        Tasks are defined in the "Canonical Tasks" section using YAML blocks
        delimited by ``---``. Each block may contain ``id``, ``title``,
        ``status``, and ``labels`` fields. The priority is derived from a
        ``(P0-P3)`` marker in the title; if absent, it defaults to ``P2``. Only
        tasks with ``status`` in {``todo``, ``in_progress``} are considered. The
        task with the lowest numeric priority is returned, using FIFO order to
        break ties. If no such front-matter tasks are found, the legacy checkbox
        tasks are used as a fallback.
        """

        try:
            content = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            content = ""

        self.refresh_memory()
        memory = self.memory_stats
        best: Optional[dict] = None
        best_score: Optional[int] = None
        if "## Canonical Tasks" in content:
            section = content.split("## Canonical Tasks", 1)[1]
            lines = section.splitlines()
            i = 0
            while i < len(lines):
                if lines[i].strip() == "---":
                    i += 1
                    fm_lines: List[str] = []
                    while i < len(lines) and lines[i].strip() != "---":
                        fm_lines.append(lines[i])
                        i += 1
                    if i >= len(lines):
                        break
                    i += 1  # skip closing ---
                    try:
                        data = yaml.safe_load("\n".join(fm_lines))
                    except Exception:
                        continue
                    if not isinstance(data, dict):
                        continue
                    status = str(data.get("status", "")).strip()
                    if status not in {"todo", "in_progress"}:
                        continue
                    title = str(data.get("title", ""))
                    match = re.search(r"\(P([0-3])\)", title)
                    priority = int(match.group(1)) if match else 2
                    labels = data.get("labels") or []
                    key = str(data.get("id") or title).strip()
                    stats = memory.get(key)
                    memory_weight = (stats["failure"] - stats["success"]) if stats else 0
                    task = {
                        "id": data.get("id"),
                        "title": title,
                        "status": status,
                        "labels": labels,
                        "priority": priority,
                        "memory_weight": memory_weight,
                    }
                    score = priority + memory_weight
                    if best_score is None or score < best_score:
                        best = task
                        best_score = score
                else:
                    i += 1
        if best:
            return best

        for task in self.list_tasks():
            if task.status in {"todo", "in_progress"} and task.priority < self.SECTION_PRIORITY["Completed"]:
                stats = memory.get(task.description)
                memory_weight = (stats["failure"] - stats["success"]) if stats else 0
                score = task.priority + memory_weight
                if best is None or score < best_score:
                    best = {
                        "id": "",
                        "title": task.description,
                        "status": task.status,
                        "labels": [],
                        "priority": task.priority,
                        "memory_weight": memory_weight,
                    }
                    best_score = score
        return best

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

    def mark_in_progress(self, task: Task) -> None:
        if task.status == "in_progress":
            return
        task.status = "in_progress"
        self.save()

    def mark_needs_review(self, task: Task) -> None:
        if task.status == "needs_review":
            return
        task.status = "needs_review"
        self.save()

    def mark_blocked(self, task: Task) -> None:
        if task.status == "blocked":
            return
        task.status = "blocked"
        self.save()

    def task_by_index(self, index: int) -> Task:
        tasks = self.list_tasks()
        if index < 0 or index >= len(tasks):
            raise IndexError("task index out of range")
        return tasks[index]
