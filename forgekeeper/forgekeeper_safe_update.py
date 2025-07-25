# DO NOT EDIT: Safe Update Runner
"""Execute a safe self-edit-and-restart sequence for Forgekeeper."""

import os
import subprocess
from pathlib import Path

from forgekeeper.state_manager import load_state


def run_safe_update() -> None:
    """Run the self-edit routine and restart the main process."""
    state = load_state()
    task = state.get("current_task", "Automated update")
    print(f"Running safe update for task: {task}")

    # Placeholder for agent logic that would modify files based on `task`
    # In a real system this would call the self-editing agent.

    try:
        subprocess.run(["git", "add", "-A"], check=True)
        subprocess.run(["git", "commit", "-m", task], check=True)
    except subprocess.CalledProcessError as err:
        print(f"Git commit failed: {err}")

    python = Path(os.sys.executable)
    os.execv(python, [str(python), "forgekeeper/main.py"])


if __name__ == "__main__":
    run_safe_update()
