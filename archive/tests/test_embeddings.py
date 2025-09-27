import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.memory.embedding import LocalEmbedder, cosine_similarity
from forgekeeper import file_analyzer


def test_vector_storage(tmp_path):
    db_path = tmp_path / "vectors.sqlite"
    embedder = LocalEmbedder(db_path=db_path)
    embedder.store_embeddings({"a.py": "hello world"})
    vec = embedder.get_embedding("a.py")
    assert vec is not None and len(vec) > 0


def test_blended_scoring(tmp_path):
    summaries = {
        "add.py": {"summary": "function to add numbers"},
        "sub.py": {"summary": "function to subtract numbers"},
    }
    summary_file = tmp_path / "summaries.json"
    summary_file.write_text(json.dumps(summaries))
    db_path = tmp_path / "vectors.sqlite"
    embedder = LocalEmbedder(db_path=db_path)
    embedder.store_embeddings({k: v["summary"] for k, v in summaries.items()})
    results = file_analyzer.analyze_repo_for_task(
        "add two numbers", summary_path=str(summary_file), db_path=str(db_path)
    )
    assert results[0]["file"] == "add.py"
    assert results[0]["score"] >= results[1]["score"]
    assert results[0]["cosine"] >= results[1]["cosine"]


def test_store_embeddings_persist(tmp_path, monkeypatch):
    """Embeddings are stored and retrieved from the default SQLite path."""
    monkeypatch.chdir(tmp_path)
    embedder = LocalEmbedder()
    texts = {"a.txt": "hello world", "b.txt": "another file"}
    embedder.store_embeddings(texts)
    db_file = tmp_path / ".forgekeeper" / "vectors.sqlite"
    assert db_file.is_file()
    new_embedder = LocalEmbedder()
    assert new_embedder.get_embedding("a.txt") is not None


def test_cosine_similarity_influences_ranking(tmp_path, monkeypatch):
    """Cosine similarity from embeddings affects file ranking."""
    monkeypatch.chdir(tmp_path)
    texts = {
        "short.py": "apple banana banana banana",
        "long.py": "apple banana banana banana banana banana",
    }
    embedder = LocalEmbedder()
    embedder.store_embeddings(texts)

    query = "apple banana"
    query_vec = embedder.embed_query(query)
    short_vec = embedder.get_embedding("short.py")
    long_vec = embedder.get_embedding("long.py")
    short_cos = cosine_similarity(query_vec, short_vec)
    long_cos = cosine_similarity(query_vec, long_vec)
    assert short_cos > long_cos

    summary_file = tmp_path / "summaries.json"
    summary_file.write_text(json.dumps({k: {"summary": v} for k, v in texts.items()}))
    results = file_analyzer.analyze_repo_for_task(query, summary_path=str(summary_file))

    assert results[0]["file"] == "short.py"
    assert results[0]["cosine"] == pytest.approx(short_cos)
    assert results[1]["cosine"] == pytest.approx(long_cos)
    assert results[0]["score"] > results[1]["score"]
