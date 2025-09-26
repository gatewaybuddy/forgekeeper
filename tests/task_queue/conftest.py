import sys
from pathlib import Path
from typing import Iterable, Sequence

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from forgekeeper.memory import MemoryBackend, MemoryEntry
from forgekeeper.tasks.queue import TaskQueue


class StubMemoryBackend(MemoryBackend):
    name = "stub"

    def __init__(self, entries: Iterable[MemoryEntry] | None = None) -> None:
        self._entries = list(entries or [])

    def append(self, entry: MemoryEntry) -> None:  # pragma: no cover - helper
        self._entries.append(entry)

    def iter_entries(self, *, limit: int | None = None) -> list[MemoryEntry]:
        entries: Sequence[MemoryEntry] = list(reversed(self._entries))
        if limit is not None:
            entries = entries[: max(limit, 0)]
        return list(entries)

    def query(self, text: str, *, limit: int = 5) -> list[MemoryEntry]:  # pragma: no cover - helper
        text_lower = text.lower()
        results = []
        for entry in self.iter_entries():
            haystack = f"{entry.title} {entry.summary}".lower()
            if text_lower and text_lower not in haystack:
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results


@pytest.fixture
def tasks_file(tmp_path):
    def _write(text: str):
        path = tmp_path / "tasks.md"
        path.write_text(text, encoding="utf-8")
        return path
    return _write


@pytest.fixture
def queue_from_text(tasks_file):
    def _queue(text: str, *, memory_entries: Iterable[dict | MemoryEntry] | None = None):
        entries = []
        for payload in memory_entries or ():
            if isinstance(payload, MemoryEntry):
                entries.append(payload)
            else:
                entries.append(MemoryEntry.from_payload(payload))
        backend = StubMemoryBackend(entries)
        return TaskQueue(tasks_file(text), backend=backend)
    return _queue
