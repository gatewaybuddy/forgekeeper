from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from forgekeeper.app.chats.memory_store import get_memory, set_memory
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.config import DEBUG_MODE
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.logger import get_logger
from forgekeeper.memory.episodic import append_entry
from forgekeeper.task_pipeline import TaskPipeline

log = get_logger(__name__, debug=DEBUG_MODE)


def get_next_task(session_id: str):
    """Retrieve the next task from :class:`TaskPipeline` and log it in memory."""
    pipeline = TaskPipeline()
    task = pipeline.next_task()
    if not task:
        return None

    desc = getattr(task, "description", None)
    if desc is None and isinstance(task, dict):
        desc = task.get("title") or task.get("description") or ""

    memory = get_memory(session_id)
    queue = memory.get("task_queue", [])
    queue.append(desc)
    memory["task_queue"] = queue
    set_memory(session_id, memory)

    if isinstance(task, dict):
        return SimpleNamespace(description=desc, **task)
    return task


def execute_next_task(session_id: str) -> None:
    """Execute the next queued task using the coder agent."""
    task = get_next_task(session_id)
    if not task:
        log.info("No tasks available.")
        return

    from . import ask_coder  # Local import to avoid circular dependency

    task_id = f"{abs(hash(task.description)) % 1000000:06d}"
    coder_prompt = (
        "You are the Coder agent. Apply the following task to the repository:\n"
        f"{task.description}\n"
        "Respond with JSON containing 'file_path' and 'updated_code' representing"
        " the complete new file contents."
    )
    response = ask_coder(coder_prompt, session_id)
    try:
        from forgekeeper.app.utils.json_helpers import extract_json

        data = extract_json(response) if isinstance(response, str) else response
    except Exception as exc:  # pragma: no cover - defensive
        log.error(f"Failed to parse coder response: {exc}")
        append_entry(
            task_id,
            task.description,
            "parse-error",
            [],
            "Failed to parse coder response",
            [],
            "negative",
        )
        return
    file_path = data.get("file_path") if isinstance(data, dict) else None
    updated_code = data.get("updated_code", "") if isinstance(data, dict) else ""

    if not file_path:
        log.error("Coder response missing 'file_path'; aborting task.")
        append_entry(
            task_id,
            task.description,
            "no-file",
            [],
            "Coder response missing file path",
            [],
            "negative",
        )
        return

    p = Path(file_path)
    original = p.read_text(encoding="utf-8") if p.exists() else ""
    result = diff_and_stage_changes(
        original, updated_code, file_path, auto_stage=False, task_id=task_id
    )
    outcome = result.get("outcome")
    files = result.get("files", [])

    if outcome != "success":
        append_entry(
            task_id,
            task.description,
            outcome or "error",
            files,
            "Changes not staged",
            [],
            "negative",
        )
        return

    if input("Commit staged changes? [y/N]: ").strip().lower().startswith("y"):
        commit_and_push_changes(f"feat: {task.description}", task_id=task_id)
        TaskPipeline().mark_done(task.description)
        append_entry(
            task_id,
            task.description,
            "committed",
            files,
            "Changes committed",
            [],
            "positive",
        )
    else:
        from git import Repo

        repo = Repo(p.resolve().parent, search_parent_directories=True)
        repo.git.restore("--staged", file_path)
        repo.git.checkout("--", file_path)
        append_entry(
            task_id,
            task.description,
            "aborted",
            [],
            "Commit declined",
            [],
            "negative",
        )
