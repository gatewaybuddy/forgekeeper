import json
import sys
from pathlib import Path

import git
from git import Repo
import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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

    result = diff_and_stage_changes(original, modified, str(file_path), task_id="t1")

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

    result = diff_and_stage_changes(original, modified, str(file_path), task_id="t2")

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
        original, modified, str(file_path), dry_run=True, task_id="t3"
    )

    assert result == {"files": ["sample.txt"], "outcome": "dry-run"}
    assert file_path.read_text(encoding="utf-8") == original
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert not staged
    log_path = tmp_path / "logs" / "t3" / "stager.json"
    assert json.loads(log_path.read_text(encoding="utf-8")) == result
