import json
import time
import importlib

import forgekeeper.config as config
import goal_manager.manager as hgm


def test_periodic_run_expands_and_executes(tmp_path, monkeypatch):
    """Complex goals are split into subtasks and executed periodically."""

    calls = []

    class ComplexTask:
        description = "write unit tests and update docs"

    class DummyPipeline:
        def __init__(self):
            self.sent = False

        def next_task(self):
            if not self.sent:
                self.sent = True
                return ComplexTask()
            return None

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    def fake_main():
        calls.append(True)

    # Enable autonomy and shorten the run interval before reloading the module
    monkeypatch.setattr(config, "AUTONOMY_MODE", True)
    monkeypatch.setattr(config, "GOAL_RUN_INTERVAL", 0.01, raising=False)
    hgm_reload = importlib.reload(hgm)

    goals_path = tmp_path / "goals.json"
    monkeypatch.setattr(hgm_reload.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm_reload, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm_reload.goal_manager, "GOALS_FILE", goals_path)

    mgr = hgm_reload.HighLevelGoalManager(
        pipeline_factory=lambda: DummyPipeline()
    )

    assert mgr.run() is True
    assert len(calls) == 2, "Pipeline main not invoked for each subtask"

    data = json.loads(goals_path.read_text())
    parent = next(g for g in data if g.get("description") == ComplexTask.description)
    subtasks = [g for g in data if g.get("parent_id") == parent["id"]]
    assert len(subtasks) == 2

    shutdown = getattr(mgr, "shutdown", None)
    if callable(shutdown):
        shutdown()


def test_periodic_run_executes_single_task(tmp_path, monkeypatch):
    """Simple goals execute without manual triggers."""

    calls = []

    class SimpleTask:
        description = "write docs"

    class DummyPipeline:
        def __init__(self):
            self.sent = False

        def next_task(self):
            if not self.sent:
                self.sent = True
                return SimpleTask()
            return None

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    def fake_main():
        calls.append(True)

    monkeypatch.setattr(config, "AUTONOMY_MODE", True)
    monkeypatch.setattr(config, "GOAL_RUN_INTERVAL", 0.01, raising=False)
    hgm_reload = importlib.reload(hgm)

    goals_path = tmp_path / "goals.json"
    monkeypatch.setattr(hgm_reload.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm_reload, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm_reload.goal_manager, "GOALS_FILE", goals_path)

    mgr = hgm_reload.HighLevelGoalManager(
        pipeline_factory=lambda: DummyPipeline()
    )

    assert mgr.run() is True
    assert calls == [True]
    data = json.loads(goals_path.read_text())
    assert any(g.get("description") == SimpleTask.description for g in data)

    shutdown = getattr(mgr, "shutdown", None)
    if callable(shutdown):
        shutdown()
