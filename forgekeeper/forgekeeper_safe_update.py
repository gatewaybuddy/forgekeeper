# DO NOT EDIT: Safe Update Runner
"""Execute a safe self-edit-and-restart sequence for Forgekeeper."""

import os
from pathlib import Path

from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.pipeline import run_update_pipeline


def run_safe_update() -> None:
    """Run the self-edit routine with review retries and restart the process."""
    state = load_state()
    task = state.get("current_task", "Automated update")
    log = get_logger(__name__, debug=DEBUG_MODE)
    log.info(f"Running safe update for task: {task}")

    max_retries = state.get("review_max_retries", 3)
    attempt = 0
    success = False
    while attempt < max_retries and not success:
        attempt += 1
        log.info(f"Update attempt {attempt}/{max_retries}")
        try:
            success = run_update_pipeline(task, state)
        except Exception as err:
            log.error(f"Update pipeline failed: {err}")
            success = False
        if not success:
            log.warning("Self-review failed; retrying")

    state["last_update_success"] = success
    state["review_attempts"] = attempt
    save_state(state)

    python = Path(os.sys.executable)
    os.execv(python, [str(python), "forgekeeper/main.py"])


if __name__ == "__main__":
    run_safe_update()
