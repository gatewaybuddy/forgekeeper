from __future__ import annotations

import re
from typing import Any, List

from ..base import Event, Suggestion
from ..registry import register


class DocstringStyleNudge:
    id = "mem.heuristic.docstring-style"
    kind = "heuristic"
    cost_cap = 1.0
    confidence = 0.6
    modes = {"interactive", "deepthink"}

    _passive = re.compile(r"\b(?:is|was|were|be|been|being)\s+\w+ed\b", re.IGNORECASE)

    def system_prompt(self) -> str:
        return "Encourages concise, active voice docstrings with line length ≤80 characters."

    def match(self, event: Event) -> bool:
        if event.kind not in {"agent_output", "user_prompt"}:
            return False
        text = event.payload.get("text", "")
        return self._has_long_docstring(text) or bool(self._passive.search(text))

    def _has_long_docstring(self, text: str) -> bool:
        for block in re.findall(r'"""(.*?)"""', text, re.DOTALL):
            for line in block.splitlines():
                if len(line) > 80:
                    return True
        return False

    def act(self, event: Event) -> List[Suggestion]:
        return [
            Suggestion(
                type="prompt_aug",
                content="Prefer concise, active voice; line length ≤80 cols for docstrings",
                agent_id=self.id,
                confidence=self.confidence,
            )
        ]

    def learn(self, feedback: dict[str, Any]) -> None:  # pragma: no cover
        pass


register(DocstringStyleNudge())
