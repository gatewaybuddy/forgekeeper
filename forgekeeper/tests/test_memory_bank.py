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
        if ids:
            for i in ids:
                self.store.pop(i, None)
        elif where:
            for key, value in where.items():
                for i in list(self.store.keys()):
                    if self.store[i]["metadata"].get(key) == value:
                        self.store.pop(i)

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
    from app.chats.memory_bank import MemoryBank  # import after patching
    return MemoryBank(), collection


def test_add_update_list_delete(monkeypatch):
    bank, store = setup_bank(monkeypatch)
    entry_id = bank.add_entry('hello', session_id='s1', type='note', tags=['t'])
    assert entry_id in store.store

    bank.update_entry(entry_id, 'updated')
    assert store.store[entry_id]['document'] == 'updated'

    entries = bank.list_entries({'session_id': 's1'})
    assert len(entries) == 1
    assert entries[0]['content'] == 'updated'

    bank.delete_entries([entry_id])
    assert entry_id not in store.store


def test_evaluate_relevance_scores():
    from app.chats.memory_bank import evaluate_relevance
    now = datetime(2024, 1, 1)

    recent_goal = {
        "content": "complete the task",
        "timestamp": (now - timedelta(hours=1)).isoformat(),
        "type": "task",
    }
    old_note = {
        "content": "complete the task",
        "timestamp": (now - timedelta(days=45)).isoformat(),
        "type": "note",
    }

    score_recent_goal = evaluate_relevance(recent_goal, "task", now=now)
    score_old_note = evaluate_relevance(old_note, "task", now=now)

    assert score_recent_goal > score_old_note
    assert 0 <= score_recent_goal <= 1
