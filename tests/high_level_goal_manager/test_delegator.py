import goal_manager.manager as hgm
import goal_manager.delegator as delegator


def test_label_based_agent_selection(tmp_path, monkeypatch):
    messages = []

    class DummyPipeline:
        def next_task(self):
            return {"title": "write docs", "labels": ["agent:coder"]}

    monkeypatch.setattr(hgm, "TaskPipeline", lambda: DummyPipeline())
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

    mgr = hgm.HighLevelGoalManager(autonomous=True)
    mgr.run()

    assert (
        "goal_manager",
        "delegated 'write docs' to coder (reason: label)",
    ) in messages


def test_success_history_agent_selection(monkeypatch):
    messages = []

    class DummyPipeline:
        def next_task(self):
            return None

    monkeypatch.setattr(hgm, "TaskPipeline", lambda: DummyPipeline())
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

    mgr = hgm.HighLevelGoalManager(autonomous=True)
    mgr.success_history["coder"] = 3
    agent, _ = delegator._dispatch_subtasks(
        "second step", mgr.success_history
    )

    assert agent == "coder"
    assert messages[0] == (
        "goal_manager",
        "delegated 'second step' to coder (reason: history)",
    )
