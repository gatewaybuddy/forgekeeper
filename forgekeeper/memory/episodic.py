"""Episodic memory utilities."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Sequence

MEMORY_FILE = Path(".forgekeeper/memory/episodic.jsonl")


def append_entry(
    task_id: str,
    title: str,
    status: str,
    changed_files: Sequence[str] | None,
    summary: str,
    artifacts_paths: Sequence[str] | None,
    sentiment: str | None = None,
    emotion: str | None = None,
    rationale: str | None = None,
) -> None:
    """Append a task attempt entry to the episodic memory file.

    The entry captures status, changed files, summary text, and optional
    sentiment and emotion tags for later review.
    """
    entry = {
        "task_id": task_id,
        "title": title,
        "status": status,
        "changed_files": list(changed_files or []),
        "summary": summary,
        "artifacts_paths": list(artifacts_paths or []),
        "sentiment": sentiment or "neutral",
        "emotion": emotion or "neutral",
    }
    if rationale is not None:
        entry["rationale"] = rationale
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(entry) + "\n").encode("utf-8")
    fd = os.open(MEMORY_FILE, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    from . import episodic_cli

    episodic_cli.main()
