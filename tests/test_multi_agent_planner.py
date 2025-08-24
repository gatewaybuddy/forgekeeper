import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.multi_agent_planner import register_agent, split_for_agents
from goal_manager import HighLevelGoalManager
from forgekeeper.agent.communication import (
    send_direct_message,
    get_direct_messages,
    broadcast_context,
    get_shared_context,
)
import forgekeeper.agent.communication as comm


def test_planner_registers_custom_agent_and_protocol():
    register_agent("researcher", {"investigate", "research"}, protocol="direct")
    tasks = split_for_agents("research the topic and fix code")
    assert tasks[0]["agent"] == "researcher"
    assert tasks[0]["task"] == "research the topic"
    assert tasks[0]["protocol"] == "direct"
    assert tasks[1]["agent"] == "coder"
    assert tasks[1]["protocol"] == "broadcast"
    assert tasks[0]["context"] is tasks[1]["context"]


def test_direct_message_roundtrip():
    send_direct_message("researcher", "coder", "data ready")
    msgs = get_direct_messages("coder")
    assert msgs == [{"from": "researcher", "message": "data ready"}]
    assert get_direct_messages("coder") == []


def test_subtask_distribution_across_agents():
    register_agent("researcher", {"investigate", "research"}, protocol="direct")
    task = "research the dataset and implement the algorithm and review results"
    tasks = split_for_agents(task)
    assert tasks[0]["agent"] == "researcher"
    assert tasks[0]["task"] == "research the dataset"
    assert tasks[0]["protocol"] == "direct"
    assert tasks[1]["agent"] == "coder"
    assert tasks[1]["task"] == "implement the algorithm"
    assert tasks[1]["protocol"] == "broadcast"
    assert tasks[2]["agent"] == "core"
    assert tasks[2]["task"] == "review results"
    assert tasks[2]["protocol"] == "broadcast"


def test_broadcast_context_shared_across_agents():
    comm._SHARED_CONTEXT.clear()
    broadcast_context("researcher", "data ready")
    broadcast_context("coder", "implemented")
    assert get_shared_context() == [
        {"agent": "researcher", "message": "data ready"},
        {"agent": "coder", "message": "implemented"},
    ]


def test_goal_manager_routes_and_handoffs_between_agents():
    register_agent("researcher", {"research"}, protocol="direct")
    comm._SHARED_CONTEXT.clear()
    comm._DIRECT_MESSAGES.clear()
    manager = HighLevelGoalManager(autonomous=False)
    from goal_manager import delegator

    delegator._dispatch_subtasks(
        "research data and fix code", manager.success_history
    )
    msgs_researcher = get_direct_messages("researcher")
    assert msgs_researcher == [{"from": "goal_manager", "message": "research data"}]
    msgs_coder = get_direct_messages("coder")
    assert msgs_coder == [{"from": "researcher", "message": "handoff complete: research data"}]
    assert get_shared_context()[-1] == {"agent": "coder", "message": "fix code"}


def test_planner_includes_memory_context(monkeypatch):
    tasks = split_for_agents("alpha and beta")
    assert "memory_context" in tasks[0]
    assert isinstance(tasks[0]["memory_context"], list)
