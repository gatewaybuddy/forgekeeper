"""High level memory management built on the vector store."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional

from . import memory_vector


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
        metadata = {
            "session_id": session_id,
            "role": "memory",
            "type": type,
            "tags": ",".join(tags) if tags else None,
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

