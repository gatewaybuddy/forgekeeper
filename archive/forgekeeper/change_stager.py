"""Compatibility wrapper exposing the unified change stager."""

from __future__ import annotations

from forgekeeper.core.change_stager import (
    StageResult,
    diff_and_stage_changes,
    run_sandbox_checks,
)

__all__ = ["StageResult", "diff_and_stage_changes", "run_sandbox_checks"]
