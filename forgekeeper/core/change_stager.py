"""Utilities for diffing and staging file changes (unified runtime)."""

from __future__ import annotations

import difflib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from git import Repo

from forgekeeper.core.git.sandbox import run_sandbox_checks

LOG = logging.getLogger("forgekeeper.core.change_stager")


@dataclass
class StageResult:
    files: list[str]
    outcome: str
    error: str | None = None
    sandbox: dict | None = None

    def to_dict(self) -> dict[str, object]:
        data: dict[str, object] = {"files": self.files, "outcome": self.outcome}
        if self.error:
            data["error"] = self.error
        if self.sandbox is not None:
            data["sandbox"] = self.sandbox
        return data


def _write_log(repo: Repo, task_id: str, files: Iterable[str], outcome: str) -> StageResult:
    logs_dir = Path(repo.working_tree_dir) / "logs" / task_id
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / "stager.json"

    existing: dict[str, object] = {}
    if log_file.exists():
        try:
            existing = json.loads(log_file.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    existing_files = list(existing.get("files", [])) if isinstance(existing.get("files"), list) else []
    merged = sorted(set(existing_files) | set(files))
    payload = StageResult(files=merged, outcome=outcome)
    log_file.write_text(json.dumps(payload.to_dict(), indent=2), encoding="utf-8")
    return payload


def diff_and_stage_changes(
    original_code: str,
    modified_code: str,
    file_path: str | Path,
    *,
    auto_stage: bool = True,
    dry_run: bool = False,
    task_id: str = "manual",
    run_sandbox: bool = True,
    extra_files: Iterable[str] | None = None,
) -> dict[str, object]:
    """Compare original and modified content and stage via Git if changed."""

    if original_code == modified_code:
        LOG.info("No changes detected for %s", file_path)
        return StageResult(files=[], outcome="no-op").to_dict()

    path = Path(file_path).resolve()
    repo = Repo(path.parent, search_parent_directories=True)
    rel_path = str(path.relative_to(repo.working_tree_dir))

    diff_lines = difflib.unified_diff(
        original_code.splitlines(),
        modified_code.splitlines(),
        fromfile=f"a/{rel_path}",
        tofile=f"b/{rel_path}",
        lineterm="",
    )
    diff_text = "\n".join(diff_lines)
    LOG.info(diff_text)

    proceed = auto_stage
    if not auto_stage:
        resp = input("Stage changes? [y/N]: ").strip().lower()
        proceed = resp.startswith("y")

    if not proceed:
        return StageResult(files=[], outcome="skipped").to_dict()

    staged_before: List[str] = repo.git.diff("--name-only", "--cached").splitlines()

    def _stage_payload(outcome: str, files: Iterable[str]) -> dict[str, object]:
        result = _write_log(repo, task_id, files, outcome)
        return result.to_dict()

    if dry_run:
        LOG.info("Dry run enabled; skipping write and stage for %s", file_path)
        files = sorted(set(staged_before + [rel_path]))
        return _stage_payload("dry-run", files)

    sandbox_payload: dict | None = None
    if run_sandbox:
        sandbox_payload = run_sandbox_checks([rel_path], diff_text=diff_text, task_id=task_id)
        if not sandbox_payload.get("passed", True):
            LOG.error("Sandbox checks failed for %s", file_path)
            return StageResult(files=[], outcome="sandbox-failed", sandbox=sandbox_payload).to_dict()

    try:
        path.write_text(modified_code, encoding="utf-8")
        files_to_stage = [str(path)]
        if extra_files:
            files_to_stage.extend(str(Path(f)) for f in extra_files)
        repo.index.add(files_to_stage)

        files = repo.git.diff("--name-only", "--cached").splitlines()
        result = _write_log(repo, task_id, files, "success")
        return result.to_dict()
    except Exception as exc:  # pragma: no cover - best effort cleanup
        LOG.error("Failed to stage %s: %s", file_path, exc)
        path.write_text(original_code, encoding="utf-8")
        try:
            repo.git.restore("--staged", ":/")
        except Exception:
            LOG.warning("Failed to unstage repository after error")
        error_result = StageResult(files=[], outcome="error", error=str(exc))
        _write_log(repo, task_id, [], "error")
        return error_result.to_dict()


__all__ = ["StageResult", "diff_and_stage_changes", "run_sandbox_checks"]
