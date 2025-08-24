"""Core utilities for self-review checks."""

from __future__ import annotations

import shlex
import subprocess
import sys
from datetime import datetime
from typing import Any, Dict, List, Literal, Sequence, Tuple, Union

from forgekeeper.config import CHECKS_PY, CHECKS_TS
from .diff_tools import _run_tool, _collect_feedback


def _changed_files() -> List[str]:
    """Return a list of files changed in the last commit."""
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


def run_checks(files: List[str], diff_mode: Literal["HEAD", "--cached"]) -> Dict:
    """Run configured checks for the provided files.

    Parameters
    ----------
    files:
        List of file paths to consider when deciding which checks to run.
    diff_mode:
        Either ``"HEAD"`` to compare against the last commit or ``"--cached"``
        to compare against the staging area.
    """

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
    prefix = "Change-set review" if diff_mode == "HEAD" else "Pre-commit review"
    summary = f"{prefix} {'passed' if passed else 'failed'}: {summary_body}"

    feedback = _collect_feedback(results)
    highlights: Dict[str, Dict[str, Any]] = {}
    diff_args: List[str] = ["git", "diff", "HEAD~1..HEAD" if diff_mode == "HEAD" else "--cached"]
    for fname, messages in feedback.items():
        ok, diff_text = _run_tool(diff_args + ["--", fname])
        highlights[fname] = {"diff": diff_text if ok else "", "messages": messages}

    return {
        "passed": passed,
        "tools": results,
        "ts": ts,
        "summary": summary,
        "highlights": highlights,
    }
