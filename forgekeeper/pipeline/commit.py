from __future__ import annotations

from pathlib import Path
from typing import Iterable

from git import Repo

from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.config import AUTONOMY_MODE, DEBUG_MODE
from forgekeeper.logger import get_logger
from forgekeeper.memory.episodic import append_entry

from .utils import slugify

MODULE_DIR = Path(__file__).resolve().parents[1]
log = get_logger(__name__, debug=DEBUG_MODE)


def commit_with_log(
    description: str, task_id: str, changed_files: Iterable[str], **kwargs
) -> dict:
    """Commit staged changes and record the outcome in episodic memory."""
    result = commit_and_push_changes(description, task_id=task_id, **kwargs)
    passed = bool(result.get("passed"))
    status = "success" if passed else "failed"
    sentiment = "positive" if passed else "negative"
    summary_text = f"Task '{description}' {status}."
    artifacts = [result.get("artifacts_path")] if result.get("artifacts_path") else []
    files = list(changed_files)
    append_entry(task_id, description, status, files, summary_text, artifacts, sentiment)
    result["changed_files"] = files
    return result


def step_commit(task: str, state: dict) -> bool:
    """Commit staged changes on a task-specific branch and log the result."""
    meta = state.get("current_task", {})
    task_id = meta.get("task_id", "task")
    slug = meta.get("slug", slugify(task))
    branch = f"fk/{task_id}-{slug}"
    repo = Repo(MODULE_DIR.parent)
    try:
        repo.git.checkout("-b", branch)
    except Exception:
        repo.git.checkout(branch)
    changed_files = state.get("changed_files", [])
    result = commit_with_log(
        task,
        task_id,
        changed_files,
        autonomous=True,
        auto_push=AUTONOMY_MODE,
    )
    state["commit_result"] = result
    return bool(result.get("passed", True))
