import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.memory import episodic
from forgekeeper.memory.episodic import append_entry


def test_append_and_tail(tmp_path, monkeypatch):
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
            "rationale": None,
        },
    ]

    for entry in entries:
        append_entry(**entry)

    lines = memory_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == len(entries)
    parsed = [json.loads(line) for line in lines]
    assert parsed == entries

    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
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


def test_recent_pushes_cli(tmp_path, monkeypatch):
    memory_file = tmp_path / ".forgekeeper/memory/episodic.jsonl"
    monkeypatch.setattr(episodic, "MEMORY_FILE", memory_file)

    entries = [
        {
            "task_id": "P1",
            "title": "push one",
            "status": "pushed",
            "changed_files": [],
            "summary": "details1",
            "artifacts_paths": [],
            "sentiment": "neutral",
            "rationale": "first push",
        },
        {
            "task_id": "P2",
            "title": "push two",
            "status": "pushed",
            "changed_files": [],
            "summary": "details2",
            "artifacts_paths": [],
            "sentiment": "neutral",
            "rationale": "second push",
        },
        {
            "task_id": "X",
            "title": "other",
            "status": "committed",
            "changed_files": [],
            "summary": "other entry",
            "artifacts_paths": [],
            "sentiment": "neutral",
        },
    ]

    for entry in entries:
        append_entry(**entry)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    result = subprocess.run(
        [sys.executable, "-m", "forgekeeper.memory.episodic", "--pushes", "2"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    out_lines = [line for line in result.stdout.strip().splitlines() if line]
    assert len(out_lines) == 2
    assert "push two" in out_lines[0]
    assert "push one" in out_lines[1]
