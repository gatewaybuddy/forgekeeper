import os
import os
import shutil
import subprocess
import importlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def setup_repo(tmp_path, monkeypatch):
    repo_dir = tmp_path / "repo"
    pkg_dir = repo_dir / "forgekeeper"
    pkg_dir.mkdir(parents=True)
    for name in [
        "__init__.py",
        "config.py",
        "logger.py",
        "self_review.py",
        "state_manager.py",
        "git_committer.py",
        "user_interface.py",
    ]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
    tools_dir = repo_dir / "tools"
    tools_dir.mkdir()
    (tools_dir / "smoke_backend.py").write_text("import sys; sys.exit(0)\n", encoding="utf-8")
    fail_check = repo_dir / "fail_check.sh"
    fail_check.write_text("#!/bin/sh\necho foo.py:bad\nexit 1\n", encoding="utf-8")
    fail_check.chmod(0o755)
    subprocess.run(["git", "init"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir, check=True)
    subprocess.run(["git", "commit", "--allow-empty", "-m", "init"], cwd=repo_dir, check=True)
    monkeypatch.syspath_prepend(str(repo_dir))
    monkeypatch.setenv("CHECKS_PY", str(fail_check))
    monkeypatch.setenv("CHECKS_TS", "")
    config = importlib.import_module("forgekeeper.config")
    importlib.reload(config)
    sr = importlib.import_module("forgekeeper.self_review")
    importlib.reload(sr)
    gc = importlib.import_module("forgekeeper.git_committer")
    importlib.reload(gc)
    monkeypatch.setattr(
        gc.self_review,
        "review_staged_changes",
        lambda task_id: {"passed": False, "staged_files": ["foo.py"]},
    )
    return repo_dir, gc


def test_pre_commit_review_blocks_commit(tmp_path, monkeypatch):
    repo, gc = setup_repo(tmp_path, monkeypatch)
    (repo / "foo.py").write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.py"], cwd=repo, check=True)
    monkeypatch.setattr("builtins.input", lambda *_: "n")
    cwd = os.getcwd()
    os.chdir(repo)
    try:
        result = gc.commit_and_push_changes("msg", run_checks=False, task_id="T1")
    finally:
        os.chdir(cwd)
    assert not result["passed"]
    assert not result["pre_review"]["passed"]
    head = subprocess.run(
        ["git", "log", "-1", "--pretty=%B"],
        cwd=repo,
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()
    assert head == "init"


def test_pre_commit_review_acknowledged_allows_commit(tmp_path, monkeypatch):
    repo, gc = setup_repo(tmp_path, monkeypatch)
    (repo / "foo.py").write_text("print('hi')\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.py"], cwd=repo, check=True)
    monkeypatch.setattr("builtins.input", lambda *_: "y")
    cwd = os.getcwd()
    os.chdir(repo)
    try:
        result = gc.commit_and_push_changes("msg", run_checks=False, task_id="T2")
    finally:
        os.chdir(cwd)
    assert result["passed"]
