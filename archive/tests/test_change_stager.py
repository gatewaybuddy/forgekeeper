import json
import sys
from pathlib import Path

import git
from git import Repo
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.change_stager as cs
import forgekeeper.core.change_stager as core_cs
from forgekeeper.change_stager import diff_and_stage_changes


def init_repo(tmp_path: Path) -> Repo:
    repo = Repo.init(tmp_path)
    file_path = tmp_path / "sample.txt"
    file_path.write_text("original", encoding="utf-8")
    repo.index.add([str(file_path)])
    repo.index.commit("init")
    return repo


def test_diff_and_stage_changes_success(tmp_path):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    result = diff_and_stage_changes(
        original, modified, str(file_path), task_id="t1", run_sandbox=False
    )

    assert file_path.read_text(encoding="utf-8") == modified
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert result == {"files": ["sample.txt"], "outcome": "success"}
    log_path = tmp_path / "logs" / "t1" / "stager.json"
    assert json.loads(log_path.read_text(encoding="utf-8")) == result


def test_diff_and_stage_changes_failure(tmp_path, monkeypatch):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    def boom(self, *args, **kwargs):
        raise Exception("boom")

    monkeypatch.setattr(git.index.base.IndexFile, "add", boom)

    result = diff_and_stage_changes(
        original, modified, str(file_path), task_id="t2", run_sandbox=False
    )

    assert result["outcome"] == "error"
    assert "error" in result
    assert file_path.read_text(encoding="utf-8") == original
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert not staged
    log_path = tmp_path / "logs" / "t2" / "stager.json"
    assert json.loads(log_path.read_text(encoding="utf-8")) == {
        "files": [],
        "outcome": "error",
    }


def test_diff_and_stage_changes_dry_run(tmp_path):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    result = diff_and_stage_changes(
        original, modified, str(file_path), dry_run=True, task_id="t3", run_sandbox=False
    )

    assert result == {"files": ["sample.txt"], "outcome": "dry-run"}
    assert file_path.read_text(encoding="utf-8") == original
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert not staged
    log_path = tmp_path / "logs" / "t3" / "stager.json"
    assert json.loads(log_path.read_text(encoding="utf-8")) == result


def test_diff_and_stage_changes_accumulates(tmp_path):
    repo = Repo.init(tmp_path)
    file_a = tmp_path / "a.txt"
    file_b = tmp_path / "b.txt"
    file_a.write_text("a", encoding="utf-8")
    file_b.write_text("b", encoding="utf-8")
    repo.index.add([str(file_a), str(file_b)])
    repo.index.commit("init")

    diff_and_stage_changes("a", "aa", str(file_a), task_id="t4", run_sandbox=False)
    diff_and_stage_changes("b", "bb", str(file_b), task_id="t4", run_sandbox=False)

    log_path = tmp_path / "logs" / "t4" / "stager.json"
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert sorted(data["files"]) == ["a.txt", "b.txt"]
    assert data["outcome"] == "success"


def test_diff_and_stage_changes_runs_sandbox(tmp_path, monkeypatch):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    called = {}

    def fake_run(files, diff_text=None, task_id="manual", commands=None):
        called["files"] = list(files)
        called["diff_text"] = diff_text
        called["task_id"] = task_id
        return {"passed": True, "results": [], "artifacts_path": ""}

    monkeypatch.setattr(cs, "run_sandbox_checks", fake_run)
    monkeypatch.setattr(core_cs, "run_sandbox_checks", fake_run)
    result = cs.diff_and_stage_changes(
        original, modified, str(file_path), task_id="t5", run_sandbox=True
    )
    assert result == {"files": ["sample.txt"], "outcome": "success"}
    assert called["files"] == ["sample.txt"]
    assert called["task_id"] == "t5"
    assert called["diff_text"]
