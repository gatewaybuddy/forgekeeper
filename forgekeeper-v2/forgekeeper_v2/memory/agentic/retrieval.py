from __future__ import annotations

from typing import Iterable
from .persistence import AgenticStore


class Retriever:
    def __init__(self, store: AgenticStore | None = None) -> None:
        self.store = store or AgenticStore()

    def context_from_bullets(self, bullets: Iterable[str], limit: int = 8) -> str:
        items = list(bullets)[-limit:]
        summary = " ".join(items)
        self.store.set_fact("last_context", summary)
        return summary

    def last_context(self) -> str | None:
        return self.store.get_fact("last_context")
