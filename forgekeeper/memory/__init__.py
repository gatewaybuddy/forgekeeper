"""Memory utilities exposed at the package root."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List

from .backends import (
    MemoryBackend,
    MemoryBackendFactory,
    MemoryEntry,
    available_memory_backends,
    get_memory_backend,
    register_memory_backend,
)
from . import embeddings, episodic


class EpisodicJsonlBackend:
    """Default backend backed by the legacy episodic JSONL file."""

    name = "episodic"

    def __init__(self, mem_path: Path | None = None) -> None:
        from .episodic import MEMORY_FILE

        self._mem_path = Path(mem_path) if mem_path is not None else MEMORY_FILE

    def append(self, entry: MemoryEntry) -> None:
        from .episodic import append_entry

        append_entry(
            entry.task_id,
            entry.title,
            entry.status,
            entry.changed_files,
            entry.summary,
            entry.artifacts_paths,
            sentiment=entry.sentiment,
            emotion=entry.emotion,
            rationale=entry.rationale,
        )

    def iter_entries(self, *, limit: int | None = None) -> Iterable[MemoryEntry]:
        entries: List[MemoryEntry] = []
        if not self._mem_path.exists():
            return []
        try:
            raw = self._mem_path.read_text(encoding="utf-8")
        except OSError:
            return []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            entries.append(MemoryEntry.from_payload(payload))
        ordered = list(reversed(entries))
        if limit is not None:
            ordered = ordered[: max(limit, 0)]
        return ordered

    def query(self, text: str, *, limit: int = 5) -> List[MemoryEntry]:
        needle = text.lower()
        results: List[MemoryEntry] = []
        for entry in self.iter_entries():
            haystack = " ".join([entry.title, entry.summary]).lower()
            if needle and needle not in haystack:
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results


register_memory_backend(EpisodicJsonlBackend.name, EpisodicJsonlBackend, replace=True)

__all__ = [
    "embeddings",
    "episodic",
    "MemoryBackend",
    "MemoryBackendFactory",
    "MemoryEntry",
    "available_memory_backends",
    "get_memory_backend",
    "register_memory_backend",
    "EpisodicJsonlBackend",
]
