"""High-level goal orchestration utilities.

This module provides a thin manager that, when autonomy mode is active,
automatically dispatches tasks through the existing :mod:`task_pipeline`
without requiring user prompts.  It is intentionally lightweight so it can be
invoked from a scheduler or long-running service.
"""

from __future__ import annotations

from dataclasses import dataclass

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, AUTONOMY_MODE
from forgekeeper.task_pipeline import TaskPipeline
from forgekeeper import main as pipeline_main
from forgekeeper.roadmap_updater import start_periodic_updates

log = get_logger(__name__, debug=DEBUG_MODE)


@dataclass
class HighLevelGoalManager:
    """Manage autonomous goal execution.

    Parameters
    ----------
    autonomous:
        Whether the manager should operate in autonomy mode.  When set to
        ``False`` the manager is effectively inert.
    """

    autonomous: bool = AUTONOMY_MODE

    def __post_init__(self) -> None:
        self.pipeline = TaskPipeline()
        if self.autonomous:
            # Start periodic roadmap updates in the background
            start_periodic_updates(3600)

    # ------------------------------------------------------------------
    def run(self) -> bool:
        """Execute the task pipeline once if autonomy is enabled.

        Returns ``True`` if a task was dispatched, otherwise ``False``.
        """

        if not self.autonomous:
            log.debug("Autonomy mode disabled; goal manager idle")
            return False

        task = self.pipeline.next_task()
        if not task:
            log.info("No tasks available for autonomous execution")
            return False

        desc = getattr(task, "description", None)
        if desc is None and isinstance(task, dict):
            desc = task.get("title") or task.get("description") or ""
        log.info("Autonomy active; executing task pipeline for '%s'", desc)
        pipeline_main.main()
        return True


__all__ = ["HighLevelGoalManager"]

