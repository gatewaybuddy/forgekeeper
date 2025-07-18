import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.agent_registry import AGENT_REGISTRY, register_agent, get_agent, list_agents

def test_register_and_get_agent():
    register_agent('planner', 'Planner', 'Planning Agent', 'path/to/planner.gguf')
    agent = get_agent('planner')
    assert agent is not None
    assert agent['name'] == 'Planner'
    assert agent['active'] is True

def test_list_agents():
    # Should include at least core and coder
    agents = list_agents()
    assert 'core' in agents
    assert 'coder' in agents
