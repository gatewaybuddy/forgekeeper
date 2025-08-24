import json
import json
import json
import json
import subprocess

# Tests for memory logging and changelog creation

def test_changelog_returned(init_repo):
    repo, gc = init_repo()
    f = repo / "bar.py"
    f.write_text("print('hello')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("msg", task_id="t4", autonomous=True)
    assert "changelog" in result and "bar.py" in result["changelog"]


def test_outcome_logged_to_memory(init_repo):
    repo, gc = init_repo()
    f = repo / "baz.py"
    f.write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t5", autonomous=True)
    mem_file = repo / ".forgekeeper/memory/episodic.jsonl"
    entries = [json.loads(line) for line in mem_file.read_text(encoding="utf-8").splitlines() if line]
    statuses = [e["status"] for e in entries]
    assert "committed" in statuses
    committed_entry = entries[statuses.index("committed")]
    assert committed_entry["task_id"] == "t5"
    assert committed_entry["changed_files"] == ["baz.py"]


def test_push_records_rationale_and_changelog(monkeypatch, init_repo):
    monkeypatch.setenv("AUTO_PUSH", "true")
    monkeypatch.setattr("builtins.input", lambda *a, **k: "y")
    repo, gc = init_repo()
    f = repo / "qux.py"
    f.write_text("print('ok')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    result = gc.commit_and_push_changes(
        "msg",
        task_id="t6",
        rationale="why push",
    )
    mem_file = repo / ".forgekeeper/memory/episodic.jsonl"
    entries = [json.loads(line) for line in mem_file.read_text(encoding="utf-8").splitlines() if line]
    push_entry = [e for e in entries if e["status"] in {"pushed", "push-failed"}][-1]
    assert push_entry["rationale"] == "why push"
    assert push_entry["artifacts_paths"] == [result["changelog_path"]]
