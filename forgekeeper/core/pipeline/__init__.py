"""Pipeline utilities for the unified runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from forgekeeper.state_manager import save_state

from .task_pipeline import TaskPipeline, TaskExecutor

DEFAULT_STATE_PATH = Path(".forgekeeper/pipeline_state.json")


@dataclass
class PipelineContext:
    """Mutable context passed between pipeline steps."""

    pipeline: TaskPipeline
    state_path: Path
    state: Dict[str, Any] = field(default_factory=dict)
    selected_task: Optional[Dict[str, Any]] = None
    task_result: Optional[Dict[str, Any]] = None
    history: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    executor: TaskExecutor | None = None
    auto_complete: Optional[bool] = None
    guidelines: str = ""


@dataclass
class PipelineStep:
    name: str
    handler: Callable[["PipelineContext"], None]


def build_default_pipeline(context: PipelineContext) -> List[PipelineStep]:
    """Return the default set of pipeline steps for the migration phase."""

    def _select_task(ctx: PipelineContext) -> None:
        ctx.selected_task = ctx.pipeline.next_task()
        ctx.state.setdefault("pipeline", {})["last_selected"] = ctx.selected_task
        if ctx.selected_task:
            title = ctx.pipeline.describe_task(ctx.selected_task)
            ctx.notes.append(f"selected:{title}")
        else:
            ctx.notes.append("no-task-selected")

    def _execute_task(ctx: PipelineContext) -> None:
        prefs = ctx.state.setdefault("pipeline", {})
        auto_complete = ctx.auto_complete if ctx.auto_complete is not None else bool(prefs.get("auto_complete", False))
        guidelines = ctx.guidelines or str(prefs.get("guidelines", ""))
        prefs["auto_complete"] = auto_complete
        if ctx.guidelines:
            prefs["guidelines"] = ctx.guidelines
        ctx.task_result = ctx.pipeline.run_next_task(
            guidelines=guidelines,
            auto_complete=auto_complete,
            executor=ctx.executor,
        )
        if ctx.task_result:
            prefs["last_result"] = ctx.task_result
            ctx.notes.append(f"run:{ctx.task_result.get('status', 'unknown')}")
        else:
            ctx.notes.append("run:no-task")

    def _record_history(ctx: PipelineContext) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "selected": ctx.selected_task,
            "result": ctx.task_result,
        }
        history = ctx.state.setdefault("history", [])
        if isinstance(history, list):
            history.append(entry)
        else:
            ctx.state["history"] = [entry]
        ctx.state["last_run"] = entry
        save_state(ctx.state, ctx.state_path)

    return [
        PipelineStep("select_task", _select_task),
        PipelineStep("execute_task", _execute_task),
        PipelineStep("record_history", _record_history),
    ]


__all__ = [
    "DEFAULT_STATE_PATH",
    "PipelineContext",
    "PipelineStep",
    "TaskPipeline",
    "build_default_pipeline",
]
