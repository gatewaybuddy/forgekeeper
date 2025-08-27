import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skip(reason="self-review pipeline not available")


def init_repo(tmp_path: Path, monkeypatch, smoke_exit: int):
    repo_dir = tmp_path / "repo"
    pkg_dir = repo_dir / "forgekeeper"
    pkg_dir.mkdir(parents=True)
    for name in ["__init__.py", "config.py", "logger.py", "state_manager.py"]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
    shutil.copytree(ROOT / "forgekeeper" / "self_review", pkg_dir / "self_review")
    (pkg_dir / "user_interface.py").write_text(
        "def display_check_results(report):\n    return None\n",
        encoding="utf-8",
    )
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
    importlib.reload(sr.checks)
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


def _stub_pipeline(monkeypatch, tmp_path, commit_result, review_result, self_result=True):
    monkeypatch.syspath_prepend(str(ROOT))
    sys.modules.pop("forgekeeper", None)
    sys.modules.pop("forgekeeper.pipeline", None)
    from forgekeeper import pipeline
    import forgekeeper.pipeline.update as update_mod

    (tmp_path / "forgekeeper").mkdir(exist_ok=True)
    monkeypatch.setattr(update_mod, "summarize_repository", lambda: {})
    monkeypatch.setattr(update_mod, "analyze_repo_for_task", lambda *_: [])
    monkeypatch.setattr(update_mod, "generate_code_edit", lambda *a, **k: "")
    monkeypatch.setattr(update_mod, "apply_unified_diff", lambda *_: [])
    monkeypatch.setattr(update_mod, "diff_and_stage_changes", lambda *a, **k: None)
    monkeypatch.setattr(
        update_mod,
        "commit_and_push_changes",
        lambda *a, **k: {"passed": commit_result},
    )
    monkeypatch.setattr(
        update_mod.self_review,
        "review_change_set",
        lambda *_: {"passed": review_result},
    )
    monkeypatch.setattr(update_mod, "run_self_review", lambda *_: self_result)
    return pipeline


def test_pipeline_aborts_on_failed_commit(tmp_path, monkeypatch):
    pipeline = _stub_pipeline(monkeypatch, tmp_path, commit_result=False, review_result=True)
    state = {"current_task": {"task_id": "T1"}}
    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        assert not pipeline.run_update_pipeline("task", state)
    finally:
        os.chdir(cwd)


def test_pipeline_propagates_review_status(tmp_path, monkeypatch):
    pipeline = _stub_pipeline(monkeypatch, tmp_path, commit_result=True, review_result=False)
    state = {"current_task": {"task_id": "T2"}}
    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        assert not pipeline.run_update_pipeline("task", state)
    finally:
        os.chdir(cwd)
    pipeline = _stub_pipeline(monkeypatch, tmp_path, commit_result=True, review_result=True)
    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        assert pipeline.run_update_pipeline("task", state)
    finally:
        os.chdir(cwd)
