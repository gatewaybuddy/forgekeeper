from __future__ import annotations

import datetime
import os
import uuid
from typing import Any, Dict, List, Optional

from pymongo import MongoClient

from .backend import embed

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "forgekeeper")
COLL_NAME = os.getenv("MONGODB_COLLECTION", "memory_vectors")

_mongo = MongoClient(MONGO_URI)
_db = _mongo[DB_NAME]
raw_collection = _db[COLL_NAME]
raw_collection.create_index([("project_id", 1), ("session_id", 1)])


class MongoVectorCollection:
    """Minimal wrapper that mimics the subset of Chroma's Collection API."""

    def __init__(self, collection):
        self.collection = collection

    def add(
        self,
        *,
        documents: List[str],
        embeddings: List[List[float]],
        ids: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> None:
        for doc, emb, _id, meta in zip(documents, embeddings, ids, metadatas):
            payload = {"_id": _id, "content": doc, "embedding": emb}
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
                filter_query: Dict[str, Any] = {"_id": _id}
                if meta and "project_id" in meta:
                    filter_query["project_id"] = meta["project_id"]
                self.collection.update_one(filter_query, {"$set": update})

    def delete(
        self,
        *,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
    ) -> None:
        query: Dict[str, Any] = {}
        if ids:
            query["_id"] = {"$in": ids}
        if where:
            query.update(where)
        if query:
            self.collection.delete_many(query)

    def get(
        self,
        *,
        ids: Optional[List[str]] = None,
        include: Optional[List[str]] = None,
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


collection = MongoVectorCollection(raw_collection)


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
