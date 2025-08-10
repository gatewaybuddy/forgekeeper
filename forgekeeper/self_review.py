"""Utilities for reviewing recent work against the active task."""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence, Tuple, Union

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, CHECKS_PY, CHECKS_TS
from forgekeeper.state_manager import save_state
from forgekeeper.memory import episodic

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


def review_change_set(task_id: str) -> Dict:
    """Run checks on files changed in the last commit and persist results.

    Parameters
    ----------
    task_id: str
        Identifier for the current task. Used to derive log path.

    Returns
    -------
    dict
        Structured report including tool outputs and overall pass flag.
    """

    files = _changed_files()
    run_py = any(f.endswith(".py") for f in files)
    run_ts = any(f.endswith(suf) for f in files for suf in (".ts", ".tsx"))
    run_backend = any(
        f.startswith("backend/") and f.endswith(suf) for f in files for suf in (".ts", ".tsx")
    )

    results: Dict[str, Dict[str, str | bool]] = {}
    passed = True

    def _exec(cmd: Union[str, Sequence[str]]) -> Tuple[bool, str]:
        if isinstance(cmd, str):
            cmd = shlex.split(cmd)
        return _run_tool(cmd)

    if run_py:
        for cmd_str in CHECKS_PY:
            ok, out = _exec(cmd_str)
            results[cmd_str] = {"passed": ok, "output": out}
            passed &= ok

    if run_ts:
        for cmd_str in CHECKS_TS:
            ok, out = _exec(cmd_str)
            results[cmd_str] = {"passed": ok, "output": out}
            passed &= ok

    if run_backend:
        smoke_cmd = [sys.executable, "tools/smoke_backend.py"]
        ok, out = _exec(smoke_cmd)
        results["smoke_backend"] = {"passed": ok, "output": out}
        passed &= ok

    ts = datetime.utcnow().isoformat()
    report = {
        "passed": passed,
        "tools": results,
        "changed_files": files,
        "ts": ts,
    }

    log_dir = Path("logs") / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = log_dir / "self-review.json"
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    episodic.append_entry(
        task_id=task_id,
        title="self-review",
        status="pass" if passed else "fail",
        changed_files=files,
        summary=f"Self-review {'passed' if passed else 'failed'}",
        artifacts_paths=[str(artifact_path)],
    )

    return report
