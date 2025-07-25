"""High level memory management built on the vector store."""

from __future__ import annotations

import json
import uuid

from datetime import datetime, timezone

from typing import List, Dict, Optional
import math
import re

from . import memory_vector


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

    timestamp = memory_item.get("timestamp")
    try:
        item_time = datetime.fromisoformat(timestamp) if timestamp else now
    except ValueError:
        item_time = now

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


class MemoryBank:
    """Interface for storing, updating and retrieving long term memory."""

    def add_entry(
        self,
        content: str,
        *,
        session_id: str,
        type: str,
        tags: List[str] | None = None,
    ) -> str:
        """Store ``content`` and return the new entry id."""
        entry_id = str(uuid.uuid4())

        timestamp = datetime.now(timezone.utc).isoformat()

        metadata = {
            "session_id": session_id,
            "role": "memory",
            "type": type,
            "tags": ",".join(tags) if tags else None,
            "last_accessed": timestamp,
            "timestamp": datetime.utcnow().isoformat(),
        }
        memory_vector.collection.add(
            documents=[content],
            embeddings=memory_vector.embed([content]),
            ids=[entry_id],
            metadatas=[metadata],
        )
        return entry_id

    def update_entry(self, entry_id: str, new_content: str) -> None:
        """Replace the stored content for ``entry_id``."""
        memory_vector.update_entry(entry_id, new_content)

    def touch_entry(self, entry_id: str) -> None:
        """Update the ``last_accessed`` timestamp for ``entry_id``."""
        results = memory_vector.collection.get(ids=[entry_id], include=["documents", "metadatas"])
        if not results.get("ids"):
            return
        doc = results["documents"][0]
        meta = results["metadatas"][0]
        meta["last_accessed"] = datetime.now(timezone.utc).isoformat()

        memory_vector.collection.update(
            ids=[entry_id],
            documents=[doc],
            embeddings=memory_vector.embed([doc]),
            metadatas=[meta],
        )

    def delete_entries(
        self,
        ids: List[str] | None = None,
        *,
        filters: Dict[str, str] | None = None,
    ) -> None:
        """Delete entries by ``ids`` or matching metadata ``filters``."""
        if ids:
            memory_vector.collection.delete(ids=ids)
            return
        if filters:
            for key, value in filters.items():
                memory_vector.collection.delete(where={key: value})

    def list_entries(self, filters: Dict[str, str] | None = None) -> List[Dict]:
        """Return a list of stored entries with optional metadata filtering."""
        results = memory_vector.collection.get(
            include=["documents", "metadatas", "ids"]
        )
        entries = [
            {
                "id": i,
                "content": doc,
                **meta,
            }
            for i, doc, meta in zip(
                results.get("ids", []),
                results.get("documents", []),
                results.get("metadatas", []),
            )
        ]
        if filters:
            def matches(e: Dict) -> bool:
                return all(e.get(k) == v for k, v in filters.items())

            entries = [e for e in entries if matches(e)]
        return entries

    def save(self, filepath: str) -> None:
        """Save all entries to ``filepath`` as JSON."""
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(self.list_entries(), f, indent=2)

    def load(self, filepath: str) -> None:
        """Load entries from ``filepath`` back into the vector database."""
        with open(filepath, "r", encoding="utf-8") as f:
            items = json.load(f)
        for item in items:
            metadata = {k: item[k] for k in item if k not in {"id", "content"}}
            memory_vector.collection.add(
                documents=[item["content"]],
                embeddings=memory_vector.embed([item["content"]]),
                ids=[item["id"]],
                metadatas=[metadata],
            )


if __name__ == "__main__":
    bank = MemoryBank()
    eid = bank.add_entry(
        "Example memory", session_id="demo", type="note", tags=["demo"]
    )
    bank.update_entry(eid, "Updated example memory")
    print(bank.list_entries({"session_id": "demo"}))
    bank.delete_entries([eid])

