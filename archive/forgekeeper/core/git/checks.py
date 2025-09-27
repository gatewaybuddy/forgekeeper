"""Commit check selection and execution helpers."""

from __future__ import annotations

import json
import logging
import shlex
import subprocess
from pathlib import Path
from typing import Iterable, Sequence

from forgekeeper.config import CHECKS_EXTRA, CHECKS_PY, CHECKS_TS

LOG = logging.getLogger("forgekeeper.core.git.checks")


def _run_commands(commands: Sequence[str], task_id: str) -> dict:
    repo_root = Path(__file__).resolve().parents[2]
    log_dir = repo_root / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifacts_path = log_dir / "commit-checks.json"

    commands = [cmd for cmd in commands if cmd]
    results: list[dict[str, object]] = []
    passed = True

    for command in commands:
        LOG.info("Running %s", command)
        proc = subprocess.run(
            shlex.split(command),
            capture_output=True,
            text=True,
        )
        result = {
            "command": command,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
        results.append(result)
        if proc.returncode != 0:
            passed = False
            LOG.error("Command failed: %s", command)
            LOG.error("stdout:\n%s", proc.stdout)
            LOG.error("stderr:\n%s", proc.stderr)

    artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    return {
        "passed": passed,
        "results": results,
        "artifacts_path": str(artifacts_path),
    }


def _select_commands(files: Iterable[str], commands: Iterable[str] | None) -> list[str]:
    if commands is not None:
        return [cmd for cmd in commands if cmd]

    files_list = list(files)
    selected: list[str] = []
    if any(str(f).endswith((".py", ".pyi")) for f in files_list):
        selected.extend(CHECKS_PY)
    if any(str(f).endswith((".ts", ".tsx")) for f in files_list):
        selected.extend(CHECKS_TS)
    selected.extend(CHECKS_EXTRA)

    seen: set[str] = set()
    deduped: list[str] = []
    for cmd in selected:
        if not cmd or cmd in seen:
            continue
        seen.add(cmd)
        deduped.append(cmd)
    return deduped


def run_checks(
    files: Iterable[str],
    task_id: str,
    commands: Iterable[str] | None = None,
) -> dict:
    """Run commit checks derived from ``files`` or ``commands``."""

    selected = _select_commands(files, commands)
    if not selected:
        repo_root = Path(__file__).resolve().parents[2]
        log_dir = repo_root / "logs" / task_id
        log_dir.mkdir(parents=True, exist_ok=True)
        artifacts_path = log_dir / "commit-checks.json"
        artifacts_path.write_text("[]", encoding="utf-8")
        return {"passed": True, "results": [], "artifacts_path": str(artifacts_path)}

    return _run_commands(selected, task_id)


__all__ = ["run_checks"]
