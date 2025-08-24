import json
import subprocess


# Tests for diff validation logic

def test_diff_validation_prevents_commit(init_repo):
    repo, gc = init_repo()
    a = repo / "a.py"
    b = repo / "b.py"
    a.write_text("def foo():\n    pass\n", encoding="utf-8")
    b.write_text("from a import foo\nfoo()\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "add files"], cwd=repo, check=True)
    a.write_text("", encoding="utf-8")
    b.write_text("from a import foo\nfoo()\n# change\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("msg", task_id="tdiff", autonomous=True)
    assert not result["passed"]
    assert result.get("aborted")
    assert not result["diff_validation"]["passed"]
    mem_file = repo / ".forgekeeper/memory/episodic.jsonl"
    entry = json.loads(mem_file.read_text(encoding="utf-8").splitlines()[-1])
    assert entry["status"] == "diff-validation-failed"
