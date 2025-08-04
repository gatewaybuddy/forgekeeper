"""Main entrypoint for Forgekeeper."""

from pathlib import Path
from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.self_review import run_self_review

STATE_PATH = "forgekeeper/state.json"
TASK_FILE = "tasks.md"


def _read_next_task() -> str | None:
    """Return the first unchecked task from ``TASK_FILE`` if available."""
    task_path = Path(TASK_FILE)
    if not task_path.is_file():
        return None
    for line in task_path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("- [ ]"):
            return line.split("- [ ]", 1)[1].strip()
    return None


def _check_off_task(task: str) -> None:
    """Mark ``task`` as completed in ``TASK_FILE`` if present."""
    task_path = Path(TASK_FILE)
    if not task_path.is_file():
        return
    lines = task_path.read_text(encoding="utf-8").splitlines()
    for idx, line in enumerate(lines):
        if line.strip().startswith("- [ ]") and line.split("- [ ]", 1)[1].strip() == task:
            lines[idx] = line.replace("- [ ]", "- [x]", 1)
            break
    task_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _execute_pipeline(state: dict) -> None:
    """Placeholder for the Forgekeeper task pipeline."""
    log.info("Executing pipeline...")
    # Real implementation would mutate ``state`` as needed.


log = get_logger(__name__, debug=DEBUG_MODE)


def main() -> None:
    state = load_state(STATE_PATH)
    task = state.get("current_task")
    if task:
        log.info(f"Resuming task: {task}")
    else:
        task = _read_next_task()
        if not task:
            log.info("No tasks available. Exiting.")
            return
        state["current_task"] = task
        log.info(f"Starting new task: {task}")
        save_state(state, STATE_PATH)

    log.info("Running Forgekeeper agent logic...")
    _execute_pipeline(state)

    review_passed = run_self_review(state, STATE_PATH)
    if review_passed:
        _check_off_task(task)
        state.clear()
    else:
        log.error(
            "Self-review failed. Halting execution without clearing state."
        )

    save_state(state, STATE_PATH)

    if not review_passed:
        return


if __name__ == "__main__":
    main()
