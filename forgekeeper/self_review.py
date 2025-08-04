"""Utilities for reviewing recent work against the active task."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Dict

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.state_manager import save_state

log = get_logger(__name__, debug=DEBUG_MODE)


def run_self_review(state: Dict, state_path: Path | str = Path("forgekeeper/state.json")) -> bool:
    """Run a simple self-review against the latest commit.

    Parameters
    ----------
    state : dict
        Current execution state. Expected to contain ``current_task``.
    state_path : Path | str
        Path where the updated state should be persisted.

    Returns
    -------
    bool
        ``True`` if the review passes, otherwise ``False``.
    """

    path = Path(state_path)
    task = state.get("current_task", "")

    commit_msg = ""
    try:
        result = subprocess.run(
            ["git", "log", "-n", "1", "--pretty=%B"],
            capture_output=True,
            text=True,
            check=True,
        )
        commit_msg = result.stdout.strip()
    except subprocess.CalledProcessError as exc:
        log.error("Failed to read last commit message: %s", exc)

    review_passed = bool(task) and task.lower() in commit_msg.lower()

    state["last_review"] = {
        "task": task,
        "commit_message": commit_msg,
        "passed": review_passed,
    }
    save_state(state, path)

    if review_passed:
        log.info("Self-review passed for task '%s'", task)
    else:
        log.error("Self-review failed for task '%s'", task)

    return review_passed

