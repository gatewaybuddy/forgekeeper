"""Utilities for reviewing recent work against the active task."""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Sequence, Tuple, Union

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, CHECKS_PY, CHECKS_TS
from forgekeeper.state_manager import save_state
from forgekeeper import user_interface as ui

log = get_logger(__name__, debug=DEBUG_MODE)


def run_self_review(
    state: Dict,
    state_path: Path | str = Path("forgekeeper/state.json"),
    ask_fn: Callable[[str], str] | None = None,
) -> bool:
    """Run a self-review of the last commit using LLM reasoning and task tests.

    Parameters
    ----------
    state : dict
        Current execution state. Should contain ``current_task`` with
        ``description`` and optional ``task_id``.
    state_path : Path | str
        Path where the updated state should be persisted.
    ask_fn : callable, optional
        Function used to query an LLM. Defaults to ``ask_llm`` from the
        internal router when not provided.

    Returns
    -------
    bool
        ``True`` if the review passes, otherwise ``False``.
    """

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


def _staged_files() -> List[str]:
    """Return a list of files currently staged for commit."""
    result = subprocess.run(
        ["git", "diff", "--name-only", "--cached"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [f for f in result.stdout.splitlines() if f]


def _collect_feedback(results: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    """Extract file-specific feedback from tool outputs.

    Parameters
    ----------
    results : dict
        Mapping of tool command to result info containing ``passed`` and ``output``.

    Returns
    -------
    dict
        Mapping of file paths to a list of feedback lines related to that file.
    """

    feedback: Dict[str, List[str]] = {}
    for info in results.values():
        if info.get("passed"):
            continue
        for line in str(info.get("output", "")).splitlines():
            if not line:
                continue
            file_part = line.split(":", 1)[0]
            if file_part:
                feedback.setdefault(file_part, []).append(line.strip())
    return feedback


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
    summary_lines = [
        f"{cmd}: {'pass' if info['passed'] else 'fail'}" for cmd, info in results.items()
    ]
    summary_body = "; ".join(summary_lines) if summary_lines else "no checks run"
    summary = f"Change-set review {'passed' if passed else 'failed'}: {summary_body}"

    feedback = _collect_feedback(results)
    highlights: Dict[str, Dict[str, Any]] = {}
    for fname, messages in feedback.items():
        ok, diff_text = _run_tool(["git", "diff", "HEAD~1..HEAD", "--", fname])
        highlights[fname] = {"diff": diff_text if ok else "", "messages": messages}

    report = {
        "passed": passed,
        "tools": results,
        "changed_files": files,
        "ts": ts,
        "summary": summary,
        "highlights": highlights,
    }

    log_dir = Path("logs") / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = log_dir / "self-review.json"
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    ui.display_check_results(report)

    return report


def review_staged_changes(task_id: str) -> Dict:
    """Run checks on files staged for commit and persist results.

    Parameters
    ----------
    task_id: str
        Identifier for the current task. Used to derive log path.

    Returns
    -------
    dict
        Structured report including tool outputs and overall pass flag.
    """

    files = _staged_files()
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
    summary_lines = [
        f"{cmd}: {'pass' if info['passed'] else 'fail'}" for cmd, info in results.items()
    ]
    summary_body = "; ".join(summary_lines) if summary_lines else "no checks run"
    summary = f"Pre-commit review {'passed' if passed else 'failed'}: {summary_body}"

    feedback = _collect_feedback(results)
    highlights: Dict[str, Dict[str, Any]] = {}
    for fname, messages in feedback.items():
        ok, diff_text = _run_tool(["git", "diff", "--cached", "--", fname])
        highlights[fname] = {"diff": diff_text if ok else "", "messages": messages}

    report = {
        "passed": passed,
        "tools": results,
        "staged_files": files,
        "ts": ts,
        "summary": summary,
        "highlights": highlights,
    }

    log_dir = Path("logs") / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = log_dir / "pre-commit-review.json"
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    ui.display_check_results(report)

    return report
