import json
import subprocess


# Tests for selection of check commands based on staged files

def test_python_checks_selected(init_repo):
    repo, gc = init_repo(checks_py="echo PY", checks_ts="echo TS")
    f = repo / "foo.py"
    f.write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t1", autonomous=True)
    log_path = repo / "logs" / "t1" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert [r["command"] for r in data] == ["echo PY"]


def test_ts_checks_selected(init_repo):
    repo, gc = init_repo(checks_py="echo PY", checks_ts="echo TS")
    (repo / "frontend").mkdir()
    f = repo / "frontend" / "app.ts"
    f.write_text("console.log('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t2", autonomous=True)
    log_path = repo / "logs" / "t2" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert [r["command"] for r in data] == ["echo TS"]


def test_py_and_ts_checks_selected(init_repo):
    repo, gc = init_repo(checks_py="echo PY", checks_ts="echo TS")
    (repo / "frontend").mkdir()
    py_file = repo / "foo.py"
    ts_file = repo / "frontend" / "app.ts"
    py_file.write_text("print('hi')\n", encoding="utf-8")
    ts_file.write_text("console.log('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(py_file), str(ts_file)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t_py_ts", autonomous=True)
    log_path = repo / "logs" / "t_py_ts" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert [r["command"] for r in data] == ["echo PY", "echo TS"]


def test_no_checks_when_no_supported_files(init_repo):
    repo, gc = init_repo(checks_py="echo PY", checks_ts="echo TS")
    readme = repo / "README.md"
    readme.write_text("hi\n", encoding="utf-8")
    subprocess.run(["git", "add", str(readme)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t_none", autonomous=True)
    log_path = repo / "logs" / "t_none" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert data == []


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
