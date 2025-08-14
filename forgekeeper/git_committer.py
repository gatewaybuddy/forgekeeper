"""Utilities for committing and pushing Forgekeeper updates."""

from datetime import datetime
from pathlib import Path
import json
import shlex
import subprocess
from typing import Iterable, Optional

from git import Repo
from forgekeeper.logger import get_logger
from forgekeeper.config import (
    DEBUG_MODE,
    RUN_COMMIT_CHECKS,
    CHECKS_PY,
    CHECKS_TS,
)
from forgekeeper import self_review, diff_validator
from forgekeeper.memory.episodic import append_entry

log = get_logger(__name__, debug=DEBUG_MODE)


def _run_checks(commands: Optional[Iterable[str]], task_id: str) -> dict:
    """Run shell commands, capturing output and writing logs."""
    log_dir = Path(__file__).resolve().parent.parent / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifacts_path = log_dir / "commit-checks.json"

    if commands is None:
        commands = list(CHECKS_PY) + list(CHECKS_TS)
    else:
        commands = list(commands)

    results = []
    passed = True
    for command in commands:
        log.info(f"Running {command}")
        result = subprocess.run(
            shlex.split(command), capture_output=True, text=True
        )
        results.append(
            {
                "command": command,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )
        if result.returncode != 0:
            passed = False
            log.error(
                "\n".join(
                    [
                        f"Command failed: {command}",
                        f"stdout:\n{result.stdout}",
                        f"stderr:\n{result.stderr}",
                    ]
                )
            )

    artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    # Display results for each command so callers can see lint/test output
    for r in results:
        status = "passed" if r["returncode"] == 0 else "failed"
        log.info(f"Check {r['command']} {status}")
        if r["stdout"].strip():
            log.info(f"stdout:\n{r['stdout']}")
        if r["stderr"].strip():
            log.info(f"stderr:\n{r['stderr']}")

    failing = [r["command"] for r in results if r["returncode"] != 0]
    if passed:
        log.info(f"All {len(results)} checks passed")
    else:
        log.error(f"Checks failed: {', '.join(failing)}")

    return {
        "passed": passed,
        "artifacts_path": str(artifacts_path),
        "results": results,
    }


def commit_and_push_changes(
    commit_message: str,
    create_branch: bool = False,
    branch_prefix: str = "forgekeeper/self-edit",
    run_checks: bool = RUN_COMMIT_CHECKS,
    checks: Optional[Iterable[str]] = None,
    autonomous: bool = False,
    task_id: str = "manual",
    auto_push: bool = False,
) -> dict:
    """Commit staged changes and optionally push them on a new branch."""
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

    check_result = {
        "passed": True,
        "artifacts_path": "",
        "results": [],
        "pre_review": pre_review,
        "diff_validation": diff_validation,
    }
    if run_checks:
        run_py = any(f.endswith(".py") for f in files)
        run_ts = any(f.endswith(suf) for f in files for suf in (".ts", ".tsx"))
        commands = []
        if run_py:
            commands.extend(CHECKS_PY)
        if run_ts:
            commands.extend(CHECKS_TS)
        check_result.update(_run_checks(commands, task_id))
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

    changelog = ""
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
        try:
            origin = repo.remote()
            if autonomous:
                if auto_push:
                    origin.push(branch_name)
                    log.info("Pushed to remote")
                else:
                    log.info("Auto push disabled; skipping push")
            else:
                if input(
                    f"Push branch {branch_name} to remote? [y/N]: "
                ).strip().lower() in {"y", "yes"}:
                    origin.push(branch_name)
                    log.info("Pushed to remote")
                else:
                    log.info("Push to remote skipped")
        except Exception as exc:
            log.error(f"Push failed: {exc}")

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
    return check_result
