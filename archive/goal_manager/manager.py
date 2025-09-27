from __future__ import annotations

"""High-level goal orchestration utilities."""

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Callable, Optional, cast

from forgekeeper.logger import get_logger
from forgekeeper.config import (
    DEBUG_MODE,
    AUTONOMY_MODE,
    ROADMAP_COMMIT_INTERVAL,
    ROADMAP_AUTO_PUSH,
)
try:  # pragma: no cover
    from forgekeeper.roadmap_committer import start_periodic_commits  # type: ignore
except Exception:  # pragma: no cover
    def start_periodic_commits(*args, **kwargs):  # type: ignore
        return None
from . import storage as goal_manager

from .planner import Subtask, _build_subtask_graph
from .delegator import _dispatch_subtasks
from .interfaces import PipelineExecutor


# ``pipeline_main`` is populated lazily to avoid heavy imports during module load
pipeline_main = SimpleNamespace(main=None)

log = get_logger(__name__, debug=DEBUG_MODE)


PipelineFactory = Callable[[], Optional[PipelineExecutor]]


class _TaskPipelineAdapter:
    """Wrap :class:`TaskPipeline` to present the ``PipelineExecutor`` protocol."""

    def __init__(self, pipeline: "TaskPipeline") -> None:  # type: ignore[name-defined]
        self._pipeline = pipeline

    def next_task(self):  # type: ignore[override]
        return self._pipeline.next_task()

    def run_task(self, *args, **kwargs):  # type: ignore[override]
        return self._pipeline.run_next_task(*args, **kwargs)

    def update_status(self, description: str, status: str) -> None:  # type: ignore[override]
        handlers = {
            "done": getattr(self._pipeline, "mark_done", None),
            "needs_review": getattr(self._pipeline, "mark_needs_review", None),
            "blocked": getattr(self._pipeline, "mark_blocked", None),
            "deferred": getattr(self._pipeline, "defer", None),
        }
        handler = handlers.get(status)
        if handler is None:
            log.debug("Unknown pipeline status '%s' for '%s'", status, description)
            return
        handler(description)


def _build_default_pipeline() -> Optional[PipelineExecutor]:
    try:  # pragma: no cover - graceful fallback for missing dependencies
        from forgekeeper.task_pipeline import TaskPipeline  # type: ignore
    except Exception:  # pragma: no cover
        log.debug("TaskPipeline unavailable; falling back to inert pipeline")
        return None

    return cast(PipelineExecutor, _TaskPipelineAdapter(TaskPipeline()))


@dataclass
class HighLevelGoalManager:
    """Manage autonomous goal execution."""

    autonomous: bool = AUTONOMY_MODE
    success_history: dict[str, int] = field(
        default_factory=lambda: {"core": 0, "coder": 0}
    )
    pipeline_factory: Optional[PipelineFactory] = None
    pipeline: Optional[PipelineExecutor] = field(init=False, default=None)

    def __post_init__(self) -> None:
        factory = self.pipeline_factory or _build_default_pipeline
        self.pipeline = factory() if factory else None
        if self.autonomous and ROADMAP_COMMIT_INTERVAL > 0:
            # Start periodic roadmap commits in the background
            start_periodic_commits(
                ROADMAP_COMMIT_INTERVAL,
                auto_push=ROADMAP_AUTO_PUSH,
                rationale="Periodic roadmap checkpoint",
            )

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

        if self.pipeline is None:
            log.error("TaskPipeline unavailable; cannot run goals")
            return False

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
        graph = _build_subtask_graph(desc)
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
                prev_agent, prev_task = _dispatch_subtasks(
                    node.description,
                    self.success_history,
                    prev_agent,
                    prev_task,
                    label_agent,
                )
                pipeline_main.main()
                executed = True
        else:
            log.info("Autonomy active; executing task pipeline for '%s'", desc)
            _dispatch_subtasks(desc, self.success_history, default_agent=label_agent)
            pipeline_main.main()
            executed = True
        return executed


__all__ = ["HighLevelGoalManager"]
