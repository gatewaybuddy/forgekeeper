from __future__ import annotations

from pathlib import Path

from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.memory.episodic import append_entry
from forgekeeper.pipeline import TaskPipeline


def stage_and_commit_task(
    file_path: str, updated_code: str, task_description: str, task_id: str
) -> None:
    """Stage the diff and optionally commit/push the changes."""
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
            task_description,
            outcome or "error",
            files,
            "Changes not staged",
            [],
            "negative",
        )
        return

    if input("Commit staged changes? [y/N]: ").strip().lower().startswith("y"):
        commit_and_push_changes(f"feat: {task_description}", task_id=task_id)
        TaskPipeline().mark_done(task_description)
        append_entry(
            task_id,
            task_description,
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
            task_description,
            "aborted",
            [],
            "Commit declined",
            [],
            "negative",
        )
