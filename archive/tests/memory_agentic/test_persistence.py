from pathlib import Path

from forgekeeper.memory.agentic.persistence import (
    dump_agent_spec,
    load_agent_specs,
    render_system_prompt,
)
from forgekeeper.memory.agentic.builtin.teh_typo import TehTypoAgent


def test_render_system_prompt(tmp_path: Path):
    agent = TehTypoAgent()
    dump_agent_spec(agent, tmp_path / "agent.yaml")
    specs = load_agent_specs(tmp_path)
    assert specs[0]["id"] == agent.id
    prompt = render_system_prompt(specs[0])
    assert agent.id in prompt and "Trigger" in prompt
