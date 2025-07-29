"""Utilities for committing and pushing Forgekeeper updates."""

from datetime import datetime
from pathlib import Path

from git import Repo
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)


def commit_and_push_changes(commit_message: str, create_branch: bool = False, branch_prefix: str = "forgekeeper/self-edit") -> None:
    """Commit staged changes and optionally push them on a new branch."""
    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)

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
            origin.push(branch_name)
            log.info("Pushed to remote")
        except Exception as exc:
            log.error(f"Push failed: {exc}")
    else:
        log.info("No staged changes to commit")
