import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper import self_review  # noqa: E402


def test_review_change_set_integration(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(self_review.checks, "_changed_files", lambda: ["foo.py"])
    called = {}

    def fake_run_checks(files, diff_mode):
        called["files"] = files
        called["diff_mode"] = diff_mode
        return {
            "passed": True,
            "tools": {},
            "ts": "",
            "summary": "Change-set review passed: no checks run",
            "highlights": {},
        }

    monkeypatch.setattr(self_review.checks, "run_checks", fake_run_checks)
    captured = {}
    monkeypatch.setattr(self_review.ui, "display_check_results", lambda r: captured.setdefault("report", r))

    report = self_review.review_change_set("task")
    assert called["diff_mode"] == "HEAD"
    assert report["changed_files"] == ["foo.py"]
    log_path = tmp_path / "logs" / "task" / "self-review.json"
    loaded = json.loads(log_path.read_text())
    assert loaded["summary"] == report["summary"]
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
    monkeypatch.setattr(self_review.checks, "run_checks", lambda files, diff_mode: {"passed": True, "tools": {}, "ts": "", "summary": "", "highlights": {}})
    self_review.review_change_set("task")
    assert calls[0][:3] == ["git", "diff", "--name-only"]
