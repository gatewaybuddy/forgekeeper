"""Simple reflection/guard layer for suggestions."""

from __future__ import annotations

import re
from typing import List

from .base import Event, Suggestion

_URL_RE = re.compile(r"https?://")


class Reflector:
    """Reviews suggestions and removes risky patches."""

    def review(self, suggestions: List[Suggestion], event: Event) -> List[Suggestion]:
        text = event.payload.get("text", "")
        kept: List[Suggestion] = []
        for s in suggestions:
            if s.kind != "patch" or not s.span:
                kept.append(s)
                continue
            start, end = s.span
            if _URL_RE.search(text[max(0, start - 10) : end + 10]):
                continue
            before = text[start - 1 : start]
            after = text[end : end + 1]
            if (before and (before.isalnum() or before == "_")) or (
                after and (after.isalnum() or after == "_")
            ):
                # looks like part of identifier or URL
                continue
            kept.append(s)
        return kept
