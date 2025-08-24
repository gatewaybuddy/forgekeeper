"""Run lint/test checks on code changes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from forgekeeper import user_interface as ui

from .core import _changed_files, _staged_files, run_checks


def review_change_set(task_id: str) -> Dict:
    """Run checks on files changed in the last commit and persist results."""

    files = _changed_files()
    report = run_checks(files, "HEAD")
    report["changed_files"] = files

    log_dir = Path("logs") / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = log_dir / "self-review.json"
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    ui.display_check_results(report)

    return report


def review_staged_changes(task_id: str) -> Dict:
    """Run checks on files staged for commit and persist results."""

    files = _staged_files()
    report = run_checks(files, "--cached")
    report["staged_files"] = files

    log_dir = Path("logs") / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = log_dir / "pre-commit-review.json"
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    ui.display_check_results(report)

    return report
