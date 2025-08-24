import os
import subprocess
import sys

from forgekeeper.memory import episodic
from forgekeeper.memory.episodic import append_entry


def test_recent_pushes_cli(tmp_path, monkeypatch, repo_root):
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
            "emotion": "calm",
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
            "emotion": "calm",
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
            "emotion": "calm",
        },
    ]

    for entry in entries:
        append_entry(**entry)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_root)
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
