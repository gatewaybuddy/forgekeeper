"""Wrapper utilities for sandboxed checks."""

from __future__ import annotations

from typing import Iterable

from forgekeeper import sandbox as _sandbox


def run_sandbox_checks(files: Iterable[str], task_id: str = "manual", run_checks: bool = True) -> dict:
    """Run sandbox checks if enabled."""
    if not run_checks:
        return {"passed": True, "artifacts_path": "", "results": []}
    return _sandbox.run_sandbox_checks(files, task_id=task_id)
