from __future__ import annotations

from typing import List

from forgekeeper import config
from forgekeeper.memory.backends import (
    MemoryBackend,
    MemoryEntry,
    get_memory_backend,
    register_memory_backend,
)


def test_memory_entry_roundtrip_preserves_metadata() -> None:
    payload = {
        "task_id": "123",
        "title": "Example task",
        "status": "done",
        "summary": "Completed example",
        "changed_files": ["a.py"],
        "artifacts_paths": ["logs/output.txt"],
        "sentiment": "positive",
        "emotion": "calm",
        "rationale": "all good",
        "custom": 42,
    }
    entry = MemoryEntry.from_payload(payload)
    assert entry.changed_files == ("a.py",)
    assert entry.artifacts_paths == ("logs/output.txt",)
    assert entry.extra == {"custom": 42}

    exported = entry.to_payload()
    assert exported["changed_files"] == ["a.py"]
    assert exported["artifacts_paths"] == ["logs/output.txt"]
    assert exported["custom"] == 42


class _DummyBackend:
    name = "test-dummy-backend"

    def __init__(self) -> None:
        self._entries: List[MemoryEntry] = []

    def append(self, entry: MemoryEntry) -> None:
        self._entries.append(entry)

    def iter_entries(self, *, limit: int | None = None) -> List[MemoryEntry]:
        ordered = list(reversed(self._entries))
        if limit is not None:
            ordered = ordered[: max(limit, 0)]
        return ordered

    def query(self, text: str, *, limit: int = 5) -> List[MemoryEntry]:
        text_lower = text.lower()
        results: List[MemoryEntry] = []
        for entry in self.iter_entries():
            if text_lower and text_lower not in entry.summary.lower():
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results


register_memory_backend(_DummyBackend.name, _DummyBackend, replace=True)


def test_get_memory_backend_uses_configuration(monkeypatch) -> None:
    monkeypatch.setattr(config, "FK_MEMORY_BACKEND", _DummyBackend.name)
    backend = get_memory_backend()
    assert isinstance(backend, _DummyBackend)
    assert isinstance(backend, MemoryBackend)

    entry = MemoryEntry(
        task_id="1",
        title="Demo",
        status="done",
        summary="A demo entry",
    )
    backend.append(entry)

    iterated = backend.iter_entries(limit=1)
    assert iterated[0].task_id == "1"
    queried = backend.query("demo")
    assert queried and queried[0].summary == "A demo entry"
