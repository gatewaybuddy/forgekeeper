import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.multi_agent_planner import register_agent, split_for_agents
from forgekeeper.agent.communication import send_direct_message, get_direct_messages


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
