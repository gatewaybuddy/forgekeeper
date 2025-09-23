"""In-memory buffers for orchestrator event tracking."""

from __future__ import annotations

from collections import deque
from typing import Deque, List

from .events import Event


class Buffers:
    def __init__(self, maxlen: int = 1000) -> None:
        self.B_raw: Deque[Event] = deque(maxlen=maxlen)
        self.S_running: List[str] = []

    def append(self, event: Event) -> None:
        self.B_raw.append(event)

    def window_since(self, min_seq: int) -> list[Event]:
        return [event for event in self.B_raw if event.seq > min_seq]


__all__ = ["Buffers"]
