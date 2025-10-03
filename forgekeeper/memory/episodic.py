"""Episodic memory helpers for recording task outcomes."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .embeddings import store_task_embedding

MEMORY_FILE = Path(".forgekeeper/memory/episodic.jsonl")


def append_entry(
    task_id: str,
    title: str,
    status: str,
    changed_files: Iterable[str] | None,
    summary: str,
    artifacts_paths: Iterable[str] | None,
    *,
    sentiment: str | None = None,
    emotion: str | None = None,
    rationale: str | None = None,
) -> None:
    """Append a structured entry to the episodic memory log."""

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

    try:  # Best effort embedding persistence
        store_task_embedding(task_id, summary, mem_path=MEMORY_FILE)
    except Exception:
        pass


__all__ = ["append_entry", "MEMORY_FILE"]
