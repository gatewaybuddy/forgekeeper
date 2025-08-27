from __future__ import annotations

"""High-level goal orchestration utilities."""

from dataclasses import dataclass, field
from types import SimpleNamespace
import threading
import time

from forgekeeper.logger import get_logger
from forgekeeper.config import (
    DEBUG_MODE,
    AUTONOMY_MODE,
    ROADMAP_COMMIT_INTERVAL,
    ROADMAP_AUTO_PUSH,
    GOAL_RUN_INTERVAL,
)
try:  # pragma: no cover - graceful fallback for missing dependencies
    from forgekeeper.task_pipeline import TaskPipeline  # type: ignore
except Exception:  # pragma: no cover
    TaskPipeline = None  # type: ignore
try:  # pragma: no cover
    from forgekeeper.roadmap_committer import start_periodic_commits  # type: ignore
except Exception:  # pragma: no cover
    def start_periodic_commits(*args, **kwargs):  # type: ignore
        return None
from . import storage as goal_manager

from .planner import Subtask, _build_subtask_graph
from .delegator import _dispatch_subtasks


# ``pipeline_main`` is populated lazily to avoid heavy imports during module load
pipeline_main = SimpleNamespace(main=None)

log = get_logger(__name__, debug=DEBUG_MODE)


@dataclass
class HighLevelGoalManager:
    """Manage autonomous goal execution."""

    autonomous: bool = AUTONOMY_MODE
    success_history: dict[str, int] = field(
        default_factory=lambda: {"core": 0, "coder": 0}
    )

    loop_thread: threading.Thread | None = field(init=False, default=None, repr=False)
    stop_event: threading.Event = field(init=False, default_factory=threading.Event, repr=False)

    def __post_init__(self) -> None:
        self.pipeline = TaskPipeline() if TaskPipeline else None
        if self.autonomous and ROADMAP_COMMIT_INTERVAL > 0:
            # Start periodic roadmap commits in the background
            start_periodic_commits(
                ROADMAP_COMMIT_INTERVAL,
                auto_push=ROADMAP_AUTO_PUSH,
                rationale="Periodic roadmap checkpoint",
            )
        if self.autonomous and GOAL_RUN_INTERVAL > 0:
            self._start_periodic_run()

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

    # ------------------------------------------------------------------
    def _start_periodic_run(self) -> None:
        """Start a background thread that invokes ``run`` periodically."""

        def _loop() -> None:
            while not self.stop_event.is_set():
                time.sleep(GOAL_RUN_INTERVAL)
                try:
                    self.run()
                except Exception as exc:  # pragma: no cover - best effort
                    log.error("Periodic goal execution failed: %s", exc)

        self.loop_thread = threading.Thread(target=_loop, daemon=True)
        self.loop_thread.start()

    # ------------------------------------------------------------------
    def shutdown(self) -> None:
        """Signal the periodic runner to stop."""

        self.stop_event.set()
        if self.loop_thread and self.loop_thread.is_alive():
            self.loop_thread.join(timeout=0.1)


__all__ = ["HighLevelGoalManager"]
