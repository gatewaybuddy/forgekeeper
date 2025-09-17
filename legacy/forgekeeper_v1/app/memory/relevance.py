from __future__ import annotations

from datetime import datetime, timezone
import math
import re
from typing import Dict, Optional


def evaluate_relevance(memory_item: Dict, context: str, *, now: Optional[datetime] = None) -> float:
    """Return a relevance score between 0 and 1 for ``memory_item``.

    Parameters
    ----------
    memory_item : Dict
        Dictionary containing ``content`` and metadata fields including
        ``timestamp`` and ``type``.
    context : str
        The conversation or task context to evaluate against.
    now : datetime, optional
        Timestamp used for recency comparison. Defaults to ``datetime.now(timezone.utc)``.

    The heuristic combines recency, keyword overlap and type weighting.
    """

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    timestamp = memory_item.get("timestamp")
    try:
        item_time = datetime.fromisoformat(timestamp) if timestamp else now
    except ValueError:
        item_time = now
    if item_time.tzinfo is None:
        item_time = item_time.replace(tzinfo=timezone.utc)

    # Recency score with exponential decay (30 day half-life)
    days_old = (now - item_time).total_seconds() / 86400
    recency_score = math.exp(-days_old / 30)

    # Keyword overlap between memory content and context
    context_words = set(re.findall(r"\w+", context.lower()))
    item_words = set(re.findall(r"\w+", memory_item.get("content", "").lower()))
    if context_words:
        match_score = len(context_words & item_words) / len(context_words)
    else:
        match_score = 0.0

    # Type weighting
    important_types = {"goal", "task", "reflection"}
    type_score = 1.0 if memory_item.get("type") in important_types else 0.0

    score = recency_score * 0.4 + match_score * 0.4 + type_score * 0.2
    return max(0.0, min(score, 1.0))
