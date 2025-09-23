"""Pre-commit review helpers."""

from __future__ import annotations

import logging

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger
from forgekeeper import diff_validator, self_review
from forgekeeper.memory.episodic import append_entry

LOG = get_logger(__name__, debug=DEBUG_MODE)


def run_pre_review(commit_message: str, task_id: str, autonomous: bool) -> dict:
    """Run self-review and diff validation prior to committing."""

    pre_review = self_review.review_staged_changes(task_id)
    files = pre_review.get("staged_files", [])
    if not pre_review.get("passed", False):
        if autonomous:
            LOG.error("Pre-review failed in autonomous mode")
            append_entry(
                task_id,
                commit_message,
                "pre-review-failed",
                files,
                pre_review.get("summary", "Pre-review failed"),
                [],
            )
            return {"passed": False, "pre_review": pre_review, "files": files, "aborted": True}
        resp = input("Proceed with commit despite review issues? [y/N]: ").strip().lower()
        if resp not in {"y", "yes"}:
            LOG.info("Commit aborted due to review issues")
            append_entry(
                task_id,
                commit_message,
                "pre-review-aborted",
                files,
                pre_review.get("summary", "Commit aborted due to review issues"),
                [],
            )
            return {"passed": False, "pre_review": pre_review, "files": files, "aborted": True}

    diff_validation = diff_validator.validate_staged_diffs()
    if not diff_validation.get("passed", False):
        LOG.error("Diff validation failed")
        append_entry(
            task_id,
            commit_message,
            "diff-validation-failed",
            files,
            "; ".join(diff_validation.get("issues", [])) or "Diff validation failed",
            [],
        )
        return {
            "passed": False,
            "pre_review": pre_review,
            "diff_validation": diff_validation,
            "files": files,
            "aborted": True,
        }

    return {
        "passed": True,
        "pre_review": pre_review,
        "diff_validation": diff_validation,
        "files": files,
    }


__all__ = ["run_pre_review"]
