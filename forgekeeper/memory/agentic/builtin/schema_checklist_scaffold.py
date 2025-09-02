from __future__ import annotations

from typing import Any, List

from ..base import Event, Suggestion
from ..registry import register


class SchemaChecklistScaffold:
    id = "mem.scaffold.schema-checklist"
    kind = "scaffold"
    cost_cap = 1.0
    confidence = 0.5
    modes = {"deepthink"}

    def system_prompt(self) -> str:
        return (
            "When schema files change, remind about created_at/updated_at fields, "
            "soft-delete flags, and migration notes."
        )

    def match(self, event: Event) -> bool:
        paths = event.meta.get("paths", [])
        return any("schema" in p for p in paths)

    def act(self, event: Event) -> List[Suggestion]:
        content = (
            "- has created_at/updated_at\n" "- soft-delete flags\n" "- migration notes"
        )
        return [
            Suggestion(
                type="annotation",
                content=content,
                agent_id=self.id,
                confidence=self.confidence,
            )
        ]

    def learn(self, feedback: dict[str, Any]) -> None:  # pragma: no cover
        pass


register(SchemaChecklistScaffold())
