from dataclasses import dataclass

from forgekeeper.memory.agentic.base import Event, Suggestion
from forgekeeper.memory.agentic.orchestrator import MemoryOrchestrator


@dataclass
class DummyAgent:
    id: str
    kind: str = "reflex"
    cost_cap: float = 1.0
    confidence: float = 0.5
    modes = {"interactive", "deepthink"}
    suggestion: Suggestion | None = None

    def system_prompt(self) -> str:
        return ""

    def match(self, event: Event) -> bool:
        return True

    def act(self, event: Event):
        return [self.suggestion] if self.suggestion else []

    def learn(self, feedback):
        pass


def test_ranking_and_merge():
    patches = [
        Suggestion(
            "patch", "p1", span=(0, 3), replacement="AAA", agent_id="a1", confidence=0.9
        ),
        Suggestion(
            "patch", "p2", span=(0, 3), replacement="BBB", agent_id="a2", confidence=0.5
        ),
    ]
    agents = [
        DummyAgent("a1", suggestion=patches[0]),
        DummyAgent("a2", suggestion=patches[1]),
        DummyAgent(
            "a3", suggestion=Suggestion("prompt_aug", "", agent_id="a3", confidence=0.4)
        ),
        DummyAgent(
            "a4", suggestion=Suggestion("annotation", "", agent_id="a4", confidence=0.4)
        ),
        DummyAgent(
            "a5", suggestion=Suggestion("route", "", agent_id="a5", confidence=0.4)
        ),
        DummyAgent(
            "a6", suggestion=Suggestion("score", "", agent_id="a6", confidence=0.4)
        ),
    ]
    orch = MemoryOrchestrator(agents)
    event = Event("x", {"text": "abc"})
    suggestions = orch.handle(event)
    assert [s.type for s in suggestions] == [
        "patch",
        "prompt_aug",
        "annotation",
        "route",
        "score",
    ]
    assert suggestions[0].replacement == "AAA"
    result = orch.apply_patches("abc", suggestions)
    assert result == "AAA"
