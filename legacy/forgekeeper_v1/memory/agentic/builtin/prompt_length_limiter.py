from __future__ import annotations

from typing import Any, List

from ..base import Event, Suggestion
from ..registry import register


class PromptLengthLimiter:
    id = "mem.reflex.prompt-length"
    kind = "reflex"
    cost_cap = 1.0
    confidence = 0.7
    limit = 6000
    modes = {"interactive", "deepthink"}

    def system_prompt(self) -> str:
        return "Warns when prompts exceed length limits and suggests summarisation."

    def match(self, event: Event) -> bool:
        text = event.payload.get("text", "")
        return len(text) > self.limit

    def act(self, event: Event) -> List[Suggestion]:
        return [
            Suggestion(
                type="prompt_aug",
                content="Keep instructions concise; summarize non-essential context",
                agent_id=self.id,
                confidence=self.confidence,
            )
        ]

    def learn(self, feedback: dict[str, Any]) -> None:  # pragma: no cover - simple
        pass


register(PromptLengthLimiter())
