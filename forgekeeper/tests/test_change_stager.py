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

    diff_and_stage_changes(original, modified, str(file_path))

    assert file_path.read_text(encoding="utf-8") == modified
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert "sample.txt" in staged
    logs = list((tmp_path / "logs").glob("stager-*.json"))
    assert len(logs) == 1
    assert json.loads(logs[0].read_text(encoding="utf-8")) == staged


def test_diff_and_stage_changes_failure(tmp_path, monkeypatch):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    def boom(self, *args, **kwargs):
        raise Exception("boom")

    monkeypatch.setattr(git.index.base.IndexFile, "add", boom)

    with pytest.raises(Exception):
        diff_and_stage_changes(original, modified, str(file_path))

    assert file_path.read_text(encoding="utf-8") == original
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert "sample.txt" not in staged
    assert not list((tmp_path / "logs").glob("stager-*.json"))


def test_diff_and_stage_changes_dry_run(tmp_path):
    repo = init_repo(tmp_path)
    file_path = tmp_path / "sample.txt"
    original = file_path.read_text(encoding="utf-8")
    modified = "modified"

    diff_and_stage_changes(original, modified, str(file_path), dry_run=True)

    assert file_path.read_text(encoding="utf-8") == original
    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert "sample.txt" not in staged
    assert not list((tmp_path / "logs").glob("stager-*.json"))
