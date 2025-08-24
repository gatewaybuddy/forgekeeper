import json
import subprocess


# Tests for scenarios where commits are aborted or validated

def test_failing_checks_abort_commit(init_repo):
    repo, gc = init_repo(checks_py="bash -c 'exit 1'", checks_ts="echo TS")
    f = repo / "foo.py"
    f.write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    head_before = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    result = gc.commit_and_push_changes("msg", task_id="t3", autonomous=True)
    head_after = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    assert not result["passed"]
    assert result.get("aborted")
    assert head_before == head_after
    log_path = repo / "logs" / "t3" / "commit-checks.json"
    assert log_path.exists()
    mem_file = repo / ".forgekeeper/memory/episodic.jsonl"
    entry = json.loads(mem_file.read_text(encoding="utf-8").splitlines()[-1])
    assert entry["status"] == "checks-failed"


def test_diff_validation_blocks_commit(init_repo):
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


def test_diff_validation_allows_consistent_changes(init_repo):
    repo, gc = init_repo()
    a = repo / "a.py"
    b = repo / "b.py"
    a.write_text("def foo():\n    return 1\n", encoding="utf-8")
    b.write_text("from a import foo\nfoo()\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "init files"], cwd=repo, check=True)

    a.write_text("def bar():\n    return 1\n", encoding="utf-8")
    b.write_text("from a import bar\nbar()\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("msg", task_id="t7", autonomous=True)
    assert result["passed"]
    assert result["diff_validation"]["passed"]
