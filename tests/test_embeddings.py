import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.memory.embeddings import LocalEmbedder
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
