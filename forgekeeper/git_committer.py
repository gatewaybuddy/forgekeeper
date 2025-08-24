"""Utilities for committing and pushing Forgekeeper updates."""

from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from git import Repo
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, RUN_COMMIT_CHECKS
from forgekeeper import self_review, diff_validator
from forgekeeper.memory.episodic import append_entry
from forgekeeper.git import checks as git_checks, sandbox, outbox

log = get_logger(__name__, debug=DEBUG_MODE)


def _commit_and_push_impl(
    commit_message: str,
    create_branch: bool = False,
    branch_prefix: str = "forgekeeper/self-edit",
    run_checks: bool = RUN_COMMIT_CHECKS,
    commands: Optional[Iterable[str]] = None,
    autonomous: bool = False,
    task_id: str = "manual",
    auto_push: bool = False,
) -> dict:
    """Internal helper performing commit/push logic."""
    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)
    pre_review = self_review.review_staged_changes(task_id)
    files = pre_review.get("staged_files", [])
    if not pre_review.get("passed", False):
        if autonomous:
            log.error("Pre-commit review failed in autonomous mode")
            append_entry(
                task_id,
                commit_message,
                "pre-review-failed",
                files,
                pre_review.get("summary", "Pre-commit review failed"),
                [],
            )
            return {"passed": False, "pre_review": pre_review, "aborted": True}
        resp = input(
            "Proceed with commit despite review issues? [y/N]: "
        ).strip().lower()
        if resp not in {"y", "yes"}:
            log.info("Commit aborted due to review issues")
            append_entry(
                task_id,
                commit_message,
                "pre-review-aborted",
                files,
                pre_review.get("summary", "Commit aborted due to review issues"),
                [],
            )
            return {"passed": False, "pre_review": pre_review, "aborted": True}

    diff_validation = diff_validator.validate_staged_diffs()
    if not diff_validation.get("passed", False):
        log.error("Diff validation failed; aborting commit")
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
            "aborted": True,
        }

    sandbox_result = sandbox.run_sandbox_checks(
        files, task_id=task_id, run_checks=run_checks
    )
    if not sandbox_result.get("passed", False):
        log.error("Aborting commit due to failing sandbox checks")
        append_entry(
            task_id,
            commit_message,
            "sandbox-failed",
            files,
            "Sandbox checks failed",
            [sandbox_result.get("artifacts_path")]
            if sandbox_result.get("artifacts_path")
            else [],
        )
        sandbox_result.update(
            {
                "pre_review": pre_review,
                "diff_validation": diff_validation,
                "aborted": True,
            }
        )
        return sandbox_result

    check_result = {
        "passed": True,
        "artifacts_path": "",
        "results": [],
        "pre_review": pre_review,
        "diff_validation": diff_validation,
        "sandbox": sandbox_result,
    }
    if run_checks:
        check_result.update(git_checks.run_checks(files, task_id, commands))
        if not check_result["passed"]:
            log.error("Aborting commit due to failing checks")
            check_result["aborted"] = True
            append_entry(
                task_id,
                commit_message,
                "checks-failed",
                files,
                "Checks failed",
                [check_result.get("artifacts_path")]
                if check_result.get("artifacts_path")
                else [],
            )
            return check_result

    if create_branch:
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        branch_name = f"{branch_prefix}-{timestamp}"
        repo.git.checkout('-b', branch_name)
        log.info(f"Created branch {branch_name}")
    else:
        branch_name = repo.active_branch.name

    log_dir = Path(__file__).resolve().parent.parent / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    changelog = ""
    changelog_path = log_dir / "changelog.txt"
    pushed = False
    if repo.is_dirty(index=True, working_tree=False, untracked_files=False):
        if not autonomous:
            resp = input("Commit staged changes? [y/N]: ").strip().lower()
            if resp not in {"y", "yes"}:
                log.info("Commit aborted by user")
                check_result["passed"] = False
                check_result["aborted"] = True
                append_entry(
                    task_id,
                    commit_message,
                    "commit-declined",
                    files,
                    "Commit aborted by user",
                    [check_result.get("artifacts_path")]
                    if check_result.get("artifacts_path")
                    else [],
                )
                return check_result
        repo.index.commit(commit_message)
        log.info(f"Committed changes on {branch_name}: {commit_message}")
        changelog = repo.git.log("-1", "--stat")
        changelog_path.write_text(changelog, encoding="utf-8")
        append_entry(
            task_id,
            commit_message,
            "committed",
            files,
            f"Committed changes on {branch_name}: {commit_message}",
            [check_result.get("artifacts_path")]
            if check_result.get("artifacts_path")
            else [],
        )
        try:
            origin = repo.remote()
            if autonomous or auto_push:
                origin.push(branch_name)
                pushed = True
                log.info("Pushed to remote")
            else:
                if input(
                    f"Push branch {branch_name} to remote? [y/N]: "
                ).strip().lower() in {"y", "yes"}:
                    origin.push(branch_name)
                    pushed = True
                    log.info("Pushed to remote")
                else:
                    log.info("Push to remote skipped")
        except Exception as exc:
            log.error(f"Push failed: {exc}")
            append_entry(
                task_id,
                commit_message,
                "push-failed",
                files,
                f"Push failed: {exc}",
                [str(changelog_path)] if changelog else [],
                rationale=commit_message,
            )
        if pushed:
            rationale = commit_message
            summary = (
                f"Pushed changes on {branch_name}: {commit_message}. "
                f"Changelog at {changelog_path}"
            )
            log.info(summary)
            append_entry(
                task_id,
                commit_message,
                "pushed",
                files,
                summary,
                [str(changelog_path)] if changelog else [],
                rationale=rationale,
            )
    else:
        log.info("No staged changes to commit")
        append_entry(
            task_id,
            commit_message,
            "no-changes",
            [],
            "No staged changes to commit",
            [check_result.get("artifacts_path")]
            if check_result.get("artifacts_path")
            else [],
        )

    check_result["changelog"] = changelog
    check_result["changelog_path"] = str(changelog_path) if changelog else ""
    check_result["pushed"] = pushed
    check_result["rationale"] = commit_message
    return check_result


def commit_and_push_changes(
    commit_message: str,
    create_branch: bool = False,
    branch_prefix: str = "forgekeeper/self-edit",
    run_checks: bool = RUN_COMMIT_CHECKS,
    commands: Optional[Iterable[str]] = None,
    autonomous: bool = False,
    task_id: str = "manual",
    auto_push: bool = False,
) -> dict:
    """Commit staged changes and optionally push them on a new branch.

    When ``autonomous`` is True, changes are pushed automatically and a
    changelog file plus commit rationale are logged for each push and
    returned in the result dictionary.
    """
    kwargs = {
        "commit_message": commit_message,
        "create_branch": create_branch,
        "branch_prefix": branch_prefix,
        "run_checks": run_checks,
        "commands": commands,
        "autonomous": autonomous,
        "task_id": task_id,
        "auto_push": auto_push or autonomous,
    }
    action = {
        "module": __name__,
        "function": "_commit_and_push_impl",
        "args": [],
        "kwargs": kwargs,
    }
    return outbox.run_with_outbox(action, _commit_and_push_impl, **kwargs)
