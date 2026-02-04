"""Helpers for condensing event streams into bullet summaries."""

from __future__ import annotations

from typing import Iterable, List

from .events import Event


def compact(events: Iterable[Event], limit: int = 40) -> List[str]:
    bullets: List[str] = []
    for event in events:
        if event.act == "THINK":
            continue
        text = event.text.strip()
        if not text:
            continue
        bullets.append(f"[{event.role}:{event.stream}:{event.act}] {text}")
        if len(bullets) >= limit:
            break
    return bullets


__all__ = ["compact"]
