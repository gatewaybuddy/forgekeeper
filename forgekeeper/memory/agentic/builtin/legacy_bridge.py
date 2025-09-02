from __future__ import annotations

import re
from typing import Any, List

from ..base import Event, Suggestion
from ..registry import register


class LegacyRegexAgent:
    """Adapter turning a legacy regex rule into a memory agent."""

    kind = "legacy"
    cost_cap = 1.0
    confidence = 0.5
    modes = {"interactive", "deepthink"}

    def __init__(
        self, pattern: str, message: str, agent_id: str = "mem.legacy.regex"
    ) -> None:
        self.id = agent_id
        self._pattern = re.compile(pattern)
        self._message = message

    def system_prompt(self) -> str:
        return f"Legacy regex rule: {self._pattern.pattern}"

    def match(self, event: Event) -> bool:
        text = event.payload.get("text", "")
        return bool(self._pattern.search(text))

    def act(self, event: Event) -> List[Suggestion]:
        return [
            Suggestion(
                type="annotation",
                content=self._message,
                agent_id=self.id,
                confidence=self.confidence,
            )
        ]

    def learn(self, feedback: dict[str, Any]) -> None:  # pragma: no cover
        pass


register(LegacyRegexAgent(r"TODO", "Legacy rule: remove TODO comments"))
