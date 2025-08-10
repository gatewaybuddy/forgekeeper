"""Scheduler for selecting and updating tasks from ``tasks.md``.

This module wraps :class:`forgekeeper.task_queue.TaskQueue` to expose the
highest priority task to the agent loop. The selected task is registered with
``goal_manager`` so that other components can retrieve it via the existing goal
APIs. Progress on tasks is persisted back to ``tasks.md`` through the
``TaskQueue.mark_*`` methods.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .task_queue import TaskQueue, Task
from . import goal_manager

TASK_FILE = Path(__file__).resolve().parents[1] / "tasks.md"


class TaskPipeline:
    """Coordinate task scheduling and persistence."""

    def __init__(self, task_file: Path = TASK_FILE) -> None:
        self.queue = TaskQueue(task_file)

    # ------------------------------------------------------------------
    # Task selection
    def next_task(self) -> Optional[Task]:
        """Return the highest priority task and mark it in progress.

        The task description is also registered with :mod:`goal_manager` so the
        agent loop can access it via ``goal_manager.get_active_goals``.
        """

        tasks = self.queue.list_tasks()
        if not tasks:
            return None
        # ``list_tasks`` preserves file order; ``sorted`` keeps FIFO on ties.
        task = sorted(tasks, key=lambda t: t.priority)[0]
        self.queue.mark_in_progress(task)
        try:  # Best effort – goal_manager may be unavailable during tests
            goal_manager.add_goal(task.description, source="task_queue")
        except Exception:  # pragma: no cover - defensive
            pass
        return task

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
