"""High-level goal orchestration utilities.

This module provides a thin manager that, when autonomy mode is active,
automatically dispatches tasks through the existing :mod:`task_pipeline`
without requiring user prompts.  In addition to simple dispatching the
manager contains a lightweight planning algorithm which decomposes a goal's
natural language description into an explicit subtask graph.  Clauses are
extracted via basic punctuation and conjunction heuristics; each clause
becomes a node with a floating priority weight (``1.0`` down to ``0``) and a
dependency on the previous node.  The resulting linear graph is persisted to
:mod:`goal_manager` so the execution pipeline can respect subtask order.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, AUTONOMY_MODE
from forgekeeper.task_pipeline import TaskPipeline
from types import SimpleNamespace

from forgekeeper.roadmap_committer import start_periodic_commits as start_periodic_updates
from forgekeeper import goal_manager

# ``pipeline_main`` is populated lazily to avoid heavy imports during module load
pipeline_main = SimpleNamespace(main=None)

log = get_logger(__name__, debug=DEBUG_MODE)


@dataclass
class Subtask:
    """Representation of a planned subtask."""

    description: str
    priority: float
    depends_on: list[int]


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
            # Start periodic roadmap commits in the background
            start_periodic_updates(3600)

    # ------------------------------------------------------------------
    def _build_subtask_graph(self, description: str) -> list[Subtask]:
        """Decompose ``description`` into an ordered subtask graph.

        The description is split on conjunctions and punctuation.  Each
        resulting clause becomes a :class:`Subtask` with a priority weight
        that decreases with position and a dependency on the previous clause,
        yielding a simple linear dependency chain.  If no split occurs the
        single task is returned with full priority and no dependencies.
        """

        parts = [
            p.strip()
            for p in re.split(r"\band then\b|\bthen\b|\band\b|;|\.\s|\n", description)
            if p.strip()
        ]
        if len(parts) <= 1:
            return [Subtask(description, 1.0, [])]
        n = len(parts)
        graph = []
        for idx, part in enumerate(parts):
            priority = 1.0 - idx / n
            depends = [idx - 1] if idx > 0 else []
            graph.append(Subtask(part, priority, depends))
        return graph

    # ------------------------------------------------------------------
    def run(self) -> bool:
        """Execute the task pipeline, expanding complex goals into subtasks."""

        if not self.autonomous:
            log.debug("Autonomy mode disabled; goal manager idle")
            return False

        if pipeline_main.main is None:
            from forgekeeper import main as _main
            pipeline_main.main = _main.main

        task = self.pipeline.next_task()
        if not task:
            log.info("No tasks available for autonomous execution")
            return False

        desc = getattr(task, "description", None)
        if desc is None and isinstance(task, dict):
            desc = task.get("title") or task.get("description") or ""

        # Register the parent goal and expand if necessary
        parent_id = goal_manager.add_goal(desc, source="task_pipeline")
        graph = self._build_subtask_graph(desc)
        executed = False

        if len(graph) > 1:
            log.info("Expanding goal '%s' into %d subtasks", desc, len(graph))
            id_map: dict[int, str] = {}
            for idx, node in enumerate(graph):
                deps = [id_map[d] for d in node.depends_on if d in id_map]
                sub_id = goal_manager.add_goal(
                    node.description,
                    source="subtask",
                    parent_id=parent_id,
                    priority=node.priority,
                    depends_on=deps,
                )
                id_map[idx] = sub_id
                pipeline_main.main()
                executed = True
        else:
            log.info("Autonomy active; executing task pipeline for '%s'", desc)
            pipeline_main.main()
            executed = True
        return executed


__all__ = ["HighLevelGoalManager"]

