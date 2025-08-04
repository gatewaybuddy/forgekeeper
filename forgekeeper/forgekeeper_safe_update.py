# DO NOT EDIT: Safe Update Runner
"""Execute a safe self-edit-and-restart sequence for Forgekeeper."""

import os
from pathlib import Path

from forgekeeper.state_manager import load_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.pipeline import run_update_pipeline


def run_safe_update() -> None:
    """Run the self-edit routine and restart the main process."""
    state = load_state()
    task = state.get("current_task", "Automated update")
    log = get_logger(__name__, debug=DEBUG_MODE)
    log.info(f"Running safe update for task: {task}")

    try:
        run_update_pipeline(task)
    except Exception as err:
        log.error(f"Update pipeline failed: {err}")

    python = Path(os.sys.executable)
    os.execv(python, [str(python), "forgekeeper/main.py"])


if __name__ == "__main__":
    run_safe_update()
