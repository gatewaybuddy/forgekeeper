"""No-op embedding helpers used by episodic memory."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable


def store_task_embedding(task_id: str, summary: str, *, mem_path: Path | None = None) -> None:  # noqa: D401
    """Persist an embedding for ``task_id`` (stub implementation)."""


def load_episodic_memory(*_args, **_kwargs) -> list[dict]:  # pragma: no cover - placeholder
    return []


def retrieve_similar_tasks(*_args, **_kwargs) -> list[dict]:  # pragma: no cover - placeholder
    return []


def similar_task_summaries(*_args, **_kwargs) -> list[str]:  # pragma: no cover - placeholder
    return []


def LocalEmbedder(*_args, **_kwargs):  # pragma: no cover - placeholder
    return None


def SimpleTfidfVectorizer(*_args, **_kwargs):  # pragma: no cover - placeholder
    return None


def cosine_similarity(*_args, **_kwargs) -> float:  # pragma: no cover - placeholder
    return 0.0


__all__ = [
    "store_task_embedding",
    "load_episodic_memory",
    "retrieve_similar_tasks",
    "similar_task_summaries",
    "LocalEmbedder",
    "SimpleTfidfVectorizer",
    "cosine_similarity",
]
