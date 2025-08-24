"""Main entrypoint for Forgekeeper."""

from __future__ import annotations

from pathlib import Path

from forgekeeper.config import DEBUG_MODE, ROADMAP_AUTO_PUSH, ROADMAP_COMMIT_INTERVAL
from forgekeeper.logger import get_logger

from forgekeeper.state_manager import load_state
from forgekeeper.task_review import _check_reviewed_tasks
from forgekeeper.pipeline.execution import execute_pipeline  # re-export for tests

MODULE_DIR = Path(__file__).resolve().parent
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"

log = get_logger(__name__, debug=DEBUG_MODE)


def main() -> None:
    if ROADMAP_COMMIT_INTERVAL > 0:
        from forgekeeper.roadmap_committer import start_periodic_commits

        start_periodic_commits(
            ROADMAP_COMMIT_INTERVAL,
            auto_push=ROADMAP_AUTO_PUSH,
            rationale="Periodic roadmap checkpoint",
        )
    _check_reviewed_tasks()
    from forgekeeper.pipeline.runner import main as runner_main

    state = load_state(STATE_PATH)
    runner_main(state, STATE_PATH)


if __name__ == "__main__":
    main()

