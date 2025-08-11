"""Scheduler for selecting and updating tasks from ``tasks.md``.

This module wraps :class:`forgekeeper.task_queue.TaskQueue` to expose the
highest priority task to the agent loop. The selected task is registered with
``goal_manager`` so that other components can retrieve it via the existing goal
APIs. Progress on tasks is persisted back to ``tasks.md`` through the
``TaskQueue.mark_*`` methods.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict

from .task_queue import TaskQueue
from . import goal_manager

TASK_FILE = Path(__file__).resolve().parents[1] / "tasks.md"


class TaskPipeline:
    """Coordinate task scheduling and persistence."""

    def __init__(self, task_file: Path = TASK_FILE) -> None:
        self.queue = TaskQueue(task_file)

    # ------------------------------------------------------------------
    # Task selection
    def next_task(self) -> Optional[Dict]:
        """Return the highest priority task metadata.

        Tasks are sourced via :meth:`TaskQueue.next_task`, which supports both
        YAML front-matter and legacy checkbox definitions. Only tasks with
        ``status`` in {``todo``, ``in_progress``} are returned. The description
        is registered with :mod:`goal_manager` for downstream consumption. If a
        corresponding legacy checkbox task exists it is marked in progress.
        """

        meta = self.queue.next_task()
        if not meta or meta.get("status") not in {"todo", "in_progress"}:
            return None

        desc = meta.get("title") or meta.get("description") or ""
        try:  # Best effort – goal_manager may be unavailable during tests
            goal_manager.add_goal(desc, source="task_queue")
        except Exception:  # pragma: no cover - defensive
            pass

        task = self.queue.get_task(desc)
        if task:
            self.queue.mark_in_progress(task)

        return meta

    # ------------------------------------------------------------------
    # Progress helpers
    def mark_done(self, description: str) -> None:
        """Mark the task with ``description`` as completed."""

        task = self.queue.get_task(description)
        if task:
            self.queue.mark_done(task)

    def mark_needs_review(self, description: str) -> None:
        """Mark the task with ``description`` as needing review."""

        task = self.queue.get_task(description)
        if task:
            self.queue.mark_needs_review(task)
