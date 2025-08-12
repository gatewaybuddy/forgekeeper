"""High-level goal orchestration utilities.

This module provides a thin manager that, when autonomy mode is active,
automatically dispatches tasks through the existing :mod:`task_pipeline`
without requiring user prompts.  It is intentionally lightweight so it can be
invoked from a scheduler or long-running service.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, AUTONOMY_MODE
from forgekeeper.task_pipeline import TaskPipeline
from forgekeeper import main as pipeline_main
from forgekeeper.roadmap_updater import start_periodic_updates
from forgekeeper import goal_manager

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
    def _parse_subtasks(self, description: str) -> list[str]:
        """Split a goal ``description`` into prioritized subtasks.

        The heuristic is intentionally lightweight: the description is split on
        common conjunctions and punctuation.  If no clear separator is found the
        original description is returned as the sole task.
        """

        parts = [p.strip() for p in re.split(r"\band\b|;|\.\s|\n", description) if p.strip()]
        return parts if len(parts) > 1 else [description]

    # ------------------------------------------------------------------
    def run(self) -> bool:
        """Execute the task pipeline, expanding complex goals into subtasks."""

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

        # Register the parent goal and expand if necessary
        parent_id = goal_manager.add_goal(desc, source="task_pipeline")
        subtasks = self._parse_subtasks(desc)
        executed = False

        if len(subtasks) > 1:
            log.info("Expanding goal '%s' into %d subtasks", desc, len(subtasks))
            for idx, sub_desc in enumerate(subtasks):
                goal_manager.add_goal(
                    sub_desc, source="subtask", parent_id=parent_id, priority=idx
                )
                pipeline_main.main()
                executed = True
        else:
            log.info("Autonomy active; executing task pipeline for '%s'", desc)
            pipeline_main.main()
            executed = True
        return executed


__all__ = ["HighLevelGoalManager"]

