from __future__ import annotations

from typing import Any, Dict, List, Optional

from .backend import embed, cosine_similarity
from .store import raw_collection


def retrieve_similar_entries(
    project_id: str,
    session_id: str,
    query: str,
    *,
    top_k: int = 5,
    types: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
) -> List[tuple[str, Dict[str, Any]]]:
    """Return ``top_k`` entries most similar to ``query``.

    Filtering by ``types`` and ``tags`` is performed using MongoDB query
    operators before the in-memory similarity ranking, keeping results scoped to
    the active session.
    """

    query_emb = embed([query])[0]
    filter_query: Dict[str, Any] = {"project_id": project_id, "session_id": session_id}
    if types:
        filter_query["type"] = {"$in": types}
    if tags:
        filter_query["tags"] = {"$in": tags}

    docs = list(raw_collection.find(filter_query))
    scored: List[tuple[str, Dict[str, Any], float]] = []
    for d in docs:
        meta = {k: v for k, v in d.items() if k not in {"_id", "content", "embedding"}}
        meta["id"] = d["_id"]
        score = cosine_similarity(query_emb, d.get("embedding", []))
        scored.append((d.get("content", ""), meta, score))

    scored.sort(key=lambda x: x[2], reverse=True)
    return [(c, m) for c, m, _ in scored[:top_k]]
