"""JSONL-backed memory backend implementation."""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import RLock
from typing import List, Sequence

from .backends import MemoryBackend, MemoryEntry
from .embeddings import store_task_embedding

DEFAULT_JSONL_PATH = Path(".forgekeeper/memory/episodic.jsonl")


class JsonlMemoryReader:
    """Utility responsible for reading memory entries from a JSONL file.

    The reader caches the parsed entries using the file's ``mtime`` and size as
    a simple invalidation signal. The cache keeps behaviour deterministic while
    avoiding redundant JSON decoding when the file has not changed between
    calls.
    """

    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._lock = RLock()
        self._cached_entries: List[MemoryEntry] | None = None
        self._cache_signature: tuple[int, int] | None = None

    def _stat_signature(self) -> tuple[int, int] | None:
        try:
            stat = self._path.stat()
        except FileNotFoundError:
            return None
        except OSError:
            return None
        return (int(stat.st_mtime_ns), int(stat.st_size))

    def _load_entries(self) -> List[MemoryEntry]:
        entries: List[MemoryEntry] = []
        try:
            raw = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
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
        return entries

    def entries(self) -> List[MemoryEntry]:
        signature = self._stat_signature()
        with self._lock:
            if (
                self._cached_entries is not None
                and self._cache_signature is not None
                and self._cache_signature == signature
            ):
                return list(self._cached_entries)
            entries = self._load_entries()
            self._cached_entries = entries
            self._cache_signature = signature
            return list(entries)

    def invalidate(self) -> None:
        with self._lock:
            self._cached_entries = None
            self._cache_signature = None

class JsonlMemoryBackend(MemoryBackend):
    """Persist episodic memories into a JSONL file with fsync semantics."""

    name = "jsonl"

    def __init__(
        self,
        mem_path: Path | str | None = None,
        *,
        reader: JsonlMemoryReader | None = None,
    ) -> None:
        self._mem_path = Path(mem_path) if mem_path is not None else DEFAULT_JSONL_PATH
        self._reader = reader or JsonlMemoryReader(self._mem_path)

    @property
    def path(self) -> Path:
        return self._mem_path

    def append(self, entry: MemoryEntry) -> None:
        payload = entry.to_payload()
        data = (json.dumps(payload) + "\n").encode("utf-8")

        self._mem_path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self._mem_path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        try:
            os.write(fd, data)
            os.fsync(fd)
        finally:
            os.close(fd)

        try:  # Best-effort embedding persistence
            store_task_embedding(entry.task_id, entry.summary, mem_path=self._mem_path)
        except Exception:
            pass

        self._reader.invalidate()

    def iter_entries(self, *, limit: int | None = None) -> List[MemoryEntry]:
        entries = list(reversed(self._reader.entries()))
        if limit is not None:
            entries = entries[: max(limit, 0)]
        return entries

    def query(self, text: str, *, limit: int = 5) -> List[MemoryEntry]:
        text_lower = text.lower()
        results: List[MemoryEntry] = []
        for entry in self.iter_entries():
            haystack: Sequence[str] = (entry.title, entry.summary)
            combined = " ".join(haystack).lower()
            if text_lower and text_lower not in combined:
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results


__all__ = ["JsonlMemoryBackend", "JsonlMemoryReader", "DEFAULT_JSONL_PATH"]
