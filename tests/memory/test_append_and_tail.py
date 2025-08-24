import json
import os
import subprocess
import sys

from forgekeeper.memory import episodic
from forgekeeper.memory.episodic import append_entry


def test_append_and_tail(tmp_path, monkeypatch, repo_root):
    memory_file = tmp_path / ".forgekeeper/memory/episodic.jsonl"
    monkeypatch.setattr(episodic, "MEMORY_FILE", memory_file)

    entries = [
        {
            "task_id": "T1",
            "title": "first",
            "status": "success",
            "changed_files": ["a.py"],
            "summary": "first entry",
            "artifacts_paths": [],
            "sentiment": "positive",
            "emotion": "happy",
            "rationale": None,
        },
        {
            "task_id": "T2",
            "title": "second",
            "status": "failure",
            "changed_files": ["b.py"],
            "summary": "second entry",
            "artifacts_paths": [],
            "sentiment": "negative",
            "emotion": "sad",
            "rationale": None,
        },
        {
            "task_id": "T3",
            "title": "third",
            "status": "success",
            "changed_files": ["c.py"],
            "summary": "third entry",
            "artifacts_paths": [],
            "sentiment": "positive",
            "emotion": "happy",
            "rationale": None,
        },
    ]

    for entry in entries:
        append_entry(**entry)

    lines = memory_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == len(entries)
    parsed = [json.loads(line) for line in lines]
    expected = [
        {k: v for k, v in entry.items() if v is not None}
        for entry in entries
    ]
    assert parsed == expected

    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_root)
    result = subprocess.run(
        [sys.executable, "-m", "forgekeeper.memory.episodic", "--review", "2"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    out_lines = result.stdout.strip().splitlines()
    assert len(out_lines) == 2
    assert json.loads(out_lines[0])["task_id"] == "T2"
    assert json.loads(out_lines[1])["task_id"] == "T3"

    result = subprocess.run(
        [sys.executable, "-m", "forgekeeper.memory.episodic", "--browse", "1"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    assert "T3" in result.stdout
    assert "third entry" in result.stdout
    assert "happy" in result.stdout
