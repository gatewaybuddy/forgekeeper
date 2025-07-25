import types
import sys
from pathlib import Path

import pytest
from datetime import datetime, timedelta

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class DummyCollection:
    def __init__(self):
        self.store = {}

    def add(self, documents, embeddings, ids, metadatas):
        for doc, i, meta in zip(documents, ids, metadatas):
            self.store[i] = {"document": doc, "metadata": meta}

    def update(self, ids, documents, embeddings, metadatas):
        for doc, i in zip(documents, ids):
            if i in self.store:
                meta = self.store[i]["metadata"]
                self.store[i] = {"document": doc, "metadata": meta}

    def delete(self, ids=None, where=None):
        pass

    def get(self, include=None, where=None):
        ids, docs, metas = [], [], []
        for i, data in self.store.items():
            if where and not all(
                data["metadata"].get(k) == v for k, v in where.items()
            ):
                continue
            ids.append(i)
            docs.append(data["document"])
            metas.append(data["metadata"])
        return {"ids": ids, "documents": docs, "metadatas": metas}


def setup_bank(monkeypatch):
    collection = DummyCollection()
    stub = types.SimpleNamespace(
        collection=collection,
        embed=lambda texts: [[0.0] * len(t) for t in texts],
    )

    def update_entry(entry_id, new_content):
        collection.update([entry_id], [new_content], [None], [None])

    stub.update_entry = update_entry
    monkeypatch.setitem(sys.modules, 'app.chats.memory_vector', stub)
    from app.chats.memory_bank import MemoryBank
    return MemoryBank(), collection


def test_retrieve_top_items(monkeypatch):
    bank, store = setup_bank(monkeypatch)
    from app.chats import memory_bank as mb

    now = datetime(2024, 1, 2)
    monkeypatch.setattr(mb, 'datetime', types.SimpleNamespace(utcnow=lambda: now - timedelta(hours=1)))
    recent_id = bank.add_entry('finish the mission', session_id='s1', type='task', tags=['p'])

    monkeypatch.setattr(mb, 'datetime', types.SimpleNamespace(utcnow=lambda: now - timedelta(days=10)))
    old_id = bank.add_entry('some note', session_id='s1', type='note', tags=['p'])

    monkeypatch.setattr(mb, 'datetime', datetime)

    from app.chats.retrieval_manager import RetrievalManager

    manager = RetrievalManager(bank)
    results = manager.retrieve('mission', top_n=2, filters={'session_id': 's1'}, now=now)

    assert results[0]['id'] == recent_id
    assert len(results) == 2
    assert results[0]['score'] >= results[1]['score']

