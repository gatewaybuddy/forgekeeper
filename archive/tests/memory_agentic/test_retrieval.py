from forgekeeper.memory.agentic.retrieval import InMemoryRetriever


def test_index_and_search(tmp_path):
    path = tmp_path / "index.json"
    r = InMemoryRetriever(path)
    r.index(
        [
            {"id": "1", "text": "hello world"},
            {"id": "2", "text": "quick brown fox"},
        ]
    )
    res = r.search("quick", k=1)
    assert res and res[0]["id"] == "2"
