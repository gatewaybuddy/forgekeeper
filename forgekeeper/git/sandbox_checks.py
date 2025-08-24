"""Helpers for running sandbox checks."""

from __future__ import annotations

from typing import Iterable

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.git import sandbox
from forgekeeper.memory.episodic import append_entry


log = get_logger(__name__, debug=DEBUG_MODE)


def _run_sandbox_checks(
    files: Iterable[str],
    commit_message: str,
    task_id: str,
    run_checks: bool,
    pre_review: dict,
    diff_validation: dict,
) -> dict:
    """Run sandbox checks and record failures."""

    sandbox_result = sandbox.run_sandbox_checks(files, task_id=task_id, run_checks=run_checks)
    if not sandbox_result.get("passed", False):
        log.error("Aborting commit due to failing sandbox checks")
        append_entry(
            task_id,
            commit_message,
            "sandbox-failed",
            files,
            "Sandbox checks failed",
            [sandbox_result.get("artifacts_path")] if sandbox_result.get("artifacts_path") else [],
        )
        sandbox_result.update(
            {
                "pre_review": pre_review,
                "diff_validation": diff_validation,
                "aborted": True,
            }
        )
    return sandbox_result

