from __future__ import annotations

import json
from typing import List, Dict

from .collection import add_entry, list_entries


def save(project_id: str, filepath: str) -> None:
    """Save all entries for ``project_id`` to ``filepath`` as JSON."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(list_entries(project_id), f, indent=2)


def load(project_id: str, filepath: str) -> None:
    """Load entries from ``filepath`` back into the vector database."""
    with open(filepath, "r", encoding="utf-8") as f:
        items: List[Dict] = json.load(f)
    for item in items:
        add_entry(
            project_id,
            item["content"],
            session_id=item.get("session_id", ""),
            type=item.get("type", ""),
            tags=item.get("tags"),
            timestamp=item.get("timestamp"),
            last_accessed=item.get("last_accessed"),
            entry_id=item.get("id"),
        )


__all__ = ["save", "load"]
