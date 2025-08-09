import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import forgekeeper.goal_manager as gm


def test_goal_lifecycle(tmp_path, monkeypatch):
    goals_file = tmp_path / "goals.json"
    log_file = tmp_path / "goals.log"
    monkeypatch.setattr(gm, "GOALS_FILE", goals_file)
    monkeypatch.setattr(gm, "GOAL_LOG_FILE", log_file)

    assert gm.load_goals() == []

    goal_id = gm.add_goal("Build a castle")
    goals = gm.load_goals()
    assert goals[0]["id"] == goal_id
    assert goals[0]["description"] == "Build a castle"
    assert goals[0]["active"] is True

    assert gm.get_active_goals() == ["Build a castle"]

    assert gm.deactivate_goal(goal_id) is True
    assert gm.get_active_goals() == []

    gm.log_goal_progress(goal_id, "started")
    assert log_file.is_file()
    with open(log_file, "r", encoding="utf-8") as f:
        entry = json.loads(f.readline())
    assert entry["goal_id"] == goal_id
    assert entry["note"] == "started"


def test_deactivate_missing(tmp_path, monkeypatch):
    goals_file = tmp_path / "goals.json"
    monkeypatch.setattr(gm, "GOALS_FILE", goals_file)

    assert gm.deactivate_goal("missing") is False
