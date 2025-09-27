"""Pipeline runner helpers."""

from __future__ import annotations

from typing import Iterable

from . import PipelineContext, PipelineStep


def execute_pipeline(steps: Iterable[PipelineStep], context: PipelineContext) -> PipelineContext:
    """Iterate over pipeline steps, executing each handler with shared context."""

    for step in steps:
        step.handler(context)
        context.history.append(step.name)
    return context


__all__ = ["execute_pipeline"]
