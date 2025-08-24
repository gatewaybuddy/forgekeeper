from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional
import re
import yaml

from .parser import (
    Task,
    Section,
    parse_task_file,
    save as save_tasks,
    SECTION_PRIORITY,
)
from .memory_weighting import load_memory_summaries, memory_weight


class TaskQueue:
    """Parse and manage tasks in ``tasks.md``."""

    SECTION_PRIORITY = SECTION_PRIORITY
    DEFAULT_PATH = Path(__file__).resolve().parents[2] / "tasks.md"

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else self.DEFAULT_PATH
        (
            self.preamble,
            self.sections,
            self._section_by_name,
        ) = parse_task_file(self.path)
        stats, embedder = load_memory_summaries(self.path)
        self.memory_stats: Dict[str, Dict[str, int | str]] = stats
        self.memory_embedder = embedder

    def refresh_memory(self) -> None:
        stats, embedder = load_memory_summaries(self.path)
        self.memory_stats = stats
        self.memory_embedder = embedder

    # ------------------------------------------------------------------
    # Persistence helpers
    def save(self) -> None:
        save_tasks(self.path, self.preamble, self.sections)

    # ------------------------------------------------------------------
    # Task helpers
    def list_tasks(self) -> List[Task]:
        tasks: List[Task] = []
        for name in ["Active", "Backlog", "Completed"]:
            section = self._section_by_name.get(name)
            if section:
                tasks.extend(section.tasks)
        return tasks

    def _memory_weight(self, text: str, key: str | None = None) -> tuple[float, list[str]]:
        return memory_weight(text, self.memory_stats, self.memory_embedder, key)

    # ------------------------------------------------------------------
    # Internal helpers
    def _find_canonical_tasks(self, content: str) -> List[dict]:
        """Parse canonical task frontmatter blocks from ``tasks.md`` content."""

        tasks: List[dict] = []
        if "## Canonical Tasks" not in content:
            return tasks

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
                i += 1
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
                tasks.append(
                    {
                        "id": data.get("id"),
                        "title": title,
                        "status": status,
                        "labels": labels,
                        "priority": priority,
                    }
                )
            else:
                i += 1
        return tasks

    def _select_best_task(self, canonical: List[dict], tasks: List[Task]) -> Optional[dict]:
        """Apply memory weighting and choose the best task from candidates."""

        best: Optional[dict] = None
        best_score: Optional[float] = None
        best_related: list[str] = []

        for data in canonical:
            key = str(data.get("id") or "").strip() or None
            mem_wt, related = self._memory_weight(data["title"], key)
            data["memory_weight"] = mem_wt
            score = data["priority"] + float(mem_wt)
            if best_score is None or score < best_score:
                best = data
                best_score = score
                best_related = related

        if best is None:
            for task in tasks:
                if task.status in {"todo", "in_progress"} and task.priority < self.SECTION_PRIORITY["Completed"]:
                    mem_wt, related = self._memory_weight(task.description)
                    score = task.priority + float(mem_wt)
                    if best_score is None or score < best_score:
                        best = {
                            "id": "",
                            "title": task.description,
                            "status": task.status,
                            "labels": [],
                            "priority": task.priority,
                            "memory_weight": mem_wt,
                        }
                        best_score = score
                        best_related = related

        if best is not None:
            best["memory_context"] = best_related
        return best

    def next_task(self) -> Optional[dict]:
        try:
            content = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            content = ""

        self.refresh_memory()
        canonical = self._find_canonical_tasks(content)
        return self._select_best_task(canonical, self.list_tasks())

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
