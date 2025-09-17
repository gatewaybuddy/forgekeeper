"""Memory orchestrator which coordinates agents and applies suggestions."""

from __future__ import annotations

from dataclasses import asdict
from typing import Dict, Iterable, List, Literal

from .base import Event, MemoryAgent, RetrievalProvider, Suggestion
from .metrics import append_op, increment
from .reflector import Reflector

_TYPE_RANK = {
    "patch": 0,
    "prompt_aug": 1,
    "annotation": 2,
    "route": 3,
    "score": 4,
}


class MemoryOrchestrator:
    """Coordinates memory agents and ranks their suggestions."""

    def __init__(
        self,
        agents: Iterable[MemoryAgent],
        mode: Literal["interactive", "deepthink"] = "interactive",
        retriever: RetrievalProvider | None = None,
    ) -> None:
        self.agents = list(agents)
        self.mode = mode
        self.retriever = retriever
        self.reflector = Reflector()

    # ------------------------------------------------------------------
    def handle(self, event: Event) -> List[Suggestion]:
        """Return ranked suggestions for ``event``."""

        suggestions: List[Suggestion] = []
        for agent in self.agents:
            modes = getattr(agent, "modes", {"interactive", "deepthink"})
            if self.mode not in modes:
                continue
            if not agent.match(event):
                continue
            acts = agent.act(event, self.retriever)
            for s in acts:
                if not s.agent_id:
                    s.agent_id = agent.id
                if not s.confidence:
                    s.confidence = agent.confidence
                suggestions.append(s)
                increment(agent.id, "proposed")
        suggestions = self._merge_patches(suggestions)
        if self.mode == "interactive":
            suggestions = self.reflector.review(suggestions, event)
        suggestions.sort(
            key=lambda s: (_TYPE_RANK.get(s.kind, 99), -s.confidence, s.agent_id)
        )
        return suggestions

    # ------------------------------------------------------------------
    def _merge_patches(self, suggestions: List[Suggestion]) -> List[Suggestion]:
        patches = [s for s in suggestions if s.kind == "patch" and s.span]
        others = [s for s in suggestions if s.kind != "patch" or not s.span]
        patches.sort(key=lambda s: (-s.confidence, s.span[0]))
        kept: List[Suggestion] = []
        used: List[tuple[int, int]] = []
        for s in patches:
            start, end = s.span  # type: ignore[misc]
            if all(end <= u0 or start >= u1 for (u0, u1) in used):
                kept.append(s)
                used.append((start, end))
        kept.sort(key=lambda s: s.span[0])
        return kept + others

    # ------------------------------------------------------------------
    def apply_patches(self, text: str, suggestions: Iterable[Suggestion]) -> str:
        patches = [
            s
            for s in suggestions
            if s.kind == "patch" and s.span and "replacement" in s.data
        ]
        patches.sort(key=lambda s: s.span[0])
        result: List[str] = []
        last = 0
        for s in patches:
            start, end = s.span
            result.append(text[last:start])
            result.append(str(s.data["replacement"]))
            last = end
            increment(s.agent_id, "applied")
            append_op({"agent_id": s.agent_id, "suggestion": asdict(s)})
        result.append(text[last:])
        return "".join(result)

    # ------------------------------------------------------------------
    def metrics_snapshot(self) -> Dict[str, Dict[str, int]]:
        from .metrics import snapshot

        return snapshot()
