from __future__ import annotations

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger

from .task_retriever import get_next_task
from .coder_io import request_coder_update
from .task_committer import stage_and_commit_task

log = get_logger(__name__, debug=DEBUG_MODE)


def execute_next_task(session_id: str) -> None:
    """Execute the next queued task using the coder agent."""
    task = get_next_task(session_id)
    if not task:
        log.info("No tasks available.")
        return

    task_id = f"{abs(hash(task.description)) % 1000000:06d}"
    file_path, updated_code = request_coder_update(task.description, session_id, task_id)
    if not file_path:
        return

    stage_and_commit_task(file_path, updated_code, task.description, task_id)
