"""LLM-powered evaluation of recent changes."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Callable, Dict

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.state_manager import save_state

log = get_logger(__name__, debug=DEBUG_MODE)


def run_self_review(
    state: Dict,
    state_path: Path | str = Path("forgekeeper/state.json"),
    ask_fn: Callable[[str], str] | None = None,
) -> bool:
    """Run a self-review of the last commit using LLM reasoning and task tests."""

    path = Path(state_path)

    task_info = state.get("current_task", {})
    if isinstance(task_info, dict):
        task_desc = task_info.get("description", "")
        task_id = task_info.get("task_id")
    else:
        task_desc = str(task_info)
        task_id = None

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

    diff_text = ""
    try:
        diff_result = subprocess.run(
            ["git", "diff", "HEAD~1..HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        diff_text = diff_result.stdout
    except subprocess.CalledProcessError as exc:
        log.error("Failed to read diff: %s", exc)

    if ask_fn is None:
        try:
            from forgekeeper.app.services.llm_router import ask_llm as ask_fn
        except Exception as exc:  # pragma: no cover - import errors in prod only
            log.error("LLM backend unavailable: %s", exc)
            ask_fn = lambda _: "FAIL: no LLM"  # type: ignore

    prompt = (
        "You are a code reviewer. Given the following task description and git diff,\n"
        "determine if the diff accomplishes the task. Respond with PASS or FAIL\n"
        "followed by a brief rationale.\n\n"
        f"Task: {task_desc}\n\nDiff:\n{diff_text}\n"
    )

    llm_response = ""
    llm_passed = False
    try:
        llm_response = ask_fn(prompt)
        llm_passed = "pass" in llm_response.lower() and "fail" not in llm_response.lower()
    except Exception as exc:  # pragma: no cover - defensive
        llm_response = str(exc)
        llm_passed = False

    tests_passed = True
    tests_output = ""
    if task_id:
        test_cmd = [sys.executable, "-m", "pytest", "-k", task_id, "-q"]
        test_result = subprocess.run(test_cmd, capture_output=True, text=True)
        tests_output = (test_result.stdout + test_result.stderr).strip()
        tests_passed = test_result.returncode == 0
    else:
        tests_output = "no task id provided"

    review_passed = bool(task_desc) and llm_passed and tests_passed

    state["last_review"] = {
        "task": task_desc,
        "task_id": task_id,
        "commit_message": commit_msg,
        "llm_response": llm_response,
        "llm_passed": llm_passed,
        "tests_output": tests_output,
        "tests_passed": tests_passed,
        "passed": review_passed,
    }
    save_state(state, str(path))

    if review_passed:
        log.info("Self-review passed for task '%s'", task_desc)
    else:
        log.error("Self-review failed for task '%s'", task_desc)

    return review_passed
