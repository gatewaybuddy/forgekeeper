import ast

from forgekeeper.memory.agentic.base import Suggestion
from forgekeeper.memory.agentic.orchestrator import MemoryOrchestrator


def test_docstring_patch():
    code = (
        "def foo():\n"
        '    """This is a very very long docstring that should be shortened."""\n'
        "    return 1\n"
    )
    start = code.index("This is a very very long docstring that should be shortened.")
    end = start + len("This is a very very long docstring that should be shortened.")
    sug = Suggestion(
        kind="patch",
        data={"replacement": "Short doc"},
        span=(start, end),
        agent_id="a",
        confidence=0.9,
    )
    orch = MemoryOrchestrator([])
    patched = orch.apply_patches(code, [sug])
    assert "Short doc" in patched
    ast.parse(patched)
