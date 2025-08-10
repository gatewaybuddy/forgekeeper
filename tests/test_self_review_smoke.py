import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def init_repo(tmp_path: Path, monkeypatch, smoke_exit: int):
    repo_dir = tmp_path / "repo"
    pkg_dir = repo_dir / "forgekeeper"
    pkg_dir.mkdir(parents=True)
    for name in ["__init__.py", "config.py", "logger.py", "self_review.py", "state_manager.py"]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
    tools_dir = repo_dir / "tools"
    tools_dir.mkdir()
    smoke = tools_dir / "smoke_backend.py"
    smoke.write_text(
        f"""#!/usr/bin/env python3\nimport sys\nsys.exit({smoke_exit})\n""",
        encoding="utf-8",
    )
    subprocess.run(["git", "init"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir, check=True)
    subprocess.run(["git", "commit", "--allow-empty", "-m", "init"], cwd=repo_dir, check=True)
    monkeypatch.syspath_prepend(str(repo_dir))
    monkeypatch.setenv("CHECKS_PY", "echo PY")
    monkeypatch.setenv("CHECKS_TS", "echo TS")
    import importlib
    config = importlib.import_module("forgekeeper.config")
    importlib.reload(config)
    sr = importlib.import_module("forgekeeper.self_review")
    importlib.reload(sr)
    return repo_dir, sr


def commit_backend_change(repo_dir: Path, fname: str = "foo.ts"):
    backend = repo_dir / "backend"
    backend.mkdir()
    f = backend / fname
    f.write_text("console.log('hi');\n", encoding="utf-8")
    subprocess.run(["git", "add", str(f)], cwd=repo_dir, check=True)
    subprocess.run(["git", "commit", "-m", "add backend file"], cwd=repo_dir, check=True)


def test_smoke_test_pass(tmp_path, monkeypatch):
    repo, sr = init_repo(tmp_path, monkeypatch, smoke_exit=0)
    commit_backend_change(repo)
    cwd = os.getcwd()
    os.chdir(repo)
    try:
        report = sr.review_change_set("t1")
    finally:
        os.chdir(cwd)
    assert report["tools"]["smoke_backend"]["passed"]
    assert report["passed"]


def test_smoke_test_fail(tmp_path, monkeypatch):
    repo, sr = init_repo(tmp_path, monkeypatch, smoke_exit=1)
    commit_backend_change(repo, fname="bar.ts")
    cwd = os.getcwd()
    os.chdir(repo)
    try:
        report = sr.review_change_set("t2")
    finally:
        os.chdir(cwd)
    assert "smoke_backend" in report["tools"]
    assert not report["tools"]["smoke_backend"]["passed"]
    assert not report["passed"]
