"""MongoDB-backed vector memory utilities.

This module replaces the previous ChromaDB implementation with a MongoDB
collection that stores both raw text and embeddings.  It exposes a minimal
Chroma-like interface (``collection``) so that existing consumers such as
``MemoryBank`` continue to operate without modification.  Retrieval uses a
simple in-memory cosine similarity search which enables lightweight RAG style
queries without requiring MongoDB's optional vector search feature.
"""

from __future__ import annotations

import datetime
import math
import os
import uuid
from typing import Any, Dict, List, Optional

from pymongo import MongoClient

# Optional embedding backends -------------------------------------------------
try:  # pragma: no cover - exercised via stub in tests
    from sentence_transformers import SentenceTransformer

    _local_model = SentenceTransformer("all-MiniLM-L6-v2")
except Exception:  # pragma: no cover - optional dependency
    _local_model = None


def _get_embedding_backend():
    """Return a callable that embeds a list of texts."""

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:  # pragma: no cover - network call avoided in tests
        import openai  # type: ignore

        client = openai.OpenAI(api_key=api_key)

        def _embed(texts: List[str]) -> List[List[float]]:
            resp = client.embeddings.create(
                input=texts, model="text-embedding-3-small"
            )
            return [d.embedding for d in resp.data]

        return _embed
    if _local_model is not None:
        return lambda texts: _local_model.encode(texts).tolist()

    # Fall back to a trivial bag-of-words embedding so imports never fail in
    # environments without external models.  This keeps tests lightweight.
    def _fallback(texts: List[str]) -> List[List[float]]:  # pragma: no cover
        return [[float(ord(c)) for c in t] for t in texts]

    return _fallback


embed = _get_embedding_backend()


# MongoDB connection ---------------------------------------------------------
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "forgekeeper")
COLL_NAME = os.getenv("MONGODB_COLLECTION", "memory_vectors")

_mongo = MongoClient(MONGO_URI)
_db = _mongo[DB_NAME]
_raw_collection = _db[COLL_NAME]
# Index by project and session for faster scoped queries
_raw_collection.create_index([("project_id", 1), ("session_id", 1)])


class MongoVectorCollection:
    """Minimal wrapper that mimics the subset of Chroma's Collection API."""

    def __init__(self, collection):
        self.collection = collection

    # -- CRUD helpers -----------------------------------------------------
    def add(
        self,
        *,
        documents: List[str],
        embeddings: List[List[float]],
        ids: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> None:
        for doc, emb, _id, meta in zip(documents, embeddings, ids, metadatas):
            payload = {
                "_id": _id,
                "content": doc,
                "embedding": emb,
            }
            if meta:
                payload.update(meta)
            self.collection.replace_one({"_id": _id}, payload, upsert=True)

    def update(
        self,
        *,
        ids: List[str],
        documents: List[Optional[str]],
        embeddings: List[Optional[List[float]]],
        metadatas: List[Optional[Dict[str, Any]]],
    ) -> None:
        for _id, doc, emb, meta in zip(ids, documents, embeddings, metadatas):
            update: Dict[str, Any] = {}
            if doc is not None:
                update["content"] = doc
            if emb is not None:
                update["embedding"] = emb
            if meta is not None:
                update.update(meta)
            if update:
                self.collection.update_one({"_id": _id}, {"$set": update})

    def delete(
        self,
        *,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
    ) -> None:
        if ids:
            self.collection.delete_many({"_id": {"$in": ids}})
        elif where:
            self.collection.delete_many(where)

    def get(
        self,
        *,
        ids: Optional[List[str]] = None,
        include: Optional[List[str]] = None,  # kept for API parity
        where: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, List]:
        query: Dict[str, Any] = {}
        if ids:
            query["_id"] = {"$in": ids}
        if where:
            query.update(where)
        docs = list(self.collection.find(query))
        return {
            "ids": [d["_id"] for d in docs],
            "documents": [d.get("content") for d in docs],
            "metadatas": [
                {k: v for k, v in d.items() if k not in {"_id", "content", "embedding"}}
                for d in docs
            ],
        }


# Public collection instance used by other modules
collection = MongoVectorCollection(_raw_collection)


# Convenience helpers --------------------------------------------------------
def store_memory_entry(
    project_id: str,
    session_id: str,
    role: str,
    content: str,
    *,
    type: str = "dialogue",
    tags: Optional[List[str]] = None,
) -> str:
    """Insert a new memory document and return its id."""

    doc_id = str(uuid.uuid4())
    metadata = {
        "project_id": project_id,
        "session_id": session_id,
        "role": role,
        "type": type,
        "tags": tags or [],
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
    collection.add(
        documents=[content],
        embeddings=[embed([content])[0]],
        ids=[doc_id],
        metadatas=[metadata],
    )
    return doc_id


def _cosine(a: List[float], b: List[float]) -> float:
    """Return cosine similarity between two vectors."""

    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


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

    docs = list(_raw_collection.find(filter_query))
    scored: List[tuple[str, Dict[str, Any], float]] = []
    for d in docs:
        meta = {
            k: v
            for k, v in d.items()
            if k not in {"_id", "content", "embedding"}
        }
        meta["id"] = d["_id"]
        score = _cosine(query_emb, d.get("embedding", []))
        scored.append((d.get("content", ""), meta, score))

    scored.sort(key=lambda x: x[2], reverse=True)
    return [(c, m) for c, m, _ in scored[:top_k]]


def delete_entries(
    project_id: str,
    session_id: str,
    *,
    types: Optional[List[str]] = None,
    ids: Optional[List[str]] = None,
) -> None:
    """Remove documents by ``session_id`` and optional constraints."""

    if ids:
        collection.delete(ids=ids)
        return
    query: Dict[str, Any] = {"project_id": project_id, "session_id": session_id}
    if types:
        query["type"] = {"$in": types}
    collection.delete(where=query)


def update_entry(entry_id: str, new_content: str) -> None:
    """Replace the stored content for ``entry_id``."""

    results = collection.get(ids=[entry_id], include=["metadatas"])
    if not results.get("ids"):
        return
    metadata = results["metadatas"][0]
    collection.update(
        ids=[entry_id],
        documents=[new_content],
        embeddings=[embed([new_content])[0]],
        metadatas=[metadata],
    )

