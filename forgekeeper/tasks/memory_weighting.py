from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple, Optional

from forgekeeper.memory import (
    LocalEmbedder,
    load_episodic_memory,
    retrieve_similar_tasks,
    similar_task_summaries,
)


def load_memory_summaries(
    task_file: Path,
) -> tuple[Dict[str, Dict[str, int | str]], LocalEmbedder | None]:
    """Load episodic memory summaries and associated embedder for ``task_file``."""

    mem_path = task_file.parent / ".forgekeeper" / "memory" / "episodic.jsonl"
    db_path = mem_path.parent.parent / "episodic_vectors.sqlite"
    try:
        embedder, summary = load_episodic_memory(mem_path, db_path)
    except Exception:  # pragma: no cover - best effort
        return {}, None
    if not isinstance(summary, dict):
        return {}, None
    return summary, embedder


def memory_weight(
    text: str,
    summary_stats: Dict[str, Dict[str, int | str]],
    embedder: Optional[LocalEmbedder],
    key: str | None = None,
) -> Tuple[float, List[str]]:
    """Return a memory-based weight and related summaries for ``text``."""

    if not summary_stats:
        return 0.0, []
    if key and key in summary_stats:
        stats = summary_stats[key]
        summary = stats.get("summary")
        failures = int(stats.get("failure", 0)) + int(
            stats.get("negative_sentiment", 0)
        )
        successes = int(stats.get("success", 0)) + int(
            stats.get("positive_sentiment", 0)
        )
        return (
            failures - successes,
            [str(summary)] if summary else [],
        )
    if not embedder:
        return 0.0, []
    similar = retrieve_similar_tasks(text, summary_stats, embedder)
    weight = 0.0
    for _, stats, sim in similar:
        failures = int(stats.get("failure", 0)) + int(
            stats.get("negative_sentiment", 0)
        )
        successes = int(stats.get("success", 0)) + int(
            stats.get("positive_sentiment", 0)
        )
        weight += sim * (failures - successes)
    related = similar_task_summaries(
        text, summary_stats, embedder, similar=similar
    )
    return weight, related
