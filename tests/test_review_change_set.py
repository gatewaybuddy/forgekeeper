import sys
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper import self_review  # noqa: E402


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
    monkeypatch.setattr(self_review, "_changed_files", lambda: ["foo.py"])
    captured = {}

    def _fake_display(report):
        captured["report"] = report

    monkeypatch.setattr(self_review.ui, "display_check_results", _fake_display)

    report = self_review.review_change_set("task")
    assert report["passed"] is True
    assert "Change-set review passed" in report["summary"]
    report_file = tmp_path / "logs" / "task" / "self-review.json"
    loaded = json.loads(report_file.read_text())
    assert loaded["passed"] is True
    assert loaded["tools"]["ruff ."]["passed"] is True
    assert captured["report"]["summary"] == report["summary"]


def test_review_change_set_fail(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    mapping = {
        "ruff": (0, "ok"),
        "mypy": (1, "foo.py:1: error"),
        "pytest": (0, "ok"),
        "git": (0, "--- a/foo.py\n+++ b/foo.py\n@@\n+bad\n"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    monkeypatch.setattr(self_review, "_changed_files", lambda: ["foo.py"])

    captured = {}

    def _fake_display(report):
        captured["report"] = report

    monkeypatch.setattr(self_review.ui, "display_check_results", _fake_display)

    report = self_review.review_change_set("task")
    assert report["passed"] is False
    assert "Change-set review failed" in report["summary"]
    report_file = tmp_path / "logs" / "task" / "self-review.json"
    loaded = json.loads(report_file.read_text())
    assert loaded["tools"]["mypy ."]["passed"] is False
    assert "foo.py" in report["highlights"]
    assert "foo.py:1: error" in report["highlights"]["foo.py"]["messages"]
    assert captured["report"]["summary"] == report["summary"]


def test_review_change_set_detects_changed(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    calls = []

    def _fake_run(cmd, capture_output, text, check=False):
        calls.append(cmd)
        if cmd[:3] == ["git", "diff", "--name-only"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="foo.py\n", stderr="")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", _fake_run)
    self_review.review_change_set("task")
    assert calls[0][:3] == ["git", "diff", "--name-only"]
