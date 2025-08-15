import sys
import subprocess
from pathlib import Path

import pytest

# Ensure package root is importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.self_review import run_self_review


def _fake_run_factory(mapping):
    def _fake_run(cmd, capture_output=False, text=False, check=False):
        key = " ".join(cmd)
        code, out = mapping.get(key, (0, ""))
        if check and code != 0:
            raise subprocess.CalledProcessError(code, cmd, out)
        class Result:
            def __init__(self):
                self.returncode = code
                self.stdout = out
                self.stderr = ""
        return Result()
    return _fake_run


def test_run_self_review_pass(monkeypatch, tmp_path):
    state = {"current_task": {"description": "demo", "task_id": "T1"}}
    mapping = {
        "git log -n 1 --pretty=%B": (0, "msg"),
        "git diff HEAD~1..HEAD": (0, "diff"),
        f"{sys.executable} -m pytest -k T1 -q": (0, "collected 1 item"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    ask = lambda prompt: "PASS"
    state_path = tmp_path / "state.json"
    passed = run_self_review(state, state_path=str(state_path), ask_fn=ask)
    assert passed is True
    assert state["last_review"]["llm_passed"] is True
    assert state["last_review"]["tests_passed"] is True
    assert state_path.is_file()


def test_run_self_review_fails_when_tests_missing(monkeypatch, tmp_path):
    state = {"current_task": {"description": "demo", "task_id": "T2"}}
    mapping = {
        "git log -n 1 --pretty=%B": (0, "msg"),
        "git diff HEAD~1..HEAD": (0, "diff"),
        f"{sys.executable} -m pytest -k T2 -q": (5, "no tests"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    ask = lambda prompt: "PASS"
    state_path = tmp_path / "state.json"
    passed = run_self_review(state, state_path=str(state_path), ask_fn=ask)
    assert passed is False
    assert state["last_review"]["tests_passed"] is False


def test_run_self_review_fails_llm(monkeypatch, tmp_path):
    state = {"current_task": {"description": "demo", "task_id": "T3"}}
    mapping = {
        "git log -n 1 --pretty=%B": (0, "msg"),
        "git diff HEAD~1..HEAD": (0, "diff"),
        f"{sys.executable} -m pytest -k T3 -q": (0, "collected 1 item"),
    }
    monkeypatch.setattr(subprocess, "run", _fake_run_factory(mapping))
    ask = lambda prompt: "FAIL"
    passed = run_self_review(state, state_path=str(tmp_path / "state.json"), ask_fn=ask)
    assert passed is False
    assert state["last_review"]["llm_passed"] is False
