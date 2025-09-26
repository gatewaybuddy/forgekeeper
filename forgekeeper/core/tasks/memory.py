"""Simplified episodic memory interface for task weighting."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from forgekeeper.memory import MemoryBackend, MemoryEntry, get_memory_backend

@dataclass
class MemoryIndex:
    stats: Dict[str, Dict[str, int | str]]
    entries: List[dict]


def load_memory_summaries(
    task_file: Path | None,
    *,
    backend: MemoryBackend | None = None,
) -> tuple[Dict[str, Dict[str, int | str]], MemoryIndex]:
    """Load summary statistics from the configured :class:`MemoryBackend`."""

    # ``task_file`` is kept for backwards compatibility with the previous
    # implementation where the Markdown file determined the memory location.
    del task_file

    backend = backend or get_memory_backend()

    stats: Dict[str, Dict[str, int | str]] = {}
    index_entries: List[dict] = []

    for entry in backend.iter_entries():
        _accumulate_stats(stats, entry)
        index_entries.append(_index_payload(entry))

    return stats, MemoryIndex(stats, index_entries)


def memory_weight(
    text: str,
    summary_stats: Dict[str, Dict[str, int | str]],
    index: MemoryIndex,
    key: str | None = None,
) -> Tuple[float, List[str]]:
    if not summary_stats:
        return 0.0, []

    if key and key in summary_stats:
        stats = summary_stats[key]
        failures = int(stats.get("failure", 0)) + int(stats.get("negative_sentiment", 0))
        successes = int(stats.get("success", 0)) + int(stats.get("positive_sentiment", 0))
        related = []
        summary = stats.get("summary")
        if summary:
            related.append(str(summary))
        return failures - successes, related

    if not index.entries:
        return 0.0, []

    tokens = _tokenize(text)
    weight = 0.0
    related: List[str] = []
    for entry in index.entries:
        entry_tokens = _tokenize(entry.get("text", ""))
        if not entry_tokens:
            continue
        overlap = tokens & entry_tokens
        if not overlap:
            continue
        similarity = len(overlap) / max(len(entry_tokens), 1)
        stats = summary_stats.get(entry["task_id"], {})
        failures = int(stats.get("failure", 0)) + int(stats.get("negative_sentiment", 0))
        successes = int(stats.get("success", 0)) + int(stats.get("positive_sentiment", 0))
        weight += similarity * (failures - successes)
        summary = stats.get("summary") or entry.get("text")
        if summary and summary not in related:
            related.append(str(summary))
    return weight, related[:5]


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z0-9]+", text.lower()) if token}


def _accumulate_stats(
    stats: Dict[str, Dict[str, int | str]],
    entry: MemoryEntry,
) -> None:
    task_id = entry.task_id.strip()
    if not task_id:
        return

    record = stats.setdefault(
        task_id,
        {
            "failure": 0,
            "negative_sentiment": 0,
            "success": 0,
            "positive_sentiment": 0,
        },
    )

    status = entry.status.lower()
    sentiment = entry.sentiment.lower()

    if status in {"failed", "error", "blocked"}:
        record["failure"] = int(record.get("failure", 0)) + 1
    if status in {"success", "done", "completed"}:
        record["success"] = int(record.get("success", 0)) + 1
    if sentiment == "negative":
        record["negative_sentiment"] = int(record.get("negative_sentiment", 0)) + 1
    if sentiment == "positive":
        record["positive_sentiment"] = int(record.get("positive_sentiment", 0)) + 1

    summary_text = entry.summary or entry.title
    if summary_text:
        record.setdefault("summary", summary_text)


def _index_payload(entry: MemoryEntry) -> dict:
    summary_text = entry.summary or entry.title
    return {
        "task_id": entry.task_id,
        "text": str(summary_text or ""),
        "status": entry.status.lower(),
        "sentiment": entry.sentiment.lower(),
    }


__all__ = ["MemoryIndex", "load_memory_summaries", "memory_weight"]
