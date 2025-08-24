from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional


def add_entry(
    project_id: str,
    content: str,
    *,
    session_id: str,
    type: str,
    tags: Optional[List[str]] = None,
    timestamp: Optional[str] = None,
) -> str:
    """Store ``content`` and return the new entry id."""
    entry_id = str(uuid.uuid4())
    timestamp = timestamp or datetime.now(timezone.utc).isoformat()
    metadata = {
        "project_id": project_id,
        "session_id": session_id,
        "role": "memory",
        "type": type,
        "tags": tags or [],
        "last_accessed": timestamp,
        "timestamp": timestamp,
    }
    from . import backend, store
    store.collection.add(
        documents=[content],
        embeddings=backend.embed([content]),
        ids=[entry_id],
        metadatas=[metadata],
    )
    return entry_id


def update_entry(project_id: str, entry_id: str, new_content: str) -> None:
    """Replace the stored content for ``entry_id`` scoped to ``project_id``."""
    from . import backend, store
    results = store.collection.get(
        ids=[entry_id], include=["metadatas"], where={"project_id": project_id}
    )
    if not results.get("ids"):
        return
    metadata = results["metadatas"][0]
    store.collection.update(
        ids=[entry_id],
        documents=[new_content],
        embeddings=backend.embed([new_content]),
        metadatas=[{**metadata, "project_id": project_id}],
    )


def touch_entry(project_id: str, entry_id: str, *, timestamp: Optional[str] = None) -> None:
    """Update the ``last_accessed`` timestamp for ``entry_id``."""
    from . import backend, store
    results = store.collection.get(
        ids=[entry_id],
        include=["documents", "metadatas"],
        where={"project_id": project_id},
    )
    if not results.get("ids"):
        return
    doc = results["documents"][0]
    meta = results["metadatas"][0]
    meta["last_accessed"] = timestamp or datetime.now(timezone.utc).isoformat()
    store.collection.update(
        ids=[entry_id],
        documents=[doc],
        embeddings=backend.embed([doc]),
        metadatas=[{**meta, "project_id": project_id}],
    )


def delete_entries(
    project_id: str,
    ids: Optional[List[str]] = None,
    *,
    filters: Optional[Dict[str, str]] = None,
) -> None:
    """Delete entries by ``ids`` or matching metadata ``filters``."""
    from . import store
    if ids:
        store.collection.delete(ids=ids, where={"project_id": project_id})
        return
    if filters:
        query = {"project_id": project_id, **filters}
        store.collection.delete(where=query)


def list_entries(
    project_id: str, filters: Optional[Dict[str, str]] = None
) -> List[Dict]:
    """Return a list of stored entries with optional metadata filtering."""
    from . import store
    results = store.collection.get(
        include=["documents", "metadatas", "ids"],
        where={"project_id": project_id},
    )
    entries = [
        {"id": i, "content": doc, **meta}
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


def save(project_id: str, filepath: str) -> None:
    """Save all entries for ``project_id`` to ``filepath`` as JSON."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(list_entries(project_id), f, indent=2)


def load(project_id: str, filepath: str) -> None:
    """Load entries from ``filepath`` back into the vector database."""
    from . import backend, store
    with open(filepath, "r", encoding="utf-8") as f:
        items = json.load(f)
    for item in items:
        metadata = {k: item[k] for k in item if k not in {"id", "content"}}
        metadata["project_id"] = project_id
        store.collection.add(
            documents=[item["content"]],
            embeddings=backend.embed([item["content"]]),
            ids=[item["id"]],
            metadatas=[metadata],
        )
