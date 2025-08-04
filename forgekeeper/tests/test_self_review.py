import sys
from pathlib import Path
import subprocess

import pytest

# Ensure package root is importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.self_review import run_self_review


def _fake_run_factory(msg: str):
    def _fake_run(cmd, capture_output, text, check):
        class Result:
            stdout = msg
        return Result()
    return _fake_run


def test_run_self_review_pass(monkeypatch, tmp_path):
    state = {"current_task": "Test Task"}
    monkeypatch.setattr(subprocess, "run", _fake_run_factory("Test Task\n"))
    state_path = tmp_path / "state.json"
    passed = run_self_review(state, state_path=str(state_path))
    assert passed is True
    assert state["last_review"]["passed"] is True
    assert state_path.is_file()


def test_run_self_review_fail(monkeypatch, tmp_path):
    state = {"current_task": "Test Task"}
    monkeypatch.setattr(subprocess, "run", _fake_run_factory("Another commit\n"))
    state_path = tmp_path / "state.json"
    passed = run_self_review(state, state_path=str(state_path))
    assert passed is False
    assert state["last_review"]["passed"] is False
    assert state_path.is_file()
