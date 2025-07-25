"""Main entrypoint for Forgekeeper."""

from pathlib import Path
from forgekeeper.state_manager import load_state, save_state

STATE_PATH = "forgekeeper/state.json"
TASK_FILE = "tasks.md"


def _read_next_task() -> str | None:
    """Return the first unchecked task from TASK_FILE if available."""
    task_path = Path(TASK_FILE)
    if not task_path.is_file():
        return None
    for line in task_path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("- [ ]"):
            return line.split("- [ ]", 1)[1].strip()
    return None


def main() -> None:
    state = load_state(STATE_PATH)
    if state.get("current_task"):
        print(f"Resuming task: {state['current_task']}")
    else:
        task = _read_next_task()
        if not task:
            print("No tasks available. Exiting.")
            return
        state["current_task"] = task
        print(f"Starting new task: {task}")
        save_state(state, STATE_PATH)

    print("Running Forgekeeper agent logic...")
    # Placeholder for real task execution logic.

    save_state(state, STATE_PATH)


if __name__ == "__main__":
    main()
