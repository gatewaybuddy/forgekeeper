"""Utilities for selecting relevant memory entries."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Dict, List

from .memory_bank import MemoryBank, evaluate_relevance


class RetrievalManager:
    """Retrieve the most relevant memory items for a given context."""

    def __init__(self, memory_bank: MemoryBank) -> None:
        self.memory_bank = memory_bank

    def retrieve(
        self,
        context: str,
        *,
        top_n: int = 5,
        filters: Optional[Dict] = None,
        now: Optional[datetime] = None,
    ) -> List[Dict]:
        """Return the top ``top_n`` memory entries for ``context``.

        Parameters
        ----------
        context:
            Current conversation or task context.
        top_n:
            Number of entries to return.
        filters:
            Optional filtering by ``type`` or ``session_id`` as well as
            ``tags`` (list of strings) and ``after``/``before`` datetimes.
        now:
            Override the timestamp used for recency scoring.
        """
        now = now or datetime.utcnow()
        filters = filters or {}

        # Extract extended filters
        tag_filter = set(filters.pop("tags", []) or [])
        after = filters.pop("after", None)
        before = filters.pop("before", None)

        entries = self.memory_bank.list_entries(filters)
        scored: List[Dict] = []
        for entry in entries:
            # Tag filtering
            if tag_filter:
                tags = set(entry.get("tags", "").split(",")) if entry.get("tags") else set()
                if not tags.intersection(tag_filter):
                    continue
            # Date filtering
            ts = entry.get("timestamp")
            try:
                dt_ts = datetime.fromisoformat(ts) if ts else None
            except ValueError:
                dt_ts = None
            if after and (dt_ts is None or dt_ts < after):
                continue
            if before and (dt_ts is None or dt_ts > before):
                continue

            score = evaluate_relevance(entry, context, now=now)
            scored.append({**entry, "score": score})

        scored.sort(key=lambda e: e["score"], reverse=True)
        results = scored[:top_n]
        for item in results:
            self.memory_bank.touch_entry(item["id"])
        return results
