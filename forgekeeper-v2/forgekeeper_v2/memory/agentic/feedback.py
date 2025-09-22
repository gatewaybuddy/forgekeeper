from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from .persistence import AgenticStore


@dataclass
class Feedback:
    kind: str
    message: str
    meta: dict[str, Any] | None = None


class FeedbackLog:
    def __init__(self, store: AgenticStore | None = None) -> None:
        self.store = store or AgenticStore()

    def log(self, fb: Feedback) -> None:
        item = {"kind": fb.kind, "message": fb.message, "meta": fb.meta or {}}
        self.store.append_feedback(item)

    def note(self, kind: str, message: str, **meta: Any) -> None:
        self.log(Feedback(kind=kind, message=message, meta=meta))

    def recent(self, limit: int = 10) -> list[dict[str, Any]]:
        return self.store.recent_feedback(limit)
