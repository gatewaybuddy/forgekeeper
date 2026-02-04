"""Simplified episodic memory interface for task weighting."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

@dataclass
class MemoryIndex:
    stats: Dict[str, Dict[str, int | str]]
    entries: List[dict]


def load_memory_summaries(task_file: Path) -> tuple[Dict[str, Dict[str, int | str]], MemoryIndex]:
    mem_path = task_file.parent / ".forgekeeper" / "memory" / "episodic.jsonl"
    stats: Dict[str, Dict[str, int | str]] = {}
    entries: List[dict] = []
    if not mem_path.exists():
        return stats, MemoryIndex(stats, entries)

    for line in mem_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            data = json.loads(line)
        except Exception:
            continue
        task_id = str(data.get("task_id") or data.get("id") or "").strip()
        if not task_id:
            continue
        record = stats.setdefault(task_id, {
            "failure": 0,
            "negative_sentiment": 0,
            "success": 0,
            "positive_sentiment": 0,
        })
        status = str(data.get("status") or "").lower()
        sentiment = str(data.get("sentiment") or "").lower()
        if status in {"failed", "error", "blocked"}:
            record["failure"] = int(record.get("failure", 0)) + 1
        if status in {"success", "done", "completed"}:
            record["success"] = int(record.get("success", 0)) + 1
        if sentiment == "negative":
            record["negative_sentiment"] = int(record.get("negative_sentiment", 0)) + 1
        if sentiment == "positive":
            record["positive_sentiment"] = int(record.get("positive_sentiment", 0)) + 1
        summary_text = data.get("summary") or data.get("title") or data.get("body")
        if summary_text:
            record.setdefault("summary", summary_text)
        entries.append({
            "task_id": task_id,
            "text": str(summary_text or data.get("title") or ""),
            "status": status,
            "sentiment": sentiment,
        })
    return stats, MemoryIndex(stats, entries)


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


__all__ = ["MemoryIndex", "load_memory_summaries", "memory_weight"]
