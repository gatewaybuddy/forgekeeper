from __future__ import annotations

from pathlib import Path
from forgekeeper_v2.memory.agentic import AgenticStore, FeedbackLog, Retriever


def test_agentic_store_roundtrip(tmp_path: Path):
    store = AgenticStore(tmp_path/"agentic.json")
    store.set_fact("foo", 1)
    store.append_feedback({"kind": "note", "message": "ok"})
    assert store.get_fact("foo") == 1
    fb = store.recent_feedback()
    assert fb and fb[-1]["message"] == "ok"


def test_retriever_sets_context(tmp_path: Path):
    store = AgenticStore(tmp_path/"agentic.json")
    r = Retriever(store)
    ctx = r.context_from_bullets(["a", "b", "c"], limit=2)
    assert isinstance(ctx, str) and store.get_fact("last_context")
