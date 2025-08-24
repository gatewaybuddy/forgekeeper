from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from forgekeeper.app.memory import bank as store_bank
from forgekeeper.app.memory.relevance import evaluate_relevance


class MemoryBank:
    """Interface for storing, updating and retrieving long term memory."""

    def __init__(self, project_id: str) -> None:
        self.project_id = project_id

    def add_entry(
        self,
        content: str,
        *,
        session_id: str,
        type: str,
        tags: Optional[List[str]] = None,
    ) -> str:
        timestamp = datetime.now(timezone.utc).isoformat()
        return store_bank.add_entry(
            self.project_id,
            content,
            session_id=session_id,
            type=type,
            tags=tags,
            timestamp=timestamp,
        )

    def update_entry(self, entry_id: str, new_content: str) -> None:
        store_bank.update_entry(self.project_id, entry_id, new_content)

    def touch_entry(self, entry_id: str) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()
        store_bank.touch_entry(self.project_id, entry_id, timestamp=timestamp)

    def delete_entries(
        self,
        ids: Optional[List[str]] = None,
        *,
        filters: Optional[Dict[str, str]] = None,
    ) -> None:
        store_bank.delete_entries(self.project_id, ids=ids, filters=filters)

    def list_entries(self, filters: Optional[Dict[str, str]] = None) -> List[Dict]:
        return store_bank.list_entries(self.project_id, filters)

    def save(self, filepath: str) -> None:
        store_bank.save(self.project_id, filepath)

    def load(self, filepath: str) -> None:
        store_bank.load(self.project_id, filepath)


__all__ = ["MemoryBank", "evaluate_relevance", "datetime", "timezone"]
