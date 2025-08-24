from __future__ import annotations

import json
from pathlib import Path

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.memory.episodic import append_entry
from forgekeeper.self_review import run_self_review, review_change_set
from forgekeeper.vcs.pr_api import create_draft_pr
from forgekeeper.task_review import (
    _mark_task_needs_review,
    _spawn_followup_task,
)

log = get_logger(__name__, debug=DEBUG_MODE)

MODULE_DIR = Path(__file__).resolve().parents[1]
TASK_FILE = MODULE_DIR.parent / "tasks.md"


def run_review(
    task: str,
    state: dict,
    state_path: Path,
    attempt_num: int,
    changed_files: list[str],
    artifacts: list[str],
) -> dict:
    """Run change-set review, self-review, and create a draft PR on success.

    Returns a dictionary with keys:
        - ``status``: ``"success"``, ``"self_review_failed"``, or ``"review_failed"``
        - ``review``: result dictionary from :func:`review_change_set`
        - ``errors``: concatenated tool output on review failure
    """
    task_id = state["current_task"]["task_id"]

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

    if review.get("passed"):
        log.info("Change-set review passed. Running self-review...")
        review_passed = run_self_review(state, state_path)
        if review_passed:
            log.info("Task completed successfully.")
            try:
                pr = create_draft_pr(state["current_task"], str(TASK_FILE))
            except Exception as exc:  # pragma: no cover - best effort
                log.error(f"PR creation failed: {exc}")
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
            return {"status": "success", "review": review}

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
        _spawn_followup_task(state.get("current_task", {}), review)
        return {"status": "self_review_failed", "review": review}

    log.error("Change-set review failed.")
    errors = "\n\n".join(
        res["output"] for res in review.get("tools", {}).values() if not res.get("passed")
    )
    return {"status": "review_failed", "review": review, "errors": errors}
