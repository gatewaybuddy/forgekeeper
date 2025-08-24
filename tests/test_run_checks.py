import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper import self_review  # noqa: E402


def _fake_run_tool_factory(mapping):
    def _fake_run_tool(cmd):
        key = tuple(cmd)
        if key not in mapping:
            raise AssertionError(f"Unexpected command: {cmd}")
        return mapping[key]

    return _fake_run_tool


def test_run_checks_pass(monkeypatch):
    monkeypatch.setattr(self_review.core, "CHECKS_PY", ["py"])
    monkeypatch.setattr(self_review.core, "CHECKS_TS", ["ts"])
    mapping = {
        ("py",): (True, "py ok"),
        ("ts",): (True, "ts ok"),
    }
    monkeypatch.setattr(self_review.core, "_run_tool", _fake_run_tool_factory(mapping))
    report = self_review.core.run_checks(["foo.py", "bar.ts"], "HEAD")
    assert report["passed"] is True
    assert "Change-set review passed" in report["summary"]


def test_run_checks_fail(monkeypatch):
    monkeypatch.setattr(self_review.core, "CHECKS_PY", ["py"])
    monkeypatch.setattr(self_review.core, "CHECKS_TS", [])
    mapping = {
        ("py",): (False, "foo.py:1: error"),
        ("git", "diff", "HEAD~1..HEAD", "--", "foo.py"): (True, "diff"),
    }
    monkeypatch.setattr(self_review.core, "_run_tool", _fake_run_tool_factory(mapping))
    report = self_review.core.run_checks(["foo.py"], "HEAD")
    assert report["passed"] is False
    assert "foo.py" in report["highlights"]
    assert "foo.py:1: error" in report["highlights"]["foo.py"]["messages"]

