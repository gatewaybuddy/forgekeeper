"""Memory utilities exposed at the package root."""

from __future__ import annotations

from .backends import (
    MemoryBackend,
    MemoryBackendFactory,
    MemoryEntry,
    available_memory_backends,
    get_memory_backend,
    register_memory_backend,
)
from . import embeddings, episodic
from .jsonl import JsonlMemoryBackend


def _episodic_backend_factory() -> JsonlMemoryBackend:
    from .episodic import MEMORY_FILE

    return JsonlMemoryBackend(mem_path=MEMORY_FILE)


register_memory_backend("episodic", _episodic_backend_factory, replace=True)
register_memory_backend(JsonlMemoryBackend.name, JsonlMemoryBackend, replace=True)


__all__ = [
    "embeddings",
    "episodic",
    "MemoryBackend",
    "MemoryBackendFactory",
    "MemoryEntry",
    "available_memory_backends",
    "get_memory_backend",
    "register_memory_backend",
    "JsonlMemoryBackend",
]
