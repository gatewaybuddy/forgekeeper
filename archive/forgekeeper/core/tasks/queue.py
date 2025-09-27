"""Task queue implementation backed by Markdown + episodic memory."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

import yaml

from forgekeeper.memory import MemoryBackend, get_memory_backend

from .memory import MemoryIndex, load_memory_summaries, memory_weight
from .parser import (
    ChecklistTask,
    SECTION_PRIORITY,
    Section,
    parse_task_file,
    save,
)


@dataclass
class CanonicalTask:
    id: str
    title: str
    status: str
    priority: int
    labels: List[str]


class TaskQueue:
    """Parse and manage tasks defined in ``tasks.md``."""

    SECTION_PRIORITY = SECTION_PRIORITY
    DEFAULT_PATH = Path(__file__).resolve().parents[3] / "tasks.md"

    def __init__(
        self,
        path: Path | str | None = None,
        *,
        backend: MemoryBackend | None = None,
        backend_factory: Callable[[], MemoryBackend] | None = None,
    ) -> None:
        self.path = Path(path) if path else self.DEFAULT_PATH
        if backend is not None and backend_factory is not None:
            raise ValueError("Provide either 'backend' or 'backend_factory', not both")
        if backend_factory is not None:
            self._backend_resolver: Callable[[], MemoryBackend] = backend_factory
        else:
            resolved_backend = backend or get_memory_backend()

            def _resolver(resolved: MemoryBackend = resolved_backend) -> MemoryBackend:
                return resolved

            self._backend_resolver = _resolver
        (
            self.preamble,
            self.sections,
            self._section_by_name,
        ) = parse_task_file(self.path)
        stats, index = load_memory_summaries(self.path, backend=self._backend_resolver())
        self.memory_stats: Dict[str, Dict[str, int | str]] = stats
        self.memory_index: MemoryIndex = index

    def save(self) -> None:
        save(self.path, self.preamble, self.sections)

    def refresh_memory(self) -> None:
        stats, index = load_memory_summaries(self.path, backend=self._backend_resolver())
        self.memory_stats = stats
        self.memory_index = index

    def list_tasks(self) -> List[ChecklistTask]:
        tasks: List[ChecklistTask] = []
        for name in ["Active", "Backlog", "Completed"]:
            section = self._section_by_name.get(name)
            if section:
                tasks.extend(section.tasks)
        return tasks

    def _find_canonical_tasks(self, content: str) -> List[dict]:
        tasks: List[dict] = []
        if "## Canonical Tasks" not in content:
            return tasks
        section = content.split("## Canonical Tasks", 1)[1]
        blocks = section.split("---\n")
        for block in blocks[1:]:
            fm, _, _ = block.partition("\n---")
            if not fm.strip():
                continue
            try:
                data = yaml.safe_load(fm) or {}
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            status = str(data.get("status", "")).strip()
            if status not in {"todo", "in_progress"}:
                continue
            title = str(data.get("title", "")).strip()
            priority = _extract_priority(title)
            tasks.append(
                {
                    "id": str(data.get("id", "")),
                    "title": title,
                    "status": status,
                    "labels": list(data.get("labels") or []),
                    "priority": priority,
                }
            )
        return tasks

    def _select_best_task(self, canonical: List[dict], tasks: List[ChecklistTask]) -> Optional[dict]:
        best: Optional[dict] = None
        best_score: Optional[float] = None
        best_related: List[str] = []

        for data in canonical:
            key = str(data.get("id") or "").strip() or None
            weight, related = self._memory_weight(data["title"], key)
            score = data["priority"] + float(weight)
            data["memory_weight"] = weight
            if best_score is None or score < best_score:
                best = data
                best_score = score
                best_related = related

        if best is None:
            for task in tasks:
                if task.status not in {"todo", "in_progress"}:
                    continue
                if task.priority >= self.SECTION_PRIORITY.get("Completed", 99):
                    continue
                weight, related = self._memory_weight(task.description)
                score = task.priority + float(weight)
                candidate = {
                    "id": "",
                    "title": task.description,
                    "status": task.status,
                    "labels": [],
                    "priority": task.priority,
                    "memory_weight": weight,
                }
                if best_score is None or score < best_score:
                    best = candidate
                    best_score = score
                    best_related = related

        if best is not None:
            best["memory_context"] = best_related
        return best

    def _memory_weight(self, text: str, key: str | None = None) -> tuple[float, List[str]]:
        return memory_weight(text, self.memory_stats, self.memory_index, key)

    def next_task(self) -> Optional[dict]:
        try:
            content = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            content = ""
        self.refresh_memory()
        canonical = self._find_canonical_tasks(content)
        return self._select_best_task(canonical, self.list_tasks())

    def get_task(self, description: str) -> Optional[ChecklistTask]:
        for task in self.list_tasks():
            if task.description == description:
                return task
        return None

    def defer(self, task: ChecklistTask) -> None:
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

    def mark_done(self, task: ChecklistTask) -> None:
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

    def mark_in_progress(self, task: ChecklistTask) -> None:
        if task.status == "in_progress":
            return
        task.status = "in_progress"
        self.save()

    def mark_needs_review(self, task: ChecklistTask) -> None:
        if task.status == "needs_review":
            return
        task.status = "needs_review"
        self.save()

    def mark_blocked(self, task: ChecklistTask) -> None:
        if task.status == "blocked":
            return
        task.status = "blocked"
        self.save()

    def task_by_index(self, index: int) -> ChecklistTask:
        tasks = self.list_tasks()
        if index < 0 or index >= len(tasks):
            raise IndexError("task index out of range")
        return tasks[index]


def _extract_priority(title: str) -> int:
    match = re.search(r"\(P([0-9])\)", title)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return 2


__all__ = ["TaskQueue", "CanonicalTask"]
