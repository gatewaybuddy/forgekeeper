"""Sandbox execution helpers for the unified runtime."""

from __future__ import annotations

import json
import logging
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, Sequence

from git import Repo

from forgekeeper.config import CHECKS_EXTRA, CHECKS_PY, CHECKS_TS

LOG = logging.getLogger("forgekeeper.core.git.sandbox")


def _collect_commands(files: Iterable[str], commands: Iterable[str] | None) -> list[str]:
    if commands is not None:
        return [cmd for cmd in commands if cmd]

    files_list = list(files)
    run_py = any(path.endswith((".py", ".pyi")) for path in files_list)
    run_ts = any(path.endswith((".ts", ".tsx")) for path in files_list)

    selected: list[str] = []
    if run_py:
        selected.extend(CHECKS_PY)
    if run_ts:
        selected.extend(CHECKS_TS)
    selected.extend(CHECKS_EXTRA)
    # Remove empties while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for cmd in selected:
        if not cmd or cmd in seen:
            continue
        seen.add(cmd)
        deduped.append(cmd)
    return deduped


def _format_command(command: str | Sequence[str]) -> list[str]:
    if isinstance(command, Sequence) and not isinstance(command, str):
        return [str(part) for part in command]
    return shlex.split(str(command))


def run_sandbox_checks(
    files: Iterable[str],
    diff_text: str | None = None,
    *,
    task_id: str = "manual",
    commands: Iterable[str] | None = None,
    run_checks: bool = True,
) -> dict:
    """Apply a diff inside a temporary worktree and run commands."""

    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)
    log_dir = Path(repo.working_tree_dir) / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifacts_path = log_dir / "sandbox-checks.json"

    payload: dict[str, object] = {
        "passed": True,
        "results": [],
        "artifacts_path": str(artifacts_path),
    }

    if not run_checks:
        artifacts_path.write_text("[]", encoding="utf-8")
        payload["skipped"] = True
        payload["commands"] = []
        return payload

    if diff_text is None:
        diff_text = repo.git.diff("--staged")
    diff_text = diff_text or ""

    commands_to_run = _collect_commands(files, commands)
    payload["commands"] = commands_to_run

    if not diff_text.strip() or not commands_to_run:
        if not diff_text.strip():
            payload["reason"] = "empty-diff"
        elif not commands_to_run:
            payload["reason"] = "no-commands"
        artifacts_path.write_text("[]", encoding="utf-8")
        return payload

    tmpdir = Path(tempfile.mkdtemp(prefix="fk-sandbox-"))
    shutil.rmtree(tmpdir)
    results: list[dict[str, object]] = []
    passed = True

    try:
        repo.git.worktree("add", str(tmpdir), "HEAD")
        apply_proc = subprocess.run(
            ["git", "apply", "--whitespace=nowarn"],
            cwd=tmpdir,
            input=diff_text,
            text=True,
            capture_output=True,
        )
        results.append(
            {
                "command": "git apply",
                "returncode": apply_proc.returncode,
                "stdout": apply_proc.stdout,
                "stderr": apply_proc.stderr,
            }
        )
        if apply_proc.returncode != 0:
            passed = False
            payload.update({"passed": False, "results": results, "error": "git-apply-failed", "aborted": True})
            artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
            return payload

        for command in commands_to_run:
            formatted = _format_command(command)
            LOG.info("Sandbox running %s", command)
            try:
                proc = subprocess.run(
                    formatted,
                    cwd=tmpdir,
                    capture_output=True,
                    text=True,
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                passed = False
                results.append(
                    {
                        "command": command,
                        "returncode": None,
                        "stdout": "",
                        "stderr": str(exc),
                        "exception": exc.__class__.__name__,
                    }
                )
                payload["error"] = "command-exception"
                break

            results.append(
                {
                    "command": command,
                    "returncode": proc.returncode,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr,
                }
            )
            if proc.returncode != 0:
                passed = False
                payload["error"] = "command-failed"
                break

        payload.update({"passed": passed, "results": results, "commands": commands_to_run})
        artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        if not passed:
            payload["aborted"] = True
        return payload
    finally:
        try:
            if tmpdir.exists():
                repo.git.worktree("remove", str(tmpdir), force=True)
        except Exception:  # pragma: no cover - cleanup best effort
            LOG.warning("Failed to remove sandbox worktree", exc_info=True)
        shutil.rmtree(tmpdir, ignore_errors=True)


__all__ = ["run_sandbox_checks"]
