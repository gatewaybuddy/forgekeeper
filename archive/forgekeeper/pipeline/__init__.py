"""Compatibility layer for legacy `forgekeeper.pipeline` imports."""

from __future__ import annotations

from forgekeeper.core.pipeline import (
    DEFAULT_STATE_PATH,
    PipelineContext,
    PipelineStep,
    TaskPipeline,
    build_default_pipeline,
)
from forgekeeper.core.pipeline import loop
from forgekeeper.core.pipeline.runner import execute_pipeline

__all__ = [
    "DEFAULT_STATE_PATH",
    "PipelineContext",
    "PipelineStep",
    "TaskPipeline",
    "build_default_pipeline",
    "execute_pipeline",
    "loop",
]
