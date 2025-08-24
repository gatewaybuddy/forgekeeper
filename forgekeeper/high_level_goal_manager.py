"""High-level goal orchestration utilities.

This module provides a thin manager that, when autonomy mode is active,
automatically dispatches tasks through the existing :mod:`pipeline`
without requiring user prompts.  In addition to simple dispatching the
manager contains a lightweight planning algorithm which decomposes a goal's
natural language description into an explicit subtask graph.  Clauses are
extracted via basic punctuation and conjunction heuristics; each clause
becomes a node with a floating priority weight (``1.0`` down to ``0``) and a
dependency on the previous node.  The resulting linear graph is persisted to
:mod:`goal_manager` so the execution pipeline can respect subtask order.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re

from forgekeeper.logger import get_logger
from forgekeeper.config import (
    DEBUG_MODE,
    AUTONOMY_MODE,
    ROADMAP_COMMIT_INTERVAL,
    ROADMAP_AUTO_PUSH,
)
from forgekeeper.pipeline import TaskPipeline
from types import SimpleNamespace

from forgekeeper.roadmap_committer import start_periodic_commits
from forgekeeper import goal_manager
from forgekeeper.multi_agent_planner import split_for_agents
from forgekeeper.agent.communication import broadcast_context, send_direct_message

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
    success_history: dict[str, int] = field(
        default_factory=lambda: {"core": 0, "coder": 0}
    )

    def __post_init__(self) -> None:
        self.pipeline = TaskPipeline()
        if self.autonomous and ROADMAP_COMMIT_INTERVAL > 0:
            # Start periodic roadmap commits in the background
            start_periodic_commits(
                ROADMAP_COMMIT_INTERVAL,
                auto_push=ROADMAP_AUTO_PUSH,
                rationale="Periodic roadmap checkpoint",
            )

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
    def _dispatch_subtasks(
        self,
        description: str,
        prev_agent: str | None = None,
        prev_task: str | None = None,
        default_agent: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Route ``description`` to specialized agents with message passing.

        The text is split via :func:`split_for_agents` which returns a list of
        planned subtasks along with the responsible agent and the preferred
        communication protocol.  Task labels and historical success rates may
        override the planner's suggestion when selecting an agent.  Each subtask
        is communicated either via the
        shared broadcast context or as a direct message.  When responsibility
        shifts from one agent to another a direct handoff message is sent from
        the previous agent to the next so that downstream steps can build on
        earlier results.

        Parameters
        ----------
        description:
            Free-form subtask description.
        prev_agent:
            Agent that handled the previous subtask in the sequence.
        prev_task:
            Description of the previous subtask.  Included in handoff
            messages so the next agent knows what was completed.
        default_agent:
            Agent selected via task labels. If provided it overrides the
            planner's suggestion.

        Returns
        -------
        Tuple[str | None, str | None]
            The final agent and task description processed.  This can be
            supplied as ``prev_agent``/``prev_task`` when dispatching the next
            subtask.
        """

        steps = split_for_agents(description)
        for step in steps:
            agent = step["agent"]
            text = step["task"]
            protocol = step.get("protocol", "broadcast")
            reason = "planner"

            if default_agent:
                agent = default_agent
                reason = "label"
            else:
                best_agent, best_score = max(
                    self.success_history.items(), key=lambda x: x[1]
                )
                if best_score > self.success_history.get(agent, 0):
                    agent = best_agent
                    reason = "history"
                elif prev_agent and agent == "core":
                    agent = prev_agent
                    reason = "history"

            # Record the delegation decision for downstream agents
            broadcast_context(
                "goal_manager", f"delegated '{text}' to {agent} (reason: {reason})"
            )

            if protocol == "direct":
                sender = "goal_manager"
                send_direct_message(sender, agent, text)
            else:
                broadcast_context(agent, text)

            if prev_agent and prev_agent != agent and prev_task:
                send_direct_message(prev_agent, agent, f"handoff complete: {prev_task}")

            prev_agent, prev_task = agent, text

        return prev_agent, prev_task

    # ------------------------------------------------------------------
    def record_result(self, agent: str, success: bool) -> None:
        """Update historical success counts for ``agent``."""

        if success:
            self.success_history[agent] = self.success_history.get(agent, 0) + 1

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
        labels = []
        if desc is None and isinstance(task, dict):
            desc = task.get("title") or task.get("description") or ""
            labels = task.get("labels") or []

        def _extract_agent_label(values: list[str]) -> str | None:
            for lbl in values:
                if lbl.lower().startswith("agent:"):
                    return lbl.split(":", 1)[1].strip().lower()
            return None

        label_agent = _extract_agent_label(labels)

        # Register the parent goal and expand if necessary
        parent_id = goal_manager.add_goal(desc, source="task_pipeline")
        graph = self._build_subtask_graph(desc)
        executed = False

        prev_agent: str | None = None
        prev_task: str | None = None

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
                prev_agent, prev_task = self._dispatch_subtasks(
                    node.description, prev_agent, prev_task, label_agent
                )
                pipeline_main.main()
                executed = True
        else:
            log.info("Autonomy active; executing task pipeline for '%s'", desc)
            self._dispatch_subtasks(desc, default_agent=label_agent)
            pipeline_main.main()
            executed = True
        return executed


__all__ = ["HighLevelGoalManager"]

