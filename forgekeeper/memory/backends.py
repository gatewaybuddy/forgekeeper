"""Core memory backend interfaces and registry helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Mapping, Protocol, Sequence, runtime_checkable


@dataclass(slots=True)
class MemoryEntry:
    """Structured representation of a persisted memory entry.

    The dataclass intentionally mirrors the JSON payload produced by the
    legacy episodic memory module while also retaining arbitrary metadata via
    ``extra``. Consumers can build instances manually or rely on
    :meth:`from_payload` for conversion from dictionaries loaded from disk.
    """

    task_id: str
    title: str
    status: str
    summary: str
    changed_files: tuple[str, ...] = field(default_factory=tuple)
    artifacts_paths: tuple[str, ...] = field(default_factory=tuple)
    sentiment: str = "neutral"
    emotion: str = "neutral"
    rationale: str | None = None
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "MemoryEntry":
        """Create an entry from a dictionary payload.

        Parameters
        ----------
        payload:
            Mapping representing a serialized memory record. Unknown keys are
            preserved inside :attr:`extra` so round-tripping via
            :meth:`to_payload` retains the original information.
        """

        base_keys = {
            "task_id",
            "title",
            "status",
            "summary",
            "changed_files",
            "artifacts_paths",
            "sentiment",
            "emotion",
            "rationale",
        }
        extra = {key: value for key, value in payload.items() if key not in base_keys}
        return cls(
            task_id=str(payload.get("task_id", "")),
            title=str(payload.get("title", "")),
            status=str(payload.get("status", "")),
            summary=str(payload.get("summary", "")),
            changed_files=tuple(str(item) for item in payload.get("changed_files", []) or []),
            artifacts_paths=tuple(str(item) for item in payload.get("artifacts_paths", []) or []),
            sentiment=str(payload.get("sentiment", "neutral")),
            emotion=str(payload.get("emotion", "neutral")),
            rationale=payload.get("rationale"),
            extra=extra,
        )

    def to_payload(self) -> Dict[str, Any]:
        """Return a dictionary representation suitable for serialization."""

        payload: Dict[str, Any] = {
            "task_id": self.task_id,
            "title": self.title,
            "status": self.status,
            "summary": self.summary,
            "changed_files": list(self.changed_files),
            "artifacts_paths": list(self.artifacts_paths),
            "sentiment": self.sentiment,
            "emotion": self.emotion,
            "rationale": self.rationale,
        }
        payload.update(self.extra)
        return payload


@runtime_checkable
class MemoryBackend(Protocol):
    """Protocol describing the required memory backend behaviour."""

    name: str

    def append(self, entry: MemoryEntry) -> None:
        """Persist a memory entry."""

    def iter_entries(self, *, limit: int | None = None) -> Iterable[MemoryEntry]:
        """Yield entries ordered from newest to oldest."""

    def query(self, text: str, *, limit: int = 5) -> List[MemoryEntry]:
        """Return entries relevant to ``text`` ordered by similarity."""


MemoryBackendFactory = Callable[[], MemoryBackend]

_BACKENDS: Dict[str, MemoryBackendFactory] = {}


def register_memory_backend(name: str, factory: MemoryBackendFactory, *, replace: bool = False) -> None:
    """Register ``factory`` under ``name``.

    Parameters
    ----------
    name:
        Unique backend identifier.
    factory:
        Callable that instantiates and returns a :class:`MemoryBackend`.
    replace:
        If ``False`` (default), attempting to register a duplicate name raises
        :class:`ValueError`.
    """

    if not replace and name in _BACKENDS:
        raise ValueError(f"Memory backend '{name}' already registered")
    _BACKENDS[name] = factory


def available_memory_backends() -> Sequence[str]:
    """Return the names of registered backends in registration order."""

    return tuple(_BACKENDS.keys())


def get_memory_backend(name: str | None = None) -> MemoryBackend:
    """Return an instantiated backend selected via configuration."""

    from forgekeeper import config

    backend_name = name or getattr(config, "FK_MEMORY_BACKEND", "episodic")
    try:
        factory = _BACKENDS[backend_name]
    except KeyError as exc:  # pragma: no cover - defensive guard
        available = ", ".join(sorted(_BACKENDS)) or "<none>"
        raise LookupError(f"Unknown memory backend '{backend_name}' (available: {available})") from exc
    return factory()


__all__ = [
    "MemoryEntry",
    "MemoryBackend",
    "MemoryBackendFactory",
    "register_memory_backend",
    "available_memory_backends",
    "get_memory_backend",
]
