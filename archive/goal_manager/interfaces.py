"""Interfaces for goal manager dependencies."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class PipelineExecutor(Protocol):
    """Protocol for the task pipeline executor used by the goal manager."""

    def next_task(self) -> Any | None:
        """Return the next queued task, or ``None`` if the queue is empty."""

    def run_task(self, *args: Any, **kwargs: Any) -> Any:
        """Execute a task using the pipeline's execution flow."""

    def update_status(self, description: str, status: str) -> None:
        """Persist a status update for the task identified by ``description``."""


__all__ = ["PipelineExecutor"]
