from pathlib import Path

from git import Repo

from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.config import AUTONOMY_MODE
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

from .utils import slugify

MODULE_DIR = Path(__file__).resolve().parents[1]
log = get_logger(__name__, debug=DEBUG_MODE)


def step_commit(task: str, state: dict) -> bool:
    """Commit staged changes on a task-specific branch."""
    meta = state.get("current_task", {})
    task_id = meta.get("task_id", "task")
    slug = meta.get("slug", slugify(task))
    branch = f"fk/{task_id}-{slug}"
    repo = Repo(MODULE_DIR.parent)
    try:
        repo.git.checkout("-b", branch)
    except Exception:
        repo.git.checkout(branch)
    result = commit_and_push_changes(
        task,
        autonomous=True,
        task_id=task_id,
        auto_push=AUTONOMY_MODE,
    )
    if not result.get("passed", True):
        return False
    return True
