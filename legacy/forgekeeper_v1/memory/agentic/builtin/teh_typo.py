"""Built-in agent that corrects the common ``teh`` typo."""

from __future__ import annotations

import re
from typing import Any, List

from ..base import Event, Suggestion
from ..registry import register


class TehTypoAgent:
    """Token safe replacement of ``teh`` → ``the``."""

    id = "mem.reflex.teh-typo"
    kind = "reflex"
    cost_cap = 1.0
    confidence = 0.85
    modes = {"interactive", "deepthink"}

    _pattern = re.compile(r"\bteh\b", re.IGNORECASE)

    def system_prompt(self) -> str:  # pragma: no cover - trivial
        return "Replace the common typo 'teh' with 'the' while avoiding identifiers and URLs."

    def match(self, event: Event) -> bool:
        text = event.payload.get("text", "")
        return bool(self._pattern.search(text))

    def act(self, event: Event, retriever=None) -> List[Suggestion]:
        text = event.payload.get("text", "")
        suggestions: List[Suggestion] = []
        for match in self._pattern.finditer(text):
            start, end = match.span()
            before = text[max(0, start - 8) : start]
            if "http" in before:
                # URLs are ignored
                continue
            suggestions.append(
                Suggestion(
                    kind="patch",
                    data={"replacement": "the", "description": "teh→the"},
                    span=(start, end),
                    agent_id=self.id,
                    confidence=self.confidence,
                )
            )
        return suggestions

    def learn(self, feedback: dict[str, Any]) -> None:
        delta = feedback.get("delta_confidence")
        if isinstance(delta, (int, float)):
            self.confidence = max(0.0, min(1.0, self.confidence + float(delta)))


register(TehTypoAgent())
