from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, List, Literal

from .base import Event, MemoryAgent, Suggestion


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
    ) -> None:
        self.agents = list(agents)
        self.mode = mode
        self.metrics: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"proposed": 0, "applied": 0}
        )

    def handle(self, event: Event) -> List[Suggestion]:
        suggestions: List[Suggestion] = []
        for agent in self.agents:
            modes = getattr(agent, "modes", {"interactive", "deepthink"})
            if self.mode not in modes:
                continue
            if not agent.match(event):
                continue
            acts = agent.act(event)
            for s in acts:
                if not s.agent_id:
                    s.agent_id = agent.id
                if not s.confidence:
                    s.confidence = agent.confidence
                suggestions.append(s)
            self.metrics[agent.id]["proposed"] += len(acts)

        # merge overlapping patches preferring higher confidence
        suggestions = self._merge_patches(suggestions)
        suggestions.sort(key=lambda s: (_TYPE_RANK.get(s.type, 99), -s.confidence))
        return suggestions

    def _merge_patches(self, suggestions: List[Suggestion]) -> List[Suggestion]:
        patches = [s for s in suggestions if s.type == "patch" and s.span]
        others = [s for s in suggestions if s.type != "patch" or not s.span]
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

    def apply_patches(self, text: str, suggestions: Iterable[Suggestion]) -> str:
        patches = [
            s
            for s in suggestions
            if s.type == "patch" and s.span and s.replacement is not None
        ]
        patches.sort(key=lambda s: s.span[0])
        result = []
        last = 0
        for s in patches:
            start, end = s.span
            result.append(text[last:start])
            result.append(s.replacement)
            last = end
            self.metrics[s.agent_id]["applied"] += 1
        result.append(text[last:])
        return "".join(result)

    def metrics_snapshot(self) -> Dict[str, Dict[str, int]]:
        return {k: dict(v) for k, v in self.metrics.items()}
