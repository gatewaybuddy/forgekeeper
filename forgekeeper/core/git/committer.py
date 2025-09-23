"""Git commit orchestration for Forgekeeper."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, Optional

from git import Repo

from forgekeeper.config import AUTO_PUSH, DEBUG_MODE, RUN_COMMIT_CHECKS
from forgekeeper.git import sandbox_checks
from forgekeeper.memory.episodic import append_entry
from . import checks as git_checks
from . import commit_ops
from . import pre_review

LOG = logging.getLogger("forgekeeper.core.git.committer")


def _commit_and_push_impl(
    commit_message: str,
    *,
    create_branch: bool,
    branch_prefix: str,
    run_checks: bool,
    commands: Optional[Iterable[str]],
    autonomous: bool,
    task_id: str,
    auto_push: bool,
    rationale: str | None,
) -> dict:
    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)

    review_result = pre_review.run_pre_review(commit_message, task_id, autonomous)
    if not review_result.get("passed", False):
        return review_result

    files = review_result.get("files", [])
    sandbox_result = sandbox_checks._run_sandbox_checks(
        files,
        commit_message,
        task_id,
        run_checks,
        review_result["pre_review"],
        review_result["diff_validation"],
    )
    if not sandbox_result.get("passed", False):
        return sandbox_result

    check_result = {
        "passed": True,
        "artifacts_path": "",
        "results": [],
        "pre_review": review_result["pre_review"],
        "diff_validation": review_result["diff_validation"],
        "sandbox": sandbox_result,
    }

    if run_checks:
        check_result.update(git_checks.run_checks(files, task_id, commands))
        if not check_result["passed"]:
            LOG.error("Aborting commit due to failing checks")
            check_result["aborted"] = True
            append_entry(
                task_id,
                commit_message,
                "checks-failed",
                files,
                "Checks failed",
                [check_result.get("artifacts_path")] if check_result.get("artifacts_path") else [],
            )
            return check_result

    commit_result = commit_ops.commit_changes(
        repo,
        commit_message,
        files,
        task_id,
        create_branch,
        branch_prefix,
        autonomous,
        check_result.get("artifacts_path", ""),
    )
    check_result["changelog"] = commit_result.get("changelog", "")
    check_result["changelog_path"] = commit_result.get("changelog_path", "")
    branch_name = commit_result.get("branch_name", repo.active_branch.name)

    if commit_result.get("aborted"):
        check_result["passed"] = False
        check_result["aborted"] = True
        return check_result
    if not commit_result.get("committed"):
        check_result["pushed"] = False
        check_result["rationale"] = rationale or commit_message
        return check_result

    push_result = commit_ops.push_branch(
        repo,
        branch_name,
        commit_message,
        files,
        task_id,
        autonomous,
        auto_push,
        check_result["changelog_path"],
        check_result["changelog"],
        rationale,
    )
    check_result["pushed"] = push_result.get("pushed", False)
    check_result["rationale"] = rationale or commit_message
    return check_result


def commit_and_push_changes(
    commit_message: str,
    *,
    create_branch: bool = False,
    branch_prefix: str = "forgekeeper/self-edit",
    run_checks: bool = RUN_COMMIT_CHECKS,
    commands: Optional[Iterable[str]] = None,
    autonomous: bool = False,
    task_id: str = "manual",
    auto_push: bool = AUTO_PUSH,
    rationale: str | None = None,
) -> dict:
    """Commit staged changes and optionally push them to a branch."""

    action = {
        "module": __name__,
        "function": "_commit_and_push_impl",
        "args": [],
        "kwargs": {
            "commit_message": commit_message,
            "create_branch": create_branch,
            "branch_prefix": branch_prefix,
            "run_checks": run_checks,
            "commands": list(commands) if commands is not None else None,
            "autonomous": autonomous,
            "task_id": task_id,
            "auto_push": auto_push or autonomous,
            "rationale": rationale,
        },
    }

    from forgekeeper.git import outbox as git_outbox

    return git_outbox.run_with_outbox(action, _commit_and_push_impl, **action["kwargs"])


__all__ = ["commit_and_push_changes"]
