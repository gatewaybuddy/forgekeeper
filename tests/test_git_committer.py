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
    for name in ["__init__.py", "config.py", "logger.py", "git_committer.py"]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
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
    gc = importlib.import_module("forgekeeper.git_committer")
    importlib.reload(config)
    importlib.reload(gc)
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


def test_failing_checks_abort_commit(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "bash -c 'exit 1'", "echo TS")
    f = repo / "foo.py"
    f.write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    head_before = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    result = gc.commit_and_push_changes("msg", task_id="t3", autonomous=True)
    head_after = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    assert not result["passed"]
    assert head_before == head_after
    log_path = repo / "logs" / "t3" / "commit-checks.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert data[0]["returncode"] != 0


def test_changelog_returned(tmp_path, monkeypatch):
    repo, gc = init_repo(tmp_path, monkeypatch, "echo PY", "echo TS")
    f = repo / "bar.py"
    f.write_text("print('hello')\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
    result = gc.commit_and_push_changes("msg", task_id="t4", autonomous=True)
    assert "changelog" in result and "bar.py" in result["changelog"]
