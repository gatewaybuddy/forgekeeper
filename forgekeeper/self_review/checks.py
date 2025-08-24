"""Run lint/test checks on code changes."""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple, Union

from forgekeeper.config import CHECKS_PY, CHECKS_TS
from forgekeeper import user_interface as ui

from .diff_tools import _run_tool, _changed_files, _collect_feedback


def _staged_files() -> List[str]:
    """Return a list of files currently staged for commit."""
    result = subprocess.run(
        ["git", "diff", "--name-only", "--cached"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [f for f in result.stdout.splitlines() if f]


def review_change_set(task_id: str) -> Dict:
    """Run checks on files changed in the last commit and persist results."""

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
    """Run checks on files staged for commit and persist results."""

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
