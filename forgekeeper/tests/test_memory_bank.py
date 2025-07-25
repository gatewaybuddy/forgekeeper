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
        for doc, meta, i in zip(documents, metadatas, ids):
            if i in self.store:
                if meta is None:
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


    def get(self, ids=None, include=None, where=None):
        sel_ids, docs, metas = [], [], []
        for i, data in self.store.items():
            if ids and i not in ids:
                continue
            if where and not all(data["metadata"].get(k) == v for k, v in where.items()):
                continue
            sel_ids.append(i)
            docs.append(data["document"])
            metas.append(data["metadata"])
        return {"ids": sel_ids, "documents": docs, "metadatas": metas}



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

    import importlib
    from app.chats import memory_bank as mb  # reload so stub is used
    importlib.reload(mb)
    return mb.MemoryBank(), collection



def test_add_update_list_delete(monkeypatch):
    bank, store = setup_bank(monkeypatch)
    entry_id = bank.add_entry('hello', session_id='s1', type='note', tags=['t'])
    assert entry_id in store.store


    # ensure last_accessed stored
    meta_ts = store.store[entry_id]['metadata']['last_accessed']
    assert meta_ts is not None

    bank.update_entry(entry_id, 'updated')
    assert store.store[entry_id]['document'] == 'updated'

    entries = bank.list_entries({'session_id': 's1'})
    assert len(entries) == 1
    assert entries[0]['content'] == 'updated'

    bank.touch_entry(entry_id)
    touched = store.store[entry_id]['metadata']['last_accessed']
    assert touched != meta_ts

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

