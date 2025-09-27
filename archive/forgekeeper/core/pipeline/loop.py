"""Pipeline loop implementation for the unified runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from forgekeeper.state_manager import load_state

from . import DEFAULT_STATE_PATH, PipelineContext, build_default_pipeline
from .runner import execute_pipeline
from .task_pipeline import TaskPipeline, TaskExecutor


def run(
    *,
    task_file: Optional[Path | str] = None,
    state_path: Path | str = DEFAULT_STATE_PATH,
    executor: TaskExecutor | None = None,
    auto_complete: Optional[bool] = None,
    guidelines: str = "",
) -> PipelineContext:
    """Execute the default pipeline once and persist the resulting state."""

    path = Path(state_path)
    state = load_state(path)
    pipeline = TaskPipeline(task_file)
    context = PipelineContext(
        pipeline=pipeline,
        state_path=path,
        state=state,
        executor=executor,
        auto_complete=auto_complete,
        guidelines=guidelines,
    )
    steps = build_default_pipeline(context)
    execute_pipeline(steps, context)
    return context


__all__ = ["run"]




