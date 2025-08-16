import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.multi_agent_planner import register_agent, split_for_agents
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
    assert tasks == [
        {"agent": "researcher", "task": "research the dataset", "protocol": "direct"},
        {"agent": "coder", "task": "implement the algorithm", "protocol": "broadcast"},
        {"agent": "core", "task": "review results", "protocol": "broadcast"},
    ]


def test_broadcast_context_shared_across_agents():
    comm._SHARED_CONTEXT.clear()
    broadcast_context("researcher", "data ready")
    broadcast_context("coder", "implemented")
    assert get_shared_context() == [
        {"agent": "researcher", "message": "data ready"},
        {"agent": "coder", "message": "implemented"},
    ]
