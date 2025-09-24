"""Compatibility helpers for sandbox execution in the legacy git committer."""

from __future__ import annotations

import logging
from typing import Iterable

from forgekeeper.core.git.sandbox import run_sandbox_checks

LOG = logging.getLogger("forgekeeper.git.sandbox_checks")

try:  # pragma: no cover - optional dependency during migration
    from forgekeeper.memory.episodic import append_entry
except Exception:  # pragma: no cover - fallback for partially migrated tree

    def append_entry(*_args, **_kwargs) -> None:
        LOG.debug("episodic.append_entry unavailable; sandbox failures will not be logged")


def _run_sandbox_checks(
    files: Iterable[str],
    commit_message: str,
    task_id: str,
    run_checks: bool,
    pre_review: dict,
    diff_validation: dict,
) -> dict:
    """Run sandbox checks and record failures for legacy callers."""

    files_list = list(files)
    sandbox_result = run_sandbox_checks(files_list, task_id=task_id, run_checks=run_checks)
    sandbox_result.setdefault("files", files_list)
    if sandbox_result.get("passed", False):
        sandbox_result.setdefault("pre_review", pre_review)
        sandbox_result.setdefault("diff_validation", diff_validation)
        return sandbox_result

    LOG.error("Sandbox checks failed; aborting commit")
    append_entry(
        task_id,
        commit_message,
        "sandbox-failed",
        files_list,
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


__all__ = ["_run_sandbox_checks"]
