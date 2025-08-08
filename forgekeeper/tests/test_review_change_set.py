import sys
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.self_review import review_change_set  # noqa: E402


def _fake_run_factory(mapping):
    def _fake_run(cmd, capture_output, text, check=False):
        prog = cmd[0]
        if prog not in mapping:
            raise AssertionError(f"Unexpected command: {cmd}")
        rc, out = mapping[prog]
        return subprocess.CompletedProcess(cmd, rc, stdout=out, stderr="")
    return _fake_run


def test_review_change_set_pass(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    mapping = {
        "ruff": (0, "ruff ok"),
        "mypy": (0, "mypy ok"),
        "pytest": (0, "pytest ok"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    passed = review_change_set("task", changed_files=["foo.py"])
    assert passed is True
    report_file = next((tmp_path / "logs").glob("self-review-*.json"))
    report = json.loads(report_file.read_text())
    assert report["passed"] is True
    assert report["results"]["ruff"]["passed"] is True


def test_review_change_set_fail(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    mapping = {
        "ruff": (0, "ok"),
        "mypy": (1, "error"),
        "pytest": (0, "ok"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    passed = review_change_set("task", changed_files=["foo.py"])
    assert passed is False
    report_file = next((tmp_path / "logs").glob("self-review-*.json"))
    report = json.loads(report_file.read_text())
    assert report["results"]["mypy"]["passed"] is False


def test_review_change_set_detects_changed(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    calls = []

    def _fake_run(cmd, capture_output, text, check=False):
        calls.append(cmd)
        if cmd[:3] == ["git", "diff", "--name-only"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="foo.py\n", stderr="")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", _fake_run)
    review_change_set("task")
    assert calls[0][:3] == ["git", "diff", "--name-only"]
