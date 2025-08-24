from __future__ import annotations

import json
from pathlib import Path

from forgekeeper.state_manager import save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, ENABLE_RECURSIVE_FIX
from forgekeeper.task_queue import TaskQueue
from forgekeeper.memory.episodic import append_entry
from forgekeeper.self_review import run_self_review, review_change_set
from forgekeeper.vcs.pr_api import create_draft_pr
from forgekeeper.task_review import (
    _mark_task_needs_review,
    _spawn_followup_task,
)

from .analyze import step_analyze
from .edit import step_edit
from .commit import step_commit
from .utils import slugify

log = get_logger(__name__, debug=DEBUG_MODE)

MODULE_DIR = Path(__file__).resolve().parents[1]
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"

PIPELINE = [step_analyze, step_edit, step_commit]


def execute_pipeline(task: str, state: dict) -> bool:
    """Run pipeline steps sequentially, saving progress after each step."""
    step_index = state.get("pipeline_step", 0)
    for idx in range(step_index, len(PIPELINE)):
        step = PIPELINE[idx]
        log.info(f"Executing step {idx + 1}/{len(PIPELINE)}: {step.__name__}")
        try:
            success = step(task, state)
        except Exception as exc:
            log.error(f"Step {step.__name__} failed: {exc}")
            state["pipeline_step"] = idx
            return False
        if not success:
            if idx == 1:
                state["analysis"] = []
            state["pipeline_step"] = idx
            return False
        state["pipeline_step"] = idx + 1
        save_state(state, STATE_PATH)
    return True


def _execute_pipeline(task: str, state: dict) -> bool:
    """Thin wrapper around :func:`execute_pipeline` for easy patching in tests."""

    return execute_pipeline(task, state)


def main(state: dict, state_path: Path = STATE_PATH) -> None:
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
        success = _execute_pipeline(task, state)
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

        review = review_change_set(task_id)
        review_artifact = Path("logs") / task_id / "self-review.json"
        append_entry(
            task_id,
            task,
            "change-set-review",
            review.get("changed_files", []),
            review.get("summary", ""),
            [str(review_artifact)],
            "positive" if review.get("passed") else "negative",
        )
        if review["passed"]:
            log.info("Change-set review passed. Running self-review...")
            review_passed = run_self_review(state, state_path)
            if review_passed:
                log.info("Task completed successfully.")
                try:
                    pr = create_draft_pr(state["current_task"], str(TASK_FILE))
                except Exception as exc:  # pragma: no cover - best effort
                    log.error(f"PR creation failed: {exc}")
                    pr = {}
                else:
                    pr_dir = MODULE_DIR.parent / "logs" / task_id
                    pr_dir.mkdir(parents=True, exist_ok=True)
                    (pr_dir / "pr.json").write_text(
                        json.dumps({"url": pr.get("html_url")}, indent=2),
                        encoding="utf-8",
                    )
                _mark_task_needs_review(state["current_task"].get("id", ""))

                summary = f"Attempt {attempt_num} for task '{task}' succeeded."
                append_entry(
                    task_id,
                    task,
                    "success",
                    changed_files,
                    summary,
                    artifacts,
                    "positive",
                )

                state.clear()
            else:
                log.error("Self-review failed. Progress saved for inspection.")
                summary = f"Attempt {attempt_num} for task '{task}' failed self-review."
                append_entry(
                    task_id,
                    task,
                    "self-review-failed",
                    changed_files,
                    summary,
                    artifacts,
                    "negative",
                )
                _spawn_followup_task(state["current_task"], review)
            break

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

        errors = "\n\n".join(
            res["output"] for res in review["tools"].values() if not res["passed"]
        )
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
