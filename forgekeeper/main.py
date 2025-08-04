"""Main entrypoint for Forgekeeper."""

from pathlib import Path

from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.file_analyzer import analyze_repo_for_task


MODULE_DIR = Path(__file__).resolve().parent
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"


def _read_next_task() -> str | None:
    """Return the first unchecked task from TASK_FILE if available."""
    task_path = TASK_FILE
    if not task_path.is_file():
        return None
    for line in task_path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("- [ ]"):
            return line.split("- [ ]", 1)[1].strip()
    return None


log = get_logger(__name__, debug=DEBUG_MODE)


def _check_off_task(task: str) -> None:
    """Mark the provided task as completed in TASK_FILE."""
    task_path = TASK_FILE
    if not task_path.is_file():
        return
    lines = task_path.read_text(encoding="utf-8").splitlines()
    updated: list[str] = []
    marked = False
    for line in lines:
        if not marked and line.strip().startswith("- [ ]"):
            candidate = line.split("- [ ]", 1)[1].strip()
            if candidate == task:
                line = line.replace("- [ ]", "- [x]", 1)
                marked = True
        updated.append(line)
    if marked:
        task_path.write_text("\n".join(updated) + "\n", encoding="utf-8")


def _step_analyze(task: str, state: dict) -> bool:
    """Analyze repository relevance for the given task and store results."""
    state["analysis"] = analyze_repo_for_task(task)
    return True


def _step_edit(task: str, state: dict) -> bool:  # pragma: no cover - placeholder
    """Placeholder for code editing logic."""
    return True


def _step_commit(task: str, state: dict) -> bool:  # pragma: no cover - placeholder
    """Placeholder for commit logic."""
    return True


PIPELINE = [_step_analyze, _step_edit, _step_commit]


def _execute_pipeline(task: str, state: dict) -> bool:
    """Run pipeline steps sequentially, saving progress after each step."""
    step_index = state.get("pipeline_step", 0)
    for idx in range(step_index, len(PIPELINE)):
        step = PIPELINE[idx]
        log.info(f"Executing step {idx + 1}/{len(PIPELINE)}: {step.__name__}")
        try:
            success = step(task, state)
        except Exception as exc:  # pragma: no cover - defensive
            log.error(f"Step {step.__name__} failed: {exc}")
            state["pipeline_step"] = idx
            return False
        if not success:
            state["pipeline_step"] = idx
            return False
        state["pipeline_step"] = idx + 1
        save_state(state, STATE_PATH)
    return True


def main() -> None:
    state = load_state(STATE_PATH)
    if state.get("current_task"):
        log.info(f"Resuming task: {state['current_task']}")
    else:
        task = _read_next_task()
        if not task:
            log.info("No tasks available. Exiting.")
            return
        state["current_task"] = task
        state["pipeline_step"] = 0
        log.info(f"Starting new task: {task}")
        save_state(state, STATE_PATH)

    task = state["current_task"]
    log.info("Dispatching task to execution pipeline...")
    success = _execute_pipeline(task, state)
    if success:
        log.info("Task completed successfully. Updating task list.")
        _check_off_task(task)
        state.clear()
    else:
        log.info("Pipeline incomplete. Progress saved for resume.")
    save_state(state, STATE_PATH)


if __name__ == "__main__":
    main()
