"""Utilities for running commit checks."""

from __future__ import annotations

import json
import shlex
import subprocess
from pathlib import Path
from typing import Iterable, Optional

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, CHECKS_PY, CHECKS_TS

log = get_logger(__name__, debug=DEBUG_MODE)


def _run_commands(commands: Iterable[str], task_id: str) -> dict:
    """Run shell commands and record outputs."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    log_dir = repo_root / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifacts_path = log_dir / "commit-checks.json"

    commands = list(commands)
    results = []
    passed = True
    for command in commands:
        log.info("Running %s", command)
        result = subprocess.run(shlex.split(command), capture_output=True, text=True)
        results.append(
            {
                "command": command,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )
        if result.returncode != 0:
            passed = False
            log.error(
                "\n".join(
                    [
                        f"Command failed: {command}",
                        f"stdout:\n{result.stdout}",
                        f"stderr:\n{result.stderr}",
                    ]
                )
            )

    artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    for r in results:
        status = "passed" if r["returncode"] == 0 else "failed"
        log.info("Check %s %s", r["command"], status)
        if r["stdout"].strip():
            log.info("stdout:\n%s", r["stdout"])
        if r["stderr"].strip():
            log.info("stderr:\n%s", r["stderr"])

    failing = [r["command"] for r in results if r["returncode"] != 0]
    if passed:
        log.info("All %d checks passed", len(results))
    else:
        log.error("Checks failed: %s", ", ".join(failing))

    return {"passed": passed, "artifacts_path": str(artifacts_path), "results": results}


def run_checks(
    files: Iterable[str],
    task_id: str,
    commands: Optional[Iterable[str]] = None,
) -> dict:
    """Select and run check commands for ``files``."""
    if commands is None:
        commands = []
        run_py = any(str(f).endswith(".py") for f in files)
        run_ts = any(str(f).endswith(suf) for f in files for suf in (".ts", ".tsx"))
        if run_py:
            commands = list(commands) + list(CHECKS_PY)
        if run_ts:
            commands = list(commands) + list(CHECKS_TS)
    return _run_commands(commands, task_id)
