"""Run code changes in an isolated Git worktree."""

from __future__ import annotations

import json
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable, Optional

from git import Repo

from forgekeeper.config import CHECKS_PY, CHECKS_TS, DEBUG_MODE
from forgekeeper.logger import get_logger

log = get_logger(__name__, debug=DEBUG_MODE)


def run_sandbox_checks(
    files: Iterable[str],
    diff_text: str | None = None,
    commands: Optional[Iterable[str]] = None,
    task_id: str = "manual",
    run_checks: bool = True,
) -> dict:
    """Apply a diff to a temporary worktree and run test commands.

    Parameters
    ----------
    files:
        Iterable of file paths used to determine which checks to run.
    diff_text:
        Unified diff to apply inside the sandbox. When ``None`` the staged
        diff of the current repository is used.
    commands:
        Optional explicit commands to run inside the sandbox. If not
        provided, commands are selected based on file extensions in
        ``files`` using :data:`forgekeeper.config.CHECKS_PY` and
        :data:`forgekeeper.config.CHECKS_TS`.
    task_id:
        Identifier used for log directory naming.
    run_checks:
        When ``False`` no commands are executed and a passing result is
        returned immediately.

    Returns
    -------
    dict
        Dictionary containing ``passed`` boolean, ``results`` list with
        command outputs, and ``artifacts_path`` of the JSON log file.
    """

    if not run_checks:
        return {"passed": True, "artifacts_path": "", "results": []}

    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)
    if diff_text is None:
        diff_text = repo.git.diff("--staged")

    log_dir = Path(repo.working_tree_dir) / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    artifacts_path = log_dir / "sandbox-checks.json"

    if not diff_text.strip():
        artifacts_path.write_text("[]", encoding="utf-8")
        return {"passed": True, "results": [], "artifacts_path": str(artifacts_path)}

    if commands is None:
        commands = []
        run_py = any(f.endswith(".py") for f in files)
        run_ts = any(f.endswith(suf) for f in files for suf in (".ts", ".tsx"))
        if run_py:
            commands.extend(CHECKS_PY)
        if run_ts:
            commands.extend(CHECKS_TS)

    commands = list(commands)
    if not commands:
        artifacts_path.write_text("[]", encoding="utf-8")
        return {"passed": True, "results": [], "artifacts_path": str(artifacts_path)}

    tmpdir = Path(tempfile.mkdtemp(prefix="fk-sandbox-"))
    # git worktree requires path not exist
    shutil.rmtree(tmpdir)
    repo.git.worktree("add", str(tmpdir), "HEAD")
    try:
        apply_proc = subprocess.run(
            ["git", "apply", "--whitespace=nowarn"],
            cwd=tmpdir,
            input=diff_text,
            text=True,
            capture_output=True,
        )
        results = [
            {
                "command": "git apply",
                "returncode": apply_proc.returncode,
                "stdout": apply_proc.stdout,
                "stderr": apply_proc.stderr,
            }
        ]
        passed = apply_proc.returncode == 0
        if passed:
            for command in commands:
                log.info("Sandbox running %s", command)
                result = subprocess.run(
                    shlex.split(command),
                    cwd=tmpdir,
                    capture_output=True,
                    text=True,
                )
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
                        "Command failed in sandbox: %s\nstdout:\n%s\nstderr:\n%s",
                        command,
                        result.stdout,
                        result.stderr,
                    )
        artifacts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        return {
            "passed": passed,
            "results": results,
            "artifacts_path": str(artifacts_path),
        }
    finally:
        repo.git.worktree("remove", str(tmpdir), force=True)
        shutil.rmtree(tmpdir, ignore_errors=True)

