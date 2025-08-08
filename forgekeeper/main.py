"""Main entrypoint for Forgekeeper."""

from pathlib import Path

from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.self_review import run_self_review
from forgekeeper.task_queue import TaskQueue

MODULE_DIR = Path(__file__).resolve().parent
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"

log = get_logger(__name__, debug=DEBUG_MODE)


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
    """Run pipeline steps sequentially, saving progress after each step.

    The ``pipeline_step`` value in ``state`` tracks the next step to run so
    the pipeline can resume if interrupted.
    """
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
    queue = TaskQueue(TASK_FILE)
    current = state.get("current_task")
    if current:
        task_obj = queue.get_task(current["description"])
        if task_obj:
            task = task_obj.description
            log.info(f"Resuming task: {task}")
        else:
            current = None
    if not current:
        task_obj = queue.next_task()
        if not task_obj:
            log.info("No tasks available. Exiting.")
            return
        task = task_obj.description
        state["current_task"] = task_obj.to_dict()
        state["pipeline_step"] = 0
        log.info(f"Starting new task: {task}")
        save_state(state, STATE_PATH)

    task = state["current_task"]["description"]
    log.info("Dispatching task to execution pipeline...")
    success = _execute_pipeline(task, state)
    if success:
        log.info("Pipeline completed. Running self-review...")
        review_passed = run_self_review(state, STATE_PATH)
        if review_passed:
            log.info("Task completed successfully. Updating task list.")
            task_obj = queue.get_task(task)
            if task_obj:
                queue.mark_done(task_obj)
            state.clear()
        else:
            log.error("Self-review failed. Progress saved for inspection.")
    else:
        log.info("Pipeline incomplete. Progress saved for resume.")

    save_state(state, STATE_PATH)

    if not success or not review_passed:
        return


if __name__ == "__main__":
    main()
