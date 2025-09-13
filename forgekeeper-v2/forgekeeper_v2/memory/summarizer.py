from __future__ import annotations

from typing import Iterable, List

from forgekeeper_v2.orchestrator.events import Event


def compact(events: Iterable[Event], limit: int = 40) -> List[str]:
    bullets: List[str] = []
    for e in events:
        if e.act == "THINK":
            continue
        text = e.text.strip()
        if not text:
            continue
        bullets.append(f"[{e.role}:{e.stream}:{e.act}] {text}")
        if len(bullets) >= limit:
            break
    return bullets

