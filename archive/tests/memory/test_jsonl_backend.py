from __future__ import annotations

import json

from forgekeeper.memory.jsonl import JsonlMemoryBackend


def test_jsonl_backend_reads_existing_file(tmp_path) -> None:
    mem_path = tmp_path / "mem.jsonl"
    mem_path.parent.mkdir(parents=True, exist_ok=True)
    entries = [
        {
            "task_id": "1",
            "title": "First",
            "status": "done",
            "summary": "first entry",
            "changed_files": ["a.py"],
            "artifacts_paths": ["artifacts/log.txt"],
            "sentiment": "positive",
            "emotion": "calm",
            "rationale": "all good",
            "custom": "value",
        },
        {
            "task_id": "2",
            "title": "Second",
            "status": "failed",
            "summary": "second entry",
            "changed_files": [],
            "artifacts_paths": [],
        },
    ]
    mem_path.write_text("\n".join(json.dumps(entry) for entry in entries) + "\n", encoding="utf-8")

    backend = JsonlMemoryBackend(mem_path=mem_path)

    loaded = backend.iter_entries()
    assert [entry.task_id for entry in loaded] == ["2", "1"]
    assert loaded[1].extra.get("custom") == "value"

    queried = backend.query("second")
    assert len(queried) == 1
    assert queried[0].task_id == "2"
