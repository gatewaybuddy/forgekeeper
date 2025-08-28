"""Utilities for diffing and staging file changes.

This module exposes :func:`diff_and_stage_changes` which compares an original
and modified file, stages the change via Git, and logs the outcome. The
function supports dry-run mode and returns structured information about the
result.
"""

from __future__ import annotations

import difflib
import json
from pathlib import Path
from typing import Dict, List

from git import Repo

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger
from forgekeeper.git.sandbox import run_sandbox_checks

log = get_logger(__name__, debug=DEBUG_MODE)


def diff_and_stage_changes(
    original_code: str,
    modified_code: str,
    file_path: str,
    auto_stage: bool = True,
    dry_run: bool = False,
    task_id: str = "manual",
    run_sandbox: bool = True,
) -> Dict[str, object]:
    """Compare original and modified content and stage via Git if changed.

    Parameters
    ----------
    original_code: str
        The file's existing content.
    modified_code: str
        The new content to write if staging proceeds.
    file_path: str
        Path to the file relative to the repository root.
    auto_stage: bool, optional
        If ``True`` the file is staged without prompting.
    dry_run: bool, optional
        When ``True`` no changes are written or staged.
    task_id: str, optional
        Identifier used for log directory naming.
    run_sandbox: bool, optional
        If ``True`` run sandbox checks before staging.

    Returns
    -------
    dict
        Mapping containing ``files`` and ``outcome`` keys. On failure an
        ``error`` key with message text is also included.
    """

    if original_code == modified_code:
        log.info(f"No changes detected for {file_path}")
        return {"files": [], "outcome": "no-op"}

    diff_lines = difflib.unified_diff(
        original_code.splitlines(),
        modified_code.splitlines(),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    diff_text = "\n".join(diff_lines)
    log.info(diff_text)

    proceed = auto_stage
    if not auto_stage:
        resp = input("Stage changes? [y/N]: ").strip().lower()
        proceed = resp.startswith("y")

    if not proceed:
        return {"files": [], "outcome": "skipped"}

    p = Path(file_path).resolve()
    repo = Repo(p.parent, search_parent_directories=True)
    rel_path = str(p.relative_to(repo.working_tree_dir))

    staged_before: List[str] = repo.git.diff("--name-only", "--cached").splitlines()

    def _write_log(new_files: List[str], outcome: str) -> Dict[str, object]:
        """Record staging outcomes, aggregating across multiple calls.

        Each task may touch several files. Subsequent calls for the same
        ``task_id`` should append to the log rather than overwrite it. The
        log file therefore stores the union of all staged files.
        """

        logs_dir = Path(repo.working_tree_dir) / "logs" / task_id
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_file = logs_dir / "stager.json"

        existing: Dict[str, object] = {}
        if log_file.exists():
            try:
                existing = json.loads(log_file.read_text(encoding="utf-8"))
            except Exception:
                existing = {}

        files = sorted(set(existing.get("files", []) + new_files))
        payload = {"files": files, "outcome": outcome}
        log_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    if dry_run:
        result = _write_log(sorted(set(staged_before + [rel_path])), "dry-run")
        log.info(f"Dry run enabled; skipping write and stage for {file_path}")
        return result

    sandbox_result = {"passed": True}
    if run_sandbox:
        sandbox_result = run_sandbox_checks([rel_path], diff_text=diff_text, task_id=task_id)
        if not sandbox_result.get("passed", True):
            log.error(f"Sandbox checks failed for {file_path}")
            p.write_text(original_code, encoding="utf-8")
            return {"files": [], "outcome": "sandbox-failed", "sandbox": sandbox_result}

    try:
        p.write_text(modified_code, encoding="utf-8")
        repo.index.add([str(p)])

        files = repo.git.diff("--name-only", "--cached").splitlines()
        result = _write_log(files, "success")
        return result
    except Exception as exc:  # pragma: no cover - best effort for restore
        p.write_text(original_code, encoding="utf-8")
        try:
            repo.git.restore("--staged", ":/")
        except Exception as restore_exc:
            log.warning(f"Failed to unstage repository: {restore_exc}")
        log.error(f"Failed to stage {file_path}: {exc}")
        result = {"files": [], "outcome": "error", "error": str(exc)}
        _write_log([], "error")
        return result

