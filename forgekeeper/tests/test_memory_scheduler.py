import types
import sys
from pathlib import Path
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
                self.store[i] = {"document": doc, "metadata": meta}

    def delete(self, ids=None, where=None):
        if ids:
            for i in ids:
                self.store.pop(i, None)

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
    from app.chats import memory_bank as mb
    importlib.reload(mb)
    return mb.MemoryBank(), collection


def test_cleanup_and_review(monkeypatch):
    bank, store = setup_bank(monkeypatch)
    from app.chats import memory_bank as mb

    now = datetime(2024, 1, 2)
    monkeypatch.setattr(mb, 'datetime', types.SimpleNamespace(utcnow=lambda: now - timedelta(days=10)))
    old_id = bank.add_entry('old', session_id='s', type='note')
    monkeypatch.setattr(mb, 'datetime', types.SimpleNamespace(utcnow=lambda: now))
    recent_id = bank.add_entry('recent', session_id='s', type='task')
    mb.datetime = datetime

    from app.chats.memory_scheduler import MemoryScheduler

    reviewed = []
    archived = []

    def summarizer(items):
        reviewed.extend(i['id'] for i in items)
        return 'summary'

    def archive_cb(text):
        archived.append(text)

    scheduler = MemoryScheduler(bank, max_entries=1, review_days=7, summarizer=summarizer, archive_callback=archive_cb)
    review = scheduler.review(now=now)
    assert review and review[0]['id'] == old_id

    scheduler.cleanup(now=now)
    assert len(store.store) <= 1
    assert archived
