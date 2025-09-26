"""Episodic memory helpers for recording task outcomes."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .backends import MemoryEntry, get_memory_backend
from .jsonl import DEFAULT_JSONL_PATH

MEMORY_FILE = Path(DEFAULT_JSONL_PATH)


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

    entry = MemoryEntry(
        task_id=task_id,
        title=title,
        status=status,
        summary=summary,
        changed_files=tuple(str(item) for item in (changed_files or ())),
        artifacts_paths=tuple(str(item) for item in (artifacts_paths or ())),
        sentiment=sentiment or "neutral",
        emotion=emotion or "neutral",
        rationale=rationale,
    )

    backend = get_memory_backend()
    backend.append(entry)


__all__ = ["append_entry", "MEMORY_FILE"]
