from pathlib import Path

from forgekeeper.state_manager import save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

from .analyze import step_analyze
from .edit import step_edit
from .commit import step_commit

log = get_logger(__name__, debug=DEBUG_MODE)

MODULE_DIR = Path(__file__).resolve().parents[1]
STATE_PATH = MODULE_DIR / "state.json"

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
