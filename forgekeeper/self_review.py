"""Utilities for reviewing recent work against the active task."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

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
    save_state(state, str(path))

    if review_passed:
        log.info("Self-review passed for task '%s'", task)
    else:
        log.error("Self-review failed for task '%s'", task)

    return review_passed


def _run_tool(cmd: Sequence[str]) -> Tuple[bool, str]:
    """Run a command returning success flag and combined output."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        output = result.stdout + result.stderr
        return result.returncode == 0, output
    except FileNotFoundError as exc:
        return False, str(exc)


def _changed_files() -> List[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD~1..HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [f for f in result.stdout.splitlines() if f]


def review_change_set(task_id: str, changed_files: Optional[Sequence[str]] = None) -> bool:
    """Run lint, type-checking and tests on touched files.

    Parameters
    ----------
    task_id : str
        Identifier for the task under review.
    changed_files : Iterable[str] | None
        Optional override for the files to review.

    Returns
    -------
    bool
        ``True`` if all tools pass, otherwise ``False``.
    """

    files = list(changed_files) if changed_files is not None else _changed_files()
    py_files = [f for f in files if f.endswith(".py")]

    results = {}
    for tool in ("ruff", "mypy", "pytest"):
        cmd = [tool, *py_files]
        passed, output = _run_tool(cmd)
        results[tool] = {"passed": passed, "output": output}

    overall = all(res["passed"] for res in results.values())

    report = {"task_id": task_id, "files": files, "results": results, "passed": overall}
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    with (logs_dir / f"self-review-{ts}.json").open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)

    return overall
