from __future__ import annotations

import json
from pathlib import Path

from forgekeeper.state_manager import save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, ENABLE_RECURSIVE_FIX
from forgekeeper.tasks.queue import TaskQueue
from forgekeeper.memory.episodic import append_entry

from . import execution, review
from .utils import slugify

log = get_logger(__name__, debug=DEBUG_MODE)

MODULE_DIR = Path(__file__).resolve().parents[1]
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"


def run(state: dict, state_path: Path = STATE_PATH) -> None:
    """Execute or resume the current task's pipeline loop."""
    current = state.get("current_task")
    if current:
        task = current.get("title") or current.get("description", "")
        state["current_task"].setdefault("title", task)
        log.info(f"Resuming task: {task}")
    else:
        queue = TaskQueue(TASK_FILE)
        meta = queue.next_task()
        if not meta:
            log.info("No tasks available. Exiting.")
            return
        task = meta["title"]
        task_id = meta.get("id", f"{abs(hash(task)) % 1000000:06d}")
        slug = slugify(task)[:40]
        state["current_task"] = {**meta, "task_id": task_id, "slug": slug}
        state["pipeline_step"] = 0
        state["attempt"] = 1
        state["fix_guidelines"] = ""
        log.info(f"Starting new task: {task}")
        log_dir = MODULE_DIR.parent / "logs" / task_id
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / "prompt.txt").write_text(task, encoding="utf-8")
        save_state(state, state_path)

    task = state["current_task"].get("title") or state["current_task"].get("description", "")
    task_id = state["current_task"]["task_id"]
    state.setdefault("attempt", 1)

    while True:
        log.info("Dispatching task to execution pipeline...")
        success = execution._execute_pipeline(task, state, state_path)
        attempt_num = state.get("attempt", 1)
        changed_files = state.get("changed_files", [])
        log_dir = Path("logs") / task_id
        artifacts = [str(log_dir)] if log_dir.exists() else []

        if not success:
            log.info("Pipeline incomplete. Progress saved for resume.")
            save_state(state, state_path)
            summary = f"Attempt {attempt_num} for task '{task}' did not complete the pipeline."
            append_entry(
                task_id,
                task,
                "pipeline-incomplete",
                changed_files,
                summary,
                artifacts,
                "negative",
            )
            return

        result = review.run_review(task, state, state_path, attempt_num, changed_files, artifacts)
        status = result["status"]
        if status == "success" or status == "self_review_failed":
            break

        errors = result.get("errors", "")
        log.error("Change-set review failed.")
        if not ENABLE_RECURSIVE_FIX or state.get("attempt", 1) >= 3:
            log.error("Maximum attempts reached or recursive fix disabled.")
            artifact = Path("logs") / task_id / "self-review.json"
            state.clear()
            state["blocked_artifact"] = str(artifact)
            artifacts.append(str(artifact))
            summary = f"Attempt {attempt_num} for task '{task}' failed change-set review."
            append_entry(
                task_id,
                task,
                "failed",
                changed_files,
                summary,
                artifacts,
                "negative",
            )
            break

        state["fix_guidelines"] = f"Fix these exact lints/tests:\n{errors}"
        state["attempt"] = attempt_num + 1
        state["pipeline_step"] = 1
        save_state(state, state_path)
        summary = f"Attempt {attempt_num} for task '{task}' failed review; retrying."
        append_entry(
            task_id,
            task,
            "retry",
            changed_files,
            summary,
            artifacts,
            "neutral",
        )

    save_state(state, state_path)
