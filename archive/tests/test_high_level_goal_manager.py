from pathlib import Path
import json
import sys
import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))


def test_autonomous_manager_triggers_pipeline(tmp_path, monkeypatch):
    import goal_manager.manager as hgm

    class DummyTask:
        description = "demo"

    class DummyPipeline:
        def next_task(self):
            return DummyTask()

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    called = []

    def fake_main():
        called.append(True)

    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", tmp_path / "goals.json")

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipeline()
    )
    assert mgr.run() is True
    assert called == [True], "Pipeline main not invoked once"


def test_manager_no_autonomy(tmp_path, monkeypatch):
    import goal_manager.manager as hgm

    class DummyPipeline:
        def next_task(self):
            raise AssertionError("should not be called")

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", tmp_path / "goals.json")
    mgr = hgm.HighLevelGoalManager(
        autonomous=False, pipeline_factory=lambda: DummyPipeline()
    )
    assert mgr.run() is False


def test_complex_goal_breakdown(tmp_path, monkeypatch):
    import goal_manager.manager as hgm

    class DummyTask:
        description = "write unit tests and update docs"

    class DummyPipeline:
        def next_task(self):
            return DummyTask()

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    calls = []

    def fake_main():
        calls.append(True)

    goals_path = tmp_path / "goals.json"
    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", goals_path)

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipeline()
    )
    assert mgr.run() is True
    assert len(calls) == 2

    data = json.loads(goals_path.read_text())
    assert len(data) == 3
    parent = next(g for g in data if g.get("description") == DummyTask.description)
    subtasks = [g for g in data if g.get("parent_id") == parent["id"]]
    assert [g.get("priority") for g in subtasks] == pytest.approx([1.0, 0.5])
    assert subtasks[0].get("depends_on", []) == []
    assert subtasks[1].get("depends_on") == [subtasks[0]["id"]]
    assert parent.get("subtasks") == [g["id"] for g in subtasks]


def test_label_based_agent_selection(tmp_path, monkeypatch):
    import goal_manager.manager as hgm
    import goal_manager.delegator as delegator

    messages = []

    class DummyPipeline:
        def next_task(self):
            return {"title": "write docs", "labels": ["agent:coder"]}

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(
        delegator,
        "split_for_agents",
        lambda d: [{"agent": "core", "task": d, "protocol": "broadcast"}],
    )
    monkeypatch.setattr(hgm.pipeline_main, "main", lambda: None)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", tmp_path / "goals.json")

    def fake_bc(agent, message):
        messages.append((agent, message))

    monkeypatch.setattr(delegator, "broadcast_context", fake_bc)
    monkeypatch.setattr(delegator, "send_direct_message", lambda *a, **k: None)

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipeline()
    )
    mgr.run()

    assert (
        "goal_manager",
        "delegated 'write docs' to coder (reason: label)",
    ) in messages


def test_success_history_agent_selection(monkeypatch):
    import goal_manager.manager as hgm
    import goal_manager.delegator as delegator

    messages = []

    class DummyPipeline:
        def next_task(self):
            return None

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(
        delegator,
        "split_for_agents",
        lambda d: [{"agent": "core", "task": d, "protocol": "broadcast"}],
    )
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)

    def fake_bc(agent, message):
        messages.append((agent, message))

    monkeypatch.setattr(delegator, "broadcast_context", fake_bc)
    monkeypatch.setattr(delegator, "send_direct_message", lambda *a, **k: None)

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipeline()
    )
    mgr.success_history["coder"] = 3
    agent, _ = delegator._dispatch_subtasks(
        "second step", mgr.success_history
    )

    assert agent == "coder"
    assert messages[0] == (
        "goal_manager",
        "delegated 'second step' to coder (reason: history)",
    )

