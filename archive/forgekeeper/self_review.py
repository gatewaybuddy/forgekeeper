"""Simplified self-review helpers used by the git committer."""

from __future__ import annotations

import subprocess


def review_staged_changes(task_id: str) -> dict:
    """Return a minimal review payload listing staged files."""

    result = subprocess.run(
        ["git", "diff", "--name-only", "--cached"],
        capture_output=True,
        text=True,
        check=True,
    )
    files = [line for line in result.stdout.splitlines() if line]
    return {"passed": True, "staged_files": files, "task_id": task_id}


__all__ = ["review_staged_changes"]
