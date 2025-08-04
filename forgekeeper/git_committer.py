"""Utilities for committing and pushing Forgekeeper updates."""

from datetime import datetime
from pathlib import Path
import shlex
import subprocess
from typing import Iterable, Optional

from git import Repo
from forgekeeper.logger import get_logger
from forgekeeper.config import (
    DEBUG_MODE,
    RUN_COMMIT_CHECKS,
    COMMIT_CHECKS,
)

log = get_logger(__name__, debug=DEBUG_MODE)


def _run_checks(commands: Iterable[str]) -> bool:
    for command in commands:
        log.info(f"Running {command}")
        result = subprocess.run(
            shlex.split(command), capture_output=True, text=True
        )
        if result.returncode != 0:
            log.error(
                f"{command} failed with code {result.returncode}\n"
                f"{result.stdout}\n{result.stderr}"
            )
            return False
    return True


def commit_and_push_changes(
    commit_message: str,
    create_branch: bool = False,
    branch_prefix: str = "forgekeeper/self-edit",
    run_checks: bool = RUN_COMMIT_CHECKS,
    checks: Optional[Iterable[str]] = None,
    autonomous: bool = False,
) -> None:
    """Commit staged changes and optionally push them on a new branch.

    Parameters
    ----------
    commit_message:
        The commit message to use for the commit.
    create_branch:
        Whether a new timestamped branch should be created before committing.
    branch_prefix:
        Prefix for the auto-created branch when ``create_branch`` is ``True``.
    run_checks:
        Whether to run validation commands before committing.
    checks:
        Iterable of shell commands to run when ``run_checks`` is ``True``.
    autonomous:
        If ``True``, skip the confirmation prompt and push automatically.
    """
    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)

    if run_checks:
        commands = checks if checks is not None else COMMIT_CHECKS
        if not _run_checks(commands):
            log.error("Aborting commit due to failing checks")
            return

    if create_branch:
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        branch_name = f"{branch_prefix}-{timestamp}"
        repo.git.checkout('-b', branch_name)
        log.info(f"Created branch {branch_name}")
    else:
        branch_name = repo.active_branch.name

    if repo.is_dirty(index=True, working_tree=False, untracked_files=False):
        repo.index.commit(commit_message)
        log.info(f"Committed changes on {branch_name}: {commit_message}")
        try:
            origin = repo.remote()
            if autonomous or input(
                f"Push branch {branch_name} to remote? [y/N]: "
            ).strip().lower() in {"y", "yes"}:
                origin.push(branch_name)
                log.info("Pushed to remote")
            else:
                log.info("Push to remote skipped")
        except Exception as exc:
            log.error(f"Push failed: {exc}")
    else:
        log.info("No staged changes to commit")
