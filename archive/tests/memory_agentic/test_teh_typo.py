from forgekeeper.memory.agentic.builtin.teh_typo import TehTypoAgent
from forgekeeper.memory.agentic.orchestrator import MemoryOrchestrator
from forgekeeper.memory.events import event_from_text


def test_typo_replacement():
    agent = TehTypoAgent()
    orch = MemoryOrchestrator([agent])
    text = "This is teh best. Another teh here."
    event = event_from_text("user_prompt", text)
    suggestions = orch.handle(event)
    patched = orch.apply_patches(text, suggestions)
    assert patched == "This is the best. Another the here."


def test_no_identifier_url_changes():
    agent = TehTypoAgent()
    orch = MemoryOrchestrator([agent])
    text = "var teh_var = 1; visit http://teh.com"  # identifiers and URLs should remain
    event = event_from_text("agent_output", text)
    suggestions = orch.handle(event)
    patched = orch.apply_patches(text, suggestions)
    assert "teh_var" in patched and "http://teh.com" in patched
    assert " the_var" not in patched


def test_multiple_occurrences_stable():
    agent = TehTypoAgent()
    orch = MemoryOrchestrator([agent])
    text = "teh teh teh"
    event = event_from_text("user_prompt", text)
    suggestions = orch.handle(event)
    patched = orch.apply_patches(text, suggestions)
    assert patched == "the the the"
