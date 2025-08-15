import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def init_repo(tmp_path: Path, monkeypatch, checks_py: str, checks_ts: str):
    repo_dir = tmp_path / "repo"
    pkg_dir = repo_dir / "forgekeeper"
    pkg_dir.mkdir(parents=True)
    # copy minimal package files
    for name in [
        "__init__.py",
        "config.py",
        "logger.py",
        "git_committer.py",
        "outbox.py",

        "diff_validator.py",
    ]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
    mem_dir = pkg_dir / "memory"
    mem_dir.mkdir()
    for name in ["__init__.py", "episodic.py", "embeddings.py"]:
        shutil.copy(ROOT / "forgekeeper" / "memory" / name, mem_dir / name)
    # minimal self_review stub
    (pkg_dir / "self_review.py").write_text(
        "import subprocess\n"
        "def review_staged_changes(task_id):\n"
        "    result = subprocess.run(['git','diff','--name-only','--cached'], capture_output=True, text=True, check=True)\n"
        "    files = [f for f in result.stdout.splitlines() if f]\n"
        "    return {'passed': True, 'staged_files': files}\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir, check=True)
    subprocess.run(["git", "commit", "--allow-empty", "-m", "init"], cwd=repo_dir, check=True)
    monkeypatch.syspath_prepend(str(repo_dir))
    monkeypatch.setenv("CHECKS_PY", checks_py)
    monkeypatch.setenv("CHECKS_TS", checks_ts)

    import importlib

    for mod in list(sys.modules):
        if mod.startswith("forgekeeper"):
            sys.modules.pop(mod)

    config = importlib.import_module("forgekeeper.config")
    episodic = importlib.import_module("forgekeeper.memory.episodic")
    gc = importlib.import_module("forgekeeper.git_committer")
    importlib.reload(config)
    importlib.reload(episodic)
    monkeypatch.setattr(
        episodic,
        "MEMORY_FILE",
        repo_dir / ".forgekeeper/memory/episodic.jsonl",
    )
    importlib.reload(gc)
    monkeypatch.chdir(repo_dir)
    return repo_dir, gc


def test_python_checks_selected(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    f = repo / "foo.py"
    f.write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t1", autonomous=True)
    log_path = repo / "logs" / "t1" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert [r["command"] for r in data] == ["echo PY"]


def test_ts_checks_selected(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    (repo / "frontend").mkdir()
    f = repo / "frontend" / "app.ts"
    f.write_text("console.log('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t2", autonomous=True)
    log_path = repo / "logs" / "t2" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert [r["command"] for r in data] == ["echo TS"]


def test_py_and_ts_checks_selected(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
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


def test_no_checks_when_no_supported_files(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    readme = repo / "README.md"
    readme.write_text("hi\n", encoding="utf-8")
    subprocess.run(["git", "add", str(readme)], cwd=repo, check=True)
    gc.commit_and_push_changes("msg", task_id="t_none", autonomous=True)
    log_path = repo / "logs" / "t_none" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert data == []


def test_failing_checks_abort_commit(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "bash -c 'exit 1'", "echo TS")
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


def test_changelog_returned(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    f = repo / "bar.py"
    f.write_text("print('hello')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("msg", task_id="t4", autonomous=True)
    assert "changelog" in result and "bar.py" in result["changelog"]


def test_outcome_logged_to_memory(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
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


def test_diff_validation_blocks_commit(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    a = repo / "a.py"
    b = repo / "b.py"
    a.write_text("def foo():\n    return 1\n", encoding="utf-8")
    b.write_text("from a import foo\nfoo()\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "init files"], cwd=repo, check=True)

    a.write_text("def bar():\n    return 1\n", encoding="utf-8")
    b.write_text("from a import foo\nfoo()\n# tweak\n", encoding="utf-8")
    subprocess.run(["git", "add", str(a), str(b)], cwd=repo, check=True)
    head_before = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    result = gc.commit_and_push_changes("msg", task_id="t6", autonomous=True)
    head_after = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    assert not result["passed"]
    assert result.get("aborted")
    assert head_before == head_after
    assert not result["diff_validation"]["passed"]


def test_diff_validation_allows_consistent_changes(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
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


def test_auto_push_logs_changelog_and_rationale(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    remote_dir = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", str(remote_dir)], check=True)
    subprocess.run(["git", "remote", "add", "origin", str(remote_dir)], cwd=repo, check=True)
    f = repo / "push.py"
    f.write_text("print('push')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("auto push", task_id="t_push", autonomous=True)
    local_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    remote_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=remote_dir).decode().strip()
    assert local_head == remote_head
    mem_file = repo / ".forgekeeper/memory/episodic.jsonl"
    entries = [json.loads(line) for line in mem_file.read_text(encoding="utf-8").splitlines() if line]
    assert entries[-1]["status"] == "pushed"
    assert "Rationale" in entries[-1]["summary"]
    assert "push.py" in entries[-1]["summary"]
    assert result["pushed"]
